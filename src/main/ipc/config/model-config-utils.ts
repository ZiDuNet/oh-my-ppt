import {
  MODEL_TIMEOUT_PROFILES,
  resolveModelTimeoutMs,
  type ModelTimeoutProfile
} from '@shared/model-timeout'
import type { IpcContext } from '../context'
import { readAppLocale, uiText } from '../config/locale-utils'
import log from 'electron-log/main.js'

export interface ActiveModelConfig {
  id: string
  name: string
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  maxTokens: number
}

export async function resolveGlobalModelTimeouts(
  ctx: Pick<IpcContext, 'db'>
): Promise<Record<ModelTimeoutProfile, number>> {
  const settings = await ctx.db.getAllSettings()
  return Object.fromEntries(
    MODEL_TIMEOUT_PROFILES.map((profile) => [
      profile,
      resolveModelTimeoutMs(settings[`timeout_ms_${profile}`], profile)
    ])
  ) as Record<ModelTimeoutProfile, number>
}

export async function resolveActiveModelConfig(
  ctx: Pick<IpcContext, 'db' | 'decryptApiKey'>
): Promise<ActiveModelConfig> {
  const locale = await readAppLocale(ctx)
  const config = await ctx.db.getActiveModelConfig()
  if (!config) {
    throw new Error(
      uiText(
        locale,
        '请先前往系统设置添加并启用一个模型。',
        'Add and activate a model in Settings first.'
      )
    )
  }
  const provider = String(config.provider || '').trim()
  const model = String(config.model || '').trim()
  const apiKey = ctx.decryptApiKey(config.apiKey).trim()
  if (!provider) {
    throw new Error(
      uiText(
        locale,
        '当前启用模型缺少 provider，请到设置页检查。',
        'The active model is missing provider. Check Settings.'
      )
    )
  }
  if (!model) {
    throw new Error(
      uiText(
        locale,
        '当前启用模型缺少 model，请到设置页检查。',
        'The active model is missing model. Check Settings.'
      )
    )
  }
  if (!apiKey) {
    throw new Error(
      uiText(
        locale,
        '当前启用模型缺少 api_key，请到设置页检查。',
        'The active model is missing api_key. Check Settings.'
      )
    )
  }

  return {
    id: config.id,
    name: config.name,
    provider,
    model,
    apiKey,
    baseUrl: String(config.baseUrl || '').trim(),
    maxTokens: config.maxTokens || 4096
  }
}

export async function resolveVisionModelConfig(
  ctx: Pick<IpcContext, 'db' | 'decryptApiKey'>
): Promise<ActiveModelConfig> {
  const settings = await ctx.db.getAllSettings()
  const visionModelId = typeof settings.vision_model_id === 'string' ? settings.vision_model_id.trim() : ''
  if (visionModelId) {
    const config = await ctx.db.getModelConfigById(visionModelId)
    if (config) {
      const provider = String(config.provider || '').trim()
      const model = String(config.model || '').trim()
      const apiKey = ctx.decryptApiKey(config.apiKey).trim()
      if (provider && model && apiKey) {
        log.info('[vision-model] using dedicated vision model', { id: config.id, provider, model })
        return {
          id: config.id,
          name: config.name,
          provider,
          model,
          apiKey,
          baseUrl: String(config.baseUrl || '').trim(),
          maxTokens: config.maxTokens ?? 0
        }
      }
      log.warn('[vision-model] vision model config incomplete, falling back to active model', { id: visionModelId })
    }
  }
  log.info('[vision-model] no dedicated vision model, falling back to active model')
  return resolveActiveModelConfig(ctx)
}
