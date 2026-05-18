import { create } from 'zustand'
import { ipc, type ModelConfig, type NewApiUserInfo, type ModelInfo, type NewApiLogItem } from '@renderer/lib/ipc'
import type { ConfigurableModelTimeoutProfile } from '@shared/model-timeout.js'

interface Settings {
  theme: string
  locale: 'zh' | 'en'
  storagePath: string
  timeouts: Record<ConfigurableModelTimeoutProfile, number>
  visionModelId: string
  stylesCloudUrl: string
}

/** NewAPI Token 用量 */
interface NewApiTokenUsage {
  name: string
  usedQuota: number
  remainQuota: number
  unlimitedQuota: boolean
  status: number
  accessedTime: number
}

/** NewAPI 订阅信息 */
interface NewApiSubscriptionItem {
  id: number
  planId: number
  status: string
  amountTotal: number
  amountUsed: number
  startTime: number
  endTime: number
}

/** NewAPI 套餐信息 */
interface NewApiPlan {
  id: number
  title: string
  subtitle: string
  priceAmount: number
  currency: string
  durationUnit: string
  durationValue: number
  totalAmount: number
  enabled: boolean
}

interface SettingsStore {
  settings: Settings | null
  modelConfigs: ModelConfig[]
  verificationMessage: string | null
  storagePathError: string | null
  loading: boolean

  fetchSettings: () => Promise<void>
  saveSettings: (settings: Partial<Settings>) => Promise<void>
  upsertModelConfig: (config: {
    id?: string
    name: string
    provider: 'anthropic' | 'openai'
    model: string
    apiKey: string
    baseUrl: string
    maxTokens?: number
    active?: boolean
  }) => Promise<string | null>
  setActiveModelConfig: (id: string) => Promise<void>
  deleteModelConfig: (id: string) => Promise<void>
  setVerificationMessage: (message: string | null) => void
  verifyApiKey: (
    provider: string,
    apiKey: string,
    model: string,
    baseUrl: string,
    maxTokens: number,
    timeoutMs: number
  ) => Promise<boolean>
  chooseStoragePath: () => Promise<string | null>

  // ---------- NewAPI ----------
  newapiUser: NewApiUserInfo | null
  newapiLoggedIn: boolean
  newapiModels: ModelInfo[]
  newapiLoading: boolean
  newapiVerificationMessage: string | null
  newapiLogs: NewApiLogItem[]
  newapiTokenUsage: NewApiTokenUsage | null
  newapiSubscription: NewApiSubscriptionItem[] | null
  newapiPlans: NewApiPlan[] | null

  newapiLogin: (username: string, password: string) => Promise<boolean>
  newapiLogout: () => Promise<void>
  newapiFetchStatus: () => Promise<void>
  newapiFetchModels: () => Promise<void>
  newapiSetModel: (model: string) => Promise<boolean>
  newapiRefreshUser: () => Promise<void>
  newapiFetchLogs: () => Promise<void>
  newapiFetchTokenUsage: () => Promise<void>
  newapiFetchSubscription: () => Promise<void>
}

const readStoredLocale = (): 'zh' | 'en' => {
  if (typeof window === 'undefined') return 'zh'
  return window.localStorage.getItem('oh-my-ppt:lang') === 'en' ? 'en' : 'zh'
}

