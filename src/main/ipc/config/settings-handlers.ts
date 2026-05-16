import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import log from 'electron-log/main.js'
import { resolveModel } from '../../agent'
import type { IpcContext } from '../context'
import {
  CONFIGURABLE_MODEL_TIMEOUT_PROFILES,
  type ConfigurableModelTimeoutProfile,
  resolveModelTimeoutMs
} from '@shared/model-timeout'
import { readAppLocale, uiText } from '../config/locale-utils'
import * as newapi from '../../services/newapi'

const NEWAPI_BASE_URL = 'https://new-api.chaoxi.live/v1'

const readGlobalTimeouts = (
  settings: Record<string, unknown>
): Record<ConfigurableModelTimeoutProfile, number> =>
  Object.fromEntries(
    CONFIGURABLE_MODEL_TIMEOUT_PROFILES.map((profile) => [
      profile,
      resolveModelTimeoutMs(settings[`timeout_ms_${profile}`], profile)
    ])
  ) as Record<ConfigurableModelTimeoutProfile, number>

const normalizeProvider = (provider: unknown): 'anthropic' | 'openai' =>
  provider === 'anthropic' ? 'anthropic' : 'openai'

export function registerSettingsHandlers(ctx: IpcContext): void {
  const { mainWindow, db, encryptApiKey, decryptApiKey } = ctx

  ipcMain.handle('app:getVersion', async () => {
    return { version: app.getVersion() }
  })

  ipcMain.handle('settings:get', async () => {
    log.info('[settings:get] requested')
    const settings = await db.getAllSettings()
    const storagePath =
      typeof settings.storage_path === 'string' && settings.storage_path.trim().length > 0
        ? settings.storage_path.trim()
        : ''
    return {
      theme: settings.theme || 'light',
      locale: settings.locale === 'en' ? 'en' : 'zh',
      storagePath,
      timeouts: readGlobalTimeouts(settings),
      visionModelId: typeof settings.vision_model_id === 'string' ? settings.vision_model_id : '',
      stylesCloudUrl: typeof settings.styles_cloud_url === 'string' && settings.styles_cloud_url.trim()
        ? settings.styles_cloud_url
        : 'https://wushuo.oss-cn-beijing.aliyuncs.com/PPTStyle/pptstyles.json'
    }
  })

  ipcMain.handle('settings:listModelConfigs', async () => {
    return (await db.listModelConfigs()).map((config) => ({
      id: config.id,
      name: config.name,
      provider: config.provider,
      model: config.model,
      apiKey: decryptApiKey(config.apiKey),
      baseUrl: config.baseUrl,
      active: config.active === 1,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    }))
  })

  ipcMain.handle('settings:validateUploadPrerequisites', async () => {
    const locale = await readAppLocale(ctx)
    const settings = await db.getAllSettings()
    const storagePath =
      typeof settings.storage_path === 'string' && settings.storage_path.trim().length > 0
        ? settings.storage_path.trim()
        : ''
    const activeModel = (await db.listModelConfigs()).find((config) => config.active === 1)
    const hasModel = !!activeModel
    const hasApiKey = typeof activeModel?.apiKey === 'string' && decryptApiKey(activeModel.apiKey).trim().length > 0
    const hasModelName = typeof activeModel?.model === 'string' && activeModel.model.trim().length > 0

    const missing: Array<'storagePath' | 'activeModel' | 'apiKey' | 'model'> = []
    if (!storagePath) missing.push('storagePath')
    if (!hasModel) missing.push('activeModel')
    if (hasModel && !hasApiKey) missing.push('apiKey')
    if (hasModel && !hasModelName) missing.push('model')

    return {
      ready: missing.length === 0,
      missing,
      message:
        missing.length === 0
          ? ''
          : uiText(
              locale,
              '请先前往系统设置完成模型与存储目录配置。',
              'Please complete model and storage configuration in Settings first.'
            )
    }
  })

  ipcMain.handle('settings:save', async (_event, settings) => {
    log.info('[settings:save] received', {
      hasStoragePath:
        typeof settings?.storagePath === 'string' && settings.storagePath.trim().length > 0
    })
    if (settings.theme !== undefined) await db.setSetting('theme', settings.theme)
    if (settings.locale === 'zh' || settings.locale === 'en')
      await db.setSetting('locale', settings.locale)
    if (typeof settings.storagePath === 'string' && settings.storagePath.trim().length > 0) {
      await db.setStoragePath(settings.storagePath)
    }
    if (settings.timeouts && typeof settings.timeouts === 'object') {
      const timeouts = settings.timeouts as Partial<
        Record<ConfigurableModelTimeoutProfile, unknown>
      >
      for (const profile of CONFIGURABLE_MODEL_TIMEOUT_PROFILES) {
        const value = timeouts[profile]
        if (value !== undefined) {
          await db.setSetting(`timeout_ms_${profile}`, resolveModelTimeoutMs(value, profile))
        }
      }
    }
    if ('visionModelId' in settings) {
      await db.setSetting('vision_model_id', String(settings.visionModelId ?? ''))
    }
    if ('stylesCloudUrl' in settings) {
      await db.setSetting('styles_cloud_url', String(settings.stylesCloudUrl ?? ''))
    }
    return { success: true }
  })

  ipcMain.handle('settings:upsertModelConfig', async (_event, payload) => {
    const locale = await readAppLocale(ctx)
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const provider = normalizeProvider(record.provider)
    const model = typeof record.model === 'string' ? record.model.trim() : ''
    const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : ''
    const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim() : ''
    const id =
      typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : undefined
    if (!name) throw new Error(uiText(locale, '请填写模型名称。', 'Enter model name.'))
    if (!model) throw new Error(uiText(locale, '请填写 model。', 'Enter model.'))
    if (!apiKey) throw new Error(uiText(locale, '请填写 api_key。', 'Enter api_key.'))
    const savedId = await db.upsertModelConfig({
      id,
      name,
      provider,
      model,
      apiKey: encryptApiKey(apiKey),
      baseUrl,
      active: record.active === true
    })
    return { success: true, id: savedId }
  })

  ipcMain.handle('settings:setActiveModelConfig', async (_event, id) => {
    const locale = await readAppLocale(ctx)
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error(uiText(locale, '模型配置 ID 不能为空。', 'Model config ID is required.'))
    }
    const modelId = id.trim()
    try {
      await db.setActiveModelConfig(modelId)
    } catch (error) {
      if (error instanceof Error && error.message === 'Model config does not exist') {
        throw new Error(uiText(locale, '模型配置不存在。', 'Model config does not exist.'))
      }
      throw error
    }
    return { success: true }
  })

  ipcMain.handle('settings:deleteModelConfig', async (_event, id) => {
    const locale = await readAppLocale(ctx)
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error(uiText(locale, '模型配置 ID 不能为空。', 'Model config ID is required.'))
    }
    try {
      await db.deleteModelConfig(id.trim())
    } catch (error) {
      if (error instanceof Error && error.message === 'Model config does not exist') {
        throw new Error(uiText(locale, '模型配置不存在。', 'Model config does not exist.'))
      }
      throw error
    }
    return { success: true }
  })

  ipcMain.handle(
    'settings:verifyApiKey',
    async (_event, { provider, apiKey, model, baseUrl, timeoutMs }) => {
      const locale = await readAppLocale(ctx)
      const resolvedTimeoutMs = resolveModelTimeoutMs(timeoutMs, 'verify')
      log.info('[settings:verifyApiKey] received', {
        provider,
        model,
        hasApiKey: typeof apiKey === 'string' && apiKey.trim().length > 0,
        baseUrl: typeof baseUrl === 'string' ? baseUrl : '',
        timeoutMs: resolvedTimeoutMs
      })

      if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return {
          valid: false,
          message: uiText(locale, '请先填写 api_key。', 'Enter api_key first.')
        }
      }
      if (typeof model !== 'string' || model.trim().length === 0) {
        return { valid: false, message: uiText(locale, '请先填写 model。', 'Enter model first.') }
      }

      try {
        const client = resolveModel(
          provider,
          apiKey.trim(),
          model.trim(),
          typeof baseUrl === 'string' ? baseUrl.trim() : ''
        )
        await client.invoke('Reply with OK.', {
          signal: AbortSignal.timeout(resolvedTimeoutMs)
        })
        log.info('[settings:verifyApiKey] success', { provider, model })
        return { valid: true, message: uiText(locale, '连接验证成功。', 'Connection verified.') }
      } catch (error) {
        const message =
          error instanceof Error && error.message.length > 0
            ? error.message
            : uiText(
                locale,
                '连接验证失败，请检查 api_key、model 或 base_url。',
                'Connection verification failed. Check api_key, model, or base_url.'
              )
        log.error('[settings:verifyApiKey] failed', {
          provider,
          model,
          baseUrl: typeof baseUrl === 'string' ? baseUrl : '',
          message
        })
        return { valid: false, message }
      }
    }
  )

  ipcMain.handle('settings:chooseStoragePath', async (event) => {
    log.info('[settings:chooseStoragePath] received')
    const targetWindow =
      BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? mainWindow

    try {
      const settings = await db.getAllSettings()
      const currentStoragePath =
        typeof settings.storage_path === 'string' && settings.storage_path.trim().length > 0
          ? settings.storage_path.trim()
          : ''
      const result = await dialog.showOpenDialog(targetWindow, {
        title: '选择 OhMYPPT 存储目录',
        buttonLabel: '选择目录',
        ...(currentStoragePath ? { defaultPath: currentStoragePath } : {}),
        properties: ['openDirectory', 'createDirectory', 'promptToCreate']
      })
      if (!result.canceled && result.filePaths.length > 0) {
        return { path: result.filePaths[0] }
      }
      return { path: null }
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : '无法打开系统目录选择器。'
      log.error('[settings:chooseStoragePath] failed', { message })
      return { path: null, error: message }
    }
  })

  // ---------- NewAPI handlers ----------

  /** 登录 NewAPI：登录 → 确保令牌 → 写入 model_configs */
  ipcMain.handle('newapi:login', async (_event, { username, password }) => {
    const locale = await readAppLocale(ctx)
    log.info('[newapi:login] attempt', { username })
    try {
      const loginResult = await newapi.login(username, password)
      const session = { cookie: loginResult.cookie, userId: loginResult.userId }

      // 获取用户信息
      const userInfo = await newapi.getUserInfo(session)

      // 确保令牌存在，拿到 api key
      const { tokenId, apiKey } = await newapi.ensureToken(session)

      // 通过 OpenAI 标准接口获取可用模型
      const models = await newapi.getModelsByApiKey(apiKey)

      // 持久化 session 信息
      await db.setSetting('newapi_session_cookie', loginResult.cookie)
      await db.setSetting('newapi_user_id', String(loginResult.userId))
      await db.setSetting('newapi_token_id', String(tokenId))
      await db.setSetting('newapi_username', loginResult.username)
      await db.setSetting('newapi_display_name', loginResult.displayName)

      // 自动创建/更新 model_config（openai 兼容格式）
      const modelIds = models.map((m) => m.id)
      const defaultModel = modelIds.includes('gpt-4o-mini') ? 'gpt-4o-mini' : modelIds[0] || ''
      const existing = (await db.listModelConfigs()).find(
        (c) => c.name === 'chaoxi-ppt' || c.baseUrl === NEWAPI_BASE_URL
      )
      if (existing) {
        await db.upsertModelConfig({
          id: existing.id,
          name: 'chaoxi-ppt',
          provider: 'openai',
          model: defaultModel,
          apiKey: encryptApiKey(apiKey),
          baseUrl: NEWAPI_BASE_URL,
          active: true
        })
      } else {
        await db.upsertModelConfig({
          name: 'chaoxi-ppt',
          provider: 'openai',
          model: defaultModel,
          apiKey: encryptApiKey(apiKey),
          baseUrl: NEWAPI_BASE_URL,
          active: true
        })
      }

      log.info('[newapi:login] success', { userId: loginResult.userId, modelCount: models.length })

      return {
        success: true,
        userInfo: {
          id: userInfo.id,
          username: userInfo.username,
          displayName: userInfo.display_name,
          quota: userInfo.quota,
          usedQuota: userInfo.used_quota,
          status: userInfo.status
        },
        models
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : uiText(locale, '登录失败，请检查用户名和密码。', 'Login failed. Check username and password.')
      log.error('[newapi:login] failed', { message })
      return { success: false, message }
    }
  })

  /** 注册 NewAPI */
  ipcMain.handle('newapi:register', async (_event, { username, password, email }) => {
    const locale = await readAppLocale(ctx)
    try {
      await newapi.register(username, password, email)
      return { success: true }
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : uiText(locale, '注册失败。', 'Registration failed.')
      log.error('[newapi:register] failed', { message })
      return { success: false, message }
    }
  })

  /** 获取 NewAPI 登录状态 */
  ipcMain.handle('newapi:getStatus', async () => {
    const settings = await db.getAllSettings()
    const cookie = typeof settings.newapi_session_cookie === 'string' ? settings.newapi_session_cookie : ''
    const userId = typeof settings.newapi_user_id === 'string' ? Number(settings.newapi_user_id) : 0
    if (!cookie || !userId) {
      return { loggedIn: false }
    }
    try {
      const session = { cookie, userId }
      const userInfo = await newapi.getUserInfo(session)
      return {
        loggedIn: true,
        userInfo: {
          id: userInfo.id,
          username: userInfo.username,
          displayName: userInfo.display_name,
          quota: userInfo.quota,
          usedQuota: userInfo.used_quota,
          status: userInfo.status
        }
      }
    } catch {
      // session 过期
      return { loggedIn: false }
    }
  })

  /** 获取可用模型列表 */
  ipcMain.handle('newapi:getModels', async () => {
    const existing = (await db.listModelConfigs()).find(
      (c) => c.name === 'chaoxi-ppt' || c.baseUrl === NEWAPI_BASE_URL
    )
    if (!existing) {
      return { success: false, message: 'Not logged in' }
    }
    try {
      const apiKey = decryptApiKey(existing.apiKey)
      const models = await newapi.getModelsByApiKey(apiKey)
      return { success: true, models }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get models'
      return { success: false, message }
    }
  })

  /** 更新选择的模型 */
  ipcMain.handle('newapi:setModel', async (_event, { model }) => {
    const locale = await readAppLocale(ctx)
    const existing = (await db.listModelConfigs()).find(
      (c) => c.name === 'chaoxi-ppt' || c.baseUrl === NEWAPI_BASE_URL
    )
    if (!existing) {
      throw new Error(uiText(locale, '请先登录。', 'Please login first.'))
    }
    await db.upsertModelConfig({
      id: existing.id,
      name: existing.name,
      provider: existing.provider,
      model,
      apiKey: existing.apiKey,
      baseUrl: existing.baseUrl,
      active: existing.active === 1
    })
    return { success: true }
  })

  /** 退出登录：删除令牌 → 登出 → 清除本地 */
  ipcMain.handle('newapi:logout', async () => {
    const settings = await db.getAllSettings()
    const cookie = typeof settings.newapi_session_cookie === 'string' ? settings.newapi_session_cookie : ''
    const userId = typeof settings.newapi_user_id === 'string' ? Number(settings.newapi_user_id) : 0
    const tokenId = typeof settings.newapi_token_id === 'string' ? Number(settings.newapi_token_id) : 0

    if (cookie && userId) {
      const session = { cookie, userId }
      try {
        if (tokenId) await newapi.deleteToken(session, tokenId)
        await newapi.logout(session)
      } catch (error) {
        log.warn('[newapi:logout] remote logout failed', { error })
      }
    }

    // 清除本地 session
    await db.setSetting('newapi_session_cookie', '')
    await db.setSetting('newapi_user_id', '')
    await db.setSetting('newapi_token_id', '')
    await db.setSetting('newapi_username', '')
    await db.setSetting('newapi_display_name', '')

    // 删除对应的 model_config
    const existing = (await db.listModelConfigs()).find(
      (c) => c.name === 'chaoxi-ppt' || c.baseUrl === NEWAPI_BASE_URL
    )
    if (existing) {
      await db.deleteModelConfig(existing.id)
    }

    log.info('[newapi:logout] done')
    return { success: true }
  })

  /** 刷新用户信息（检查余额等） */
  ipcMain.handle('newapi:refreshUser', async () => {
    const settings = await db.getAllSettings()
    const cookie = typeof settings.newapi_session_cookie === 'string' ? settings.newapi_session_cookie : ''
    const userId = typeof settings.newapi_user_id === 'string' ? Number(settings.newapi_user_id) : 0
    if (!cookie || !userId) {
      return { success: false }
    }
    try {
      const userInfo = await newapi.getUserInfo({ cookie, userId })
      return {
        success: true,
        userInfo: {
          id: userInfo.id,
          username: userInfo.username,
          displayName: userInfo.display_name,
          quota: userInfo.quota,
          usedQuota: userInfo.used_quota,
          status: userInfo.status
        }
      }
    } catch {
      return { success: false }
    }
  })
}
