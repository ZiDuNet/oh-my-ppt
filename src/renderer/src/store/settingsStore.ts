import { create } from 'zustand'
import { ipc, type ModelConfig, type ModelInfo, type NewApiUserInfo } from '@renderer/lib/ipc'
import type { ConfigurableModelTimeoutProfile } from '@shared/model-timeout.js'

interface Settings {
  theme: string
  locale: 'zh' | 'en'
  storagePath: string
  timeouts: Record<ConfigurableModelTimeoutProfile, number>
  visionModelId: string
  stylesCloudUrl: string
}

interface SettingsStore {
  settings: Settings | null
  modelConfigs: ModelConfig[]
  verificationMessage: string | null
  storagePathError: string | null
  loading: boolean

  // NewAPI auth
  newapiUser: NewApiUserInfo | null
  newapiLoggedIn: boolean
  newapiModels: ModelInfo[]
  newapiLoading: boolean

  fetchSettings: () => Promise<void>
  saveSettings: (settings: Partial<Settings>) => Promise<void>
  upsertModelConfig: (config: {
    id?: string
    name: string
    provider: 'anthropic' | 'openai'
    model: string
    apiKey: string
    baseUrl: string
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
    timeoutMs: number
  ) => Promise<boolean>
  chooseStoragePath: () => Promise<string | null>

  // NewAPI methods
  newapiLogin: (username: string, password: string) => Promise<boolean>
  newapiLogout: () => Promise<void>
  newapiFetchStatus: () => Promise<void>
  newapiFetchModels: () => Promise<void>
  newapiSetModel: (model: string) => Promise<void>
  newapiRefreshUser: () => Promise<void>
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

  newapiUser: null,
  newapiLoggedIn: false,
  newapiModels: [],
  newapiLoading: false,

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

  verifyApiKey: async (provider, apiKey, model, baseUrl, timeoutMs) => {
    try {
      const { valid, message } = await ipc.verifyApiKey({
        provider,
        apiKey,
        model,
        baseUrl,
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

  newapiLogin: async (username, password) => {
    set({ newapiLoading: true, verificationMessage: null })
    try {
      const result = await ipc.newapiLogin({ username, password })
      if (result.success && result.userInfo) {
        set({
          newapiUser: result.userInfo,
          newapiLoggedIn: true,
          newapiModels: result.models || []
        })
        await get().fetchSettings()
        return true
      }
      set({ verificationMessage: result.message || '登录失败。' })
      return false
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '登录失败。'
      set({ verificationMessage: message })
      return false
    } finally {
      set({ newapiLoading: false })
    }
  },

  newapiLogout: async () => {
    set({ newapiLoading: true, verificationMessage: null })
    try {
      await ipc.newapiLogout()
      set({
        newapiUser: null,
        newapiLoggedIn: false,
        newapiModels: []
      })
      await get().fetchSettings()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '退出登录失败。'
      set({ verificationMessage: message })
    } finally {
      set({ newapiLoading: false })
    }
  },

  newapiFetchStatus: async () => {
    try {
      const result = await ipc.newapiGetStatus()
      set({
        newapiLoggedIn: result.loggedIn,
        newapiUser: result.userInfo || null
      })
    } catch {
      set({ newapiLoggedIn: false, newapiUser: null })
    }
  },

  newapiFetchModels: async () => {
    try {
      const result = await ipc.newapiGetModels()
      if (result.success) {
        set({ newapiModels: result.models || [] })
      }
    } catch {
      // ignore
    }
  },

  newapiSetModel: async (model) => {
    set({ verificationMessage: null })
    try {
      await ipc.newapiSetModel({ model })
      await get().fetchSettings()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '切换模型失败。'
      set({ verificationMessage: message })
    }
  },

  newapiRefreshUser: async () => {
    try {
      const result = await ipc.newapiRefreshUser()
      if (result.success && result.userInfo) {
        set({ newapiUser: result.userInfo })
      }
    } catch {
      // ignore
    }
  }
}))