const fallbackMessage = (zh: string, en: string): string => (readStoredLocale() === 'en' ? en : zh)

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  modelConfigs: [],
  verificationMessage: null,
  storagePathError: null,
  loading: false,

  fetchSettings: async () => {
    try {
      const [settings, modelConfigs] = await Promise.all([
        ipc.getSettings(),
        ipc.listModelConfigs()
      ])
      const typedSettings = settings as unknown as Settings
      const locale = typedSettings.locale === 'en' ? 'en' : 'zh'
      set({
        settings: {
          ...typedSettings,
          locale,
          visionModelId: typedSettings.visionModelId || '',
          stylesCloudUrl: typedSettings.stylesCloudUrl || ''
        },
        modelConfigs: Array.isArray(modelConfigs) ? modelConfigs : [],
        storagePathError: null,
        verificationMessage: null
      })
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('读取设置失败。', 'Failed to read settings.')
      set({ verificationMessage: message })
    }
  },

  saveSettings: async (newSettings) => {
    set({ verificationMessage: null })
    const settingsToSave: Partial<Settings> = { ...newSettings }

    try {
      await ipc.saveSettings(settingsToSave)
      await get().fetchSettings()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('保存设置失败。', 'Failed to save settings.')
      set({ verificationMessage: message })
    }
  },

  upsertModelConfig: async (config) => {
    set({ verificationMessage: null })
    try {
      const result = await ipc.upsertModelConfig(config)
      await get().fetchSettings()
      return result.id
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('保存模型失败。', 'Failed to save model.')
      set({ verificationMessage: message })
      return null
    }
  },

  setActiveModelConfig: async (id) => {
    set({ verificationMessage: null })
    try {
      await ipc.setActiveModelConfig(id)
      await get().fetchSettings()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('启用模型失败。', 'Failed to activate model.')
      set({ verificationMessage: message })
    }
  },

  deleteModelConfig: async (id) => {
    set({ verificationMessage: null })
    try {
      await ipc.deleteModelConfig(id)
      await get().fetchSettings()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('删除模型失败。', 'Failed to delete model.')
      set({ verificationMessage: message })
    }
  },

  setVerificationMessage: (message) => set({ verificationMessage: message }),

  verifyApiKey: async (provider, apiKey, model, baseUrl, maxTokens, timeoutMs) => {
    try {
      const { valid, message } = await ipc.verifyApiKey({
        provider,
        apiKey,
        model,
        baseUrl,
        maxTokens,
        timeoutMs
      })
      set({ verificationMessage: message || null })
      return valid
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('发送验证请求失败。', 'Failed to send verification request.')
      set({ verificationMessage: message })
      return false
    }
  },

  chooseStoragePath: async () => {
    set({ storagePathError: null })
    try {
      const { path, error } = await ipc.chooseStoragePath()
      set({ storagePathError: error || null })
      return path
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('选择文件夹失败。', 'Failed to choose folder.')
      set({ storagePathError: message })
      return null
    }
  },

  // ---------- NewAPI ----------
  newapiUser: null,
  newapiLoggedIn: false,
  newapiModels: [],
  newapiLoading: false,
  newapiVerificationMessage: null,
  newapiLogs: [],
  newapiTokenUsage: null,
  newapiSubscription: null,
  newapiPlans: null,

  newapiLogin: async (username, password) => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      const result = await ipc.newapiLogin({ username, password })
      if (result.success && result.userInfo) {
        set({
          newapiUser: result.userInfo,
          newapiLoggedIn: true,
          newapiModels: result.models || [],
          newapiLoading: false
        })
        return true
      }
      set({
        newapiVerificationMessage: result.message || fallbackMessage('登录失败。', 'Login failed.'),
        newapiLoading: false
      })
      return false
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('登录请求失败。', 'Login request failed.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
      return false
    }
  },

  newapiLogout: async () => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      await ipc.newapiLogout()
      set({
        newapiUser: null,
        newapiLoggedIn: false,
        newapiModels: [],
        newapiLogs: [],
        newapiTokenUsage: null,
        newapiSubscription: null,
        newapiPlans: null,
        newapiLoading: false
      })
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('登出失败。', 'Logout failed.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
    }
  },

  newapiFetchStatus: async () => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      const result = await ipc.newapiGetStatus()
      set({
        newapiLoggedIn: result.loggedIn,
        newapiUser: result.userInfo || null,
        newapiLoading: false
      })
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('获取状态失败。', 'Failed to get status.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
    }
  },

  newapiFetchModels: async () => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      const result = await ipc.newapiGetModels()
      if (result.success) {
        set({ newapiModels: result.models || [], newapiLoading: false })
      } else {
        set({
          newapiVerificationMessage: result.message || fallbackMessage('获取模型失败。', 'Failed to get models.'),
          newapiLoading: false
        })
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('获取模型列表失败。', 'Failed to fetch model list.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
    }
  },

  newapiSetModel: async (model) => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      const result = await ipc.newapiSetModel({ model })
      set({ newapiLoading: false })
      return result.success
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('设置模型失败。', 'Failed to set model.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
      return false
    }
  },

  newapiRefreshUser: async () => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      const result = await ipc.newapiRefreshUser()
      if (result.success && result.userInfo) {
        set({ newapiUser: result.userInfo, newapiLoading: false })
      } else {
        set({
          newapiVerificationMessage: fallbackMessage('刷新用户信息失败。', 'Failed to refresh user info.'),
          newapiLoading: false
        })
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('刷新用户信息失败。', 'Failed to refresh user info.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
    }
  },

  /** 并发获取最近 3 天、5 页日志 */
  newapiFetchLogs: async () => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      // 并发请求 5 页日志
      const pageSize = 20
      const pages = [0, 1, 2, 3, 4]
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
      const results = await Promise.all(
        pages.map((page) => ipc.newapiGetLogs({ page, pageSize }))
      )
      // 合并所有页的 items，去重（按 id），按时间倒序
      const allItems = results
        .filter((r) => r.success)
        .flatMap((r) => r.items)
      const uniqueMap = new Map<number, NewApiLogItem>()
      for (const item of allItems) {
        if (!uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item)
        }
      }
      // 过滤最近 3 天
      const filtered = Array.from(uniqueMap.values())
        .filter((item) => item.createdAt * 1000 >= threeDaysAgo)
        .sort((a, b) => b.createdAt - a.createdAt)
      set({ newapiLogs: filtered, newapiLoading: false })
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('获取日志失败。', 'Failed to fetch logs.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
    }
  },

  newapiFetchTokenUsage: async () => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      const result = await ipc.newapiGetTokenUsage()
      if (result.success && result.usage) {
        set({ newapiTokenUsage: result.usage, newapiLoading: false })
      } else {
        set({
          newapiTokenUsage: null,
          newapiLoading: false,
          newapiVerificationMessage: fallbackMessage('获取用量失败。', 'Failed to get token usage.')
        })
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('获取用量失败。', 'Failed to get token usage.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
    }
  },

  newapiFetchSubscription: async () => {
    set({ newapiLoading: true, newapiVerificationMessage: null })
    try {
      const result = await ipc.newapiGetSubscription()
      if (result.success) {
        set({
          newapiSubscription: result.subscription?.subscriptions || null,
          newapiPlans: result.plans || null,
          newapiLoading: false
        })
      } else {
        set({
          newapiSubscription: null,
          newapiPlans: null,
          newapiLoading: false
        })
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : fallbackMessage('获取订阅信息失败。', 'Failed to get subscription.')
      set({ newapiVerificationMessage: message, newapiLoading: false })
    }
  }
}))
