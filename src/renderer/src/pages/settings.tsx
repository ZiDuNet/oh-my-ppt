import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/Select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { useSettingsStore } from '../store'
import { useToastStore } from '../store'
import { CheckCircle2, FolderSearch, Pencil, Plus, ShieldCheck, Trash2, X, RefreshCw, LogOut, Cloud, User, BarChart3, FileText, CreditCard } from 'lucide-react'
import { useLang } from '../i18n'
import type { ModelConfig } from '../lib/ipc'
import { formatQuota } from '../lib/ipc'
import {
  CONFIGURABLE_MODEL_TIMEOUT_PROFILES,
  type ConfigurableModelTimeoutProfile,
  modelTimeoutMsToSeconds,
  resolveModelTimeoutMs
} from '@shared/model-timeout.js'

type ProviderId = 'anthropic' | 'openai'

interface ModelForm {
  id?: string
  name: string
  provider: ProviderId
  model: string
  apiKey: string
  baseUrl: string
  maxTokens: number
  active: boolean
}

const createTimeoutSeconds = (
  timeouts?: Partial<Record<ConfigurableModelTimeoutProfile, number>>
): Record<ConfigurableModelTimeoutProfile, number> =>
  Object.fromEntries(
    CONFIGURABLE_MODEL_TIMEOUT_PROFILES.map((profile) => [
      profile,
      modelTimeoutMsToSeconds(timeouts?.[profile], profile)
    ])
  ) as Record<ConfigurableModelTimeoutProfile, number>

const createEmptyModelForm = (active = false): ModelForm => ({
  name: '',
  provider: 'openai',
  model: '',
  apiKey: '',
  baseUrl: '',
  maxTokens: 4096,
  active
})

const createModelForm = (config: ModelConfig): ModelForm => ({
  id: config.id,
  name: config.name,
  provider: config.provider,
  model: config.model,
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  maxTokens: config.maxTokens || 4096,
  active: config.active
})

export function SettingsPage(): React.JSX.Element {
  const {
    modelConfigs,
    fetchSettings,
    saveSettings,
    upsertModelConfig,
    setActiveModelConfig,
    deleteModelConfig,
    setVerificationMessage,
    verifyApiKey,
    chooseStoragePath,
    // NewAPI
    newapiUser,
    newapiLoggedIn,
    newapiModels,
    newapiLoading,
    newapiVerificationMessage,
    newapiLogs,
    newapiTokenUsage,
    newapiSubscription,
    newapiPlans,
    newapiLogin,
    newapiLogout,
    newapiFetchStatus,
    newapiFetchModels,
    newapiSetModel,
    newapiRefreshUser,
    newapiFetchLogs,
    newapiFetchTokenUsage,
    newapiFetchSubscription
  } = useSettingsStore()
  const { success, error, warning, info } = useToastStore()
  const { lang, setLang, t } = useLang()
  const [storagePath, setStoragePath] = useState(
    () => useSettingsStore.getState().settings?.storagePath || ''
  )
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [modelForm, setModelForm] = useState<ModelForm>(() => createEmptyModelForm())
  const [timeoutSeconds, setTimeoutSeconds] = useState<
    Record<ConfigurableModelTimeoutProfile, number>
  >(() => createTimeoutSeconds(useSettingsStore.getState().settings?.timeouts))
  const [savingModel, setSavingModel] = useState(false)
  const [savingTimeouts, setSavingTimeouts] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [visionModelId, setVisionModelId] = useState(
    () => useSettingsStore.getState().settings?.visionModelId || ''
  )
  const [stylesCloudUrl, setStylesCloudUrl] = useState(
    () => useSettingsStore.getState().settings?.stylesCloudUrl || ''
  )

  // NewAPI 本地表单状态
  const [newapiUsernameInput, setNewapiUsernameInput] = useState('')
  const [newapiPasswordInput, setNewapiPasswordInput] = useState('')
  const [newapiEmailInput, setNewapiEmailInput] = useState('')
  const [newapiSelectedModel, setNewapiSelectedModel] = useState('')

  useEffect(() => {
    let active = true
    const loadSettings = async (): Promise<void> => {
      await fetchSettings()
      if (!active) return
      const nextSettings = useSettingsStore.getState().settings
      setStoragePath(nextSettings?.storagePath || '')
      setTimeoutSeconds(createTimeoutSeconds(nextSettings?.timeouts))
      setVisionModelId(nextSettings?.visionModelId || '')
      setStylesCloudUrl(nextSettings?.stylesCloudUrl || '')
    }
    void loadSettings()
    return () => {
      active = false
    }
  }, [fetchSettings])

  useEffect(() => {
    if (!modelDialogOpen) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !savingModel) {
        setModelDialogOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [modelDialogOpen, savingModel])

  // NewAPI 初始化：进入设置页时检查登录状态
  useEffect(() => {
    void newapiFetchStatus()
  }, [newapiFetchStatus])

  const activeModelConfig = modelConfigs.find((config) => config.active)
  const timeoutFields: Array<{
    profile: ConfigurableModelTimeoutProfile
    label: string
    hint: string
    min: number
  }> = useMemo(
    () => [
      {
        profile: 'planning',
        label: t('settings.timeoutPlanning'),
        hint: t('settings.timeoutPlanningHint'),
        min: 120
      },
      {
        profile: 'design',
        label: t('settings.timeoutDesign'),
        hint: t('settings.timeoutDesignHint'),
        min: 120
      },
      {
        profile: 'agent',
        label: t('settings.timeoutAgent'),
        hint: t('settings.timeoutAgentHint'),
        min: 300
      },
      {
        profile: 'document',
        label: t('settings.timeoutDocument'),
        hint: t('settings.timeoutDocumentHint'),
        min: 300
      }
    ],
    [t]
  )

  const openCreateModelDialog = (): void => {
    setModelForm(createEmptyModelForm(modelConfigs.length === 0))
    setVerificationMessage(null)
    setModelDialogOpen(true)
  }

  const openEditModelDialog = (config: ModelConfig): void => {
    setModelForm(createModelForm(config))
    setVerificationMessage(null)
    setModelDialogOpen(true)
  }

  const updateModelForm = (patch: Partial<ModelForm>): void => {
    setModelForm((form) => ({ ...form, ...patch }))
    setVerificationMessage(null)
  }

  const handleSaveModel = async (): Promise<void> => {
    if (!modelForm.name.trim()) {
      warning(t('settings.fillModelName'))
      return
    }
    if (!modelForm.model.trim()) {
      warning(t('settings.fillModel'))
      return
    }
    if (!modelForm.apiKey.trim()) {
      warning(t('settings.fillApiKey'))
      return
    }

    setSavingModel(true)
    setVerificationMessage(null)
    try {
      const id = await upsertModelConfig({
        id: modelForm.id,
        name: modelForm.name.trim(),
        provider: modelForm.provider,
        model: modelForm.model.trim(),
        apiKey: modelForm.apiKey.trim(),
        baseUrl: modelForm.baseUrl.trim(),
        maxTokens: modelForm.maxTokens,
        active: modelForm.active
      })
      const saveError = useSettingsStore.getState().verificationMessage
      if (!id || saveError) {
        error(t('settings.saveFailed'), { description: saveError || t('common.retryLater') })
        return
      }
      setModelDialogOpen(false)
      success(t('settings.modelSaved'), { description: t('settings.modelSavedDescription') })
    } finally {
      setSavingModel(false)
    }
  }

  const handleTimeoutChange = (profile: ConfigurableModelTimeoutProfile, value: string): void => {
    setTimeoutSeconds((current) => ({
      ...current,
      [profile]: modelTimeoutMsToSeconds(Number(value) * 1000, profile)
    }))
    setVerificationMessage(null)
  }

  const handleSaveTimeouts = async (): Promise<void> => {
    setSavingTimeouts(true)
    setVerificationMessage(null)
    try {
      await saveSettings({
        timeouts: Object.fromEntries(
          CONFIGURABLE_MODEL_TIMEOUT_PROFILES.map((profile) => [
            profile,
            timeoutSeconds[profile] * 1000
          ])
        ) as Record<ConfigurableModelTimeoutProfile, number>
      })
      const saveError = useSettingsStore.getState().verificationMessage
      if (saveError) {
        error(t('settings.saveFailed'), { description: saveError })
        return
      }
      success(t('settings.saved'), { description: t('settings.timeoutSavedDescription') })
    } finally {
      setSavingTimeouts(false)
    }
  }

  const handleVerify = async (): Promise<void> => {
    if (!modelForm.apiKey.trim()) {
      warning(t('settings.fillApiKey'))
      return
    }
    if (!modelForm.model.trim()) {
      warning(t('settings.fillModel'))
      return
    }

    setVerifying(true)
    setVerificationMessage(null)
    try {
      const valid = await verifyApiKey(
        modelForm.provider,
        modelForm.apiKey,
        modelForm.model,
        modelForm.baseUrl,
        modelForm.maxTokens,
        resolveModelTimeoutMs(undefined, 'verify')
      )
      const verifyMessage = useSettingsStore.getState().verificationMessage
      if (valid) {
        success(t('settings.verifyPassed'), {
          description: verifyMessage || t('settings.verifyPassedDescription')
        })
      } else {
        error(t('settings.verifyFailed'), {
          description: verifyMessage || t('settings.verifyFailedDescription')
        })
      }
    } finally {
      setVerifying(false)
    }
  }

  const handleActivateModel = async (id: string): Promise<void> => {
    setActivatingId(id)
    setVerificationMessage(null)
    try {
      await setActiveModelConfig(id)
      const activateError = useSettingsStore.getState().verificationMessage
      if (activateError) {
        error(t('settings.activateModelFailed'), { description: activateError })
        return
      }
      success(t('settings.activeModelUpdated'))
    } finally {
      setActivatingId(null)
    }
  }

  const handleDeleteModel = async (config: ModelConfig): Promise<void> => {
    if (!window.confirm(t('settings.deleteModelConfirm', { name: config.name }))) return
    setDeletingId(config.id)
    setVerificationMessage(null)
    try {
      await deleteModelConfig(config.id)
      const deleteError = useSettingsStore.getState().verificationMessage
      if (deleteError) {
        error(t('settings.deleteModelFailed'), { description: deleteError })
        return
      }
      info(t('settings.modelDeleted'))
    } finally {
      setDeletingId(null)
    }
  }

  const handleVisionModelChange = async (id: string): Promise<void> => {
    const value = id === '__default__' ? '' : id
    setVisionModelId(value)
    setVerificationMessage(null)
    try {
      await saveSettings({ visionModelId: value })
      const saveError = useSettingsStore.getState().verificationMessage
      if (saveError) {
        error(t('settings.saveFailed'), { description: saveError })
        return
      }
      success(t('settings.saved'))
    } catch {
      error(t('settings.saveFailed'))
    }
  }

  const handleStylesCloudUrlSave = async (): Promise<void> => {
    setVerificationMessage(null)
    try {
      await saveSettings({ stylesCloudUrl })
      const saveError = useSettingsStore.getState().verificationMessage
      if (saveError) {
        error(t('settings.saveFailed'), { description: saveError })
        return
      }
      success(t('settings.saved'))
    } catch {
      error(t('settings.saveFailed'))
    }
  }

  // ---------- NewAPI 处理函数 ----------
  const handleNewapiLogin = async (): Promise<void> => {
    if (!newapiUsernameInput.trim()) {
      warning(t('settings.newapiFillUsername'))
      return
    }
    if (!newapiPasswordInput.trim()) {
      warning(t('settings.newapiFillPassword'))
      return
    }
    const ok = await newapiLogin(newapiUsernameInput.trim(), newapiPasswordInput.trim())
    if (ok) {
      success(t('settings.newapiLoggedIn'))
      // 登录成功后自动拉取模型、用量、订阅
      await Promise.all([
        newapiFetchModels(),
        newapiFetchTokenUsage(),
        newapiFetchSubscription(),
        newapiFetchLogs()
      ])
    } else {
      const msg = useSettingsStore.getState().newapiVerificationMessage
      error(t('settings.newapiLoginFailed'), { description: msg || '' })
    }
  }

  const handleNewapiRegister = async (): Promise<void> => {
    if (!newapiUsernameInput.trim()) {
      warning(t('settings.newapiFillUsername'))
      return
    }
    if (!newapiPasswordInput.trim()) {
      warning(t('settings.newapiFillPassword'))
      return
    }
    try {
      const { ipc: ipcClient } = await import('@renderer/lib/ipc')
      const result = await ipcClient.newapiRegister({
        username: newapiUsernameInput.trim(),
        password: newapiPasswordInput.trim(),
        email: newapiEmailInput.trim() || undefined
      })
      if (result.success) {
        success(t('settings.newapiRegisterSuccess'))
      } else {
        error(t('settings.newapiRegisterFailed'), { description: result.message || '' })
      }
    } catch (err) {
      error(t('settings.newapiRegisterFailed'), {
        description: err instanceof Error ? err.message : ''
      })
    }
  }

  const handleNewapiLogout = async (): Promise<void> => {
    if (!window.confirm(t('settings.newapiLogoutConfirm'))) return
    await newapiLogout()
    setNewapiUsernameInput('')
    setNewapiPasswordInput('')
    setNewapiEmailInput('')
    info(t('settings.newapiNotLoggedIn'))
  }

  const handleNewapiFetchModels = async (): Promise<void> => {
    await newapiFetchModels()
    const msg = useSettingsStore.getState().newapiVerificationMessage
    if (msg) {
      error(msg)
    }
  }

  const handleNewapiSetModel = async (model: string): Promise<void> => {
    setNewapiSelectedModel(model)
    const ok = await newapiSetModel(model)
    if (ok) {
      success(t('settings.newapiSetModelSuccess'), { description: model })
    } else {
      error(t('settings.newapiSetModelFailed'))
    }
  }

  const handleNewapiRefreshUser = async (): Promise<void> => {
    await newapiRefreshUser()
    const msg = useSettingsStore.getState().newapiVerificationMessage
    if (msg) {
      error(msg)
    } else {
      success(t('settings.saved'))
    }
  }

  const handleNewapiFetchLogs = async (): Promise<void> => {
    await newapiFetchLogs()
    const msg = useSettingsStore.getState().newapiVerificationMessage
    if (msg) {
      error(msg)
    }
  }

  const handleNewapiFetchTokenUsage = async (): Promise<void> => {
    await newapiFetchTokenUsage()
    const msg = useSettingsStore.getState().newapiVerificationMessage
    if (msg) {
      error(msg)
    }
  }

  const handleNewapiFetchSubscription = async (): Promise<void> => {
    await newapiFetchSubscription()
    const msg = useSettingsStore.getState().newapiVerificationMessage
    if (msg) {
      error(msg)
    }
  }

  /** 格式化角色名称 */
  const formatRole = (role: number): string => {
    if (role === 100) return t('settings.newapiRoleAdmin')
    if (role === 1) return t('settings.newapiRoleUser')
    return t('settings.newapiRoleGuest')
  }

  /** 格式化时间戳 */
  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts * 1000)
    return date.toLocaleString()
  }

  /** 格式化时长 */
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms} ${t('settings.newapiDurationUnit')}`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const handleChoosePath = async (): Promise<void> => {
    const path = await chooseStoragePath()
    const pathError = useSettingsStore.getState().storagePathError
    if (pathError) {
      error(t('settings.choosePathFailed'), { description: pathError })
      return
    }
    if (path) {
      setVerificationMessage(null)
      await saveSettings({ storagePath: path })
      const saveError = useSettingsStore.getState().verificationMessage
      if (saveError) {
        error(t('settings.saveFailed'), { description: saveError })
        return
      }
      setStoragePath(path)
      info(t('settings.storagePathUpdated'), { description: path })
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {t('settings.eyebrow')}
        </p>
        <h1 className="organic-serif mt-2 text-[32px] font-semibold leading-none text-[#3e4a32]">
          {t('settings.title')}
        </h1>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t('settings.generalTab')}</TabsTrigger>
          <TabsTrigger value="model">{t('settings.modelTab')}</TabsTrigger>
          <TabsTrigger value="newapi">{t('settings.newapiTab')}</TabsTrigger>
          <TabsTrigger value="advanced">{t('settings.advancedTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">{t('settings.interface')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t('settings.language')}</label>
                <Select value={lang} onValueChange={(v) => setLang(v === 'en' ? 'en' : 'zh')}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t('settings.languagePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">{t('settings.chinese')}</SelectItem>
                    <SelectItem value="en">{t('settings.english')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">{t('settings.storage')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t('settings.storagePath')}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={storagePath}
                    readOnly
                    placeholder={t('settings.storagePlaceholder')}
                    className="h-10 min-w-0 flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleChoosePath}
                    className="h-10 min-w-[96px] shrink-0 rounded-lg border border-[#7ea06f]/45 px-4"
                  >
                    <FolderSearch className="mr-1.5 h-4 w-4" />
                    {t('settings.choose')}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t('settings.storageHint')}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="model">
          <Card className="mb-4">
            <CardHeader className="flex-row items-center justify-between p-5 pb-3">
              <div>
                <CardTitle className="text-base">{t('settings.modelAccess')}</CardTitle>
                {activeModelConfig && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('settings.currentActiveModel', { name: activeModelConfig.name })}
                  </p>
                )}
              </div>
              <Button size="sm" onClick={openCreateModelDialog}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('settings.addModel')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2.5 p-5 pt-0">
              {modelConfigs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#d8ccb5]/85 bg-[#fff9ef]/70 p-6 text-sm text-muted-foreground">
                  {t('settings.noModels')}
                </div>
              ) : (
                modelConfigs.map((config) => (
                  <div
                    key={config.id}
                    className={
                      config.active
                        ? 'flex flex-col gap-3 rounded-lg border border-[#96b77f]/80 bg-[#eef6e8] p-3 shadow-[inset_3px_0_0_#6f8f64] sm:flex-row sm:items-center sm:justify-between'
                        : 'flex flex-col gap-3 rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3 sm:flex-row sm:items-center sm:justify-between'
                    }
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {config.active && <CheckCircle2 className="h-4 w-4 text-[#5d7b4d]" />}
                        <p className="font-medium text-[#33402a]">{config.name}</p>
                        <span className="rounded-full bg-[#e9efde] px-2 py-0.5 text-[11px] uppercase text-[#506141]">
                          {config.provider}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{config.model}</p>
                      {config.baseUrl && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {config.baseUrl}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={config.active ? 'secondary' : 'outline'}
                        disabled={config.active || activatingId === config.id}
                        onClick={() => void handleActivateModel(config.id)}
                      >
                        {config.active ? t('settings.activeModel') : t('settings.activateModel')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEditModelDialog(config)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deletingId === config.id}
                        onClick={() => void handleDeleteModel(config)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">{t('settings.visionModel')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              <div>
                <Select
                  value={visionModelId || '__default__'}
                  onValueChange={(v) => void handleVisionModelChange(v)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t('settings.visionModelFollowDefault')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">{t('settings.visionModelFollowDefault')}</SelectItem>
                    {modelConfigs.map((config) => (
                      <SelectItem key={config.id} value={config.id}>
                        {config.name}
                        <span className="ml-2 text-xs text-muted-foreground">({config.provider})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">{t('settings.visionModelHint')}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- NewAPI 云服务 Tab ---------- */}
        <TabsContent value="newapi" className="space-y-4">
          {!newapiLoggedIn ? (
            /* 登录/注册面板 */
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cloud className="h-5 w-5 text-[#5d7b4d]" />
                  {t('settings.newapiTitle')}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('settings.newapiDescription')}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-0">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t('settings.newapiUsername')}
                  </label>
                  <Input
                    value={newapiUsernameInput}
                    onChange={(e) => setNewapiUsernameInput(e.target.value)}
                    placeholder={t('settings.newapiUsername')}
                    className="h-10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t('settings.newapiPassword')}
                  </label>
                  <Input
                    type="password"
                    value={newapiPasswordInput}
                    onChange={(e) => setNewapiPasswordInput(e.target.value)}
                    placeholder={t('settings.newapiPassword')}
                    className="h-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleNewapiLogin()
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t('settings.newapiEmail')}
                  </label>
                  <Input
                    value={newapiEmailInput}
                    onChange={(e) => setNewapiEmailInput(e.target.value)}
                    placeholder={t('settings.newapiEmail')}
                    className="h-10"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => void handleNewapiLogin()}
                    disabled={newapiLoading}
                    className="flex-1"
                  >
                    {newapiLoading ? t('settings.newapiLoggingIn') : t('settings.newapiLogin')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleNewapiRegister()}
                    disabled={newapiLoading}
                    className="flex-1"
                  >
                    {t('settings.newapiRegister')}
                  </Button>
                </div>
                {newapiVerificationMessage && (
                  <p className="text-sm text-red-600">{newapiVerificationMessage}</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 已登录：账户信息 */}
              <Card>
                <CardHeader className="flex-row items-center justify-between p-5 pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-5 w-5 text-[#5d7b4d]" />
                    {t('settings.newapiAccountInfo')}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleNewapiRefreshUser()}
                      disabled={newapiLoading}
                    >
                      <RefreshCw className={`mr-1.5 h-4 w-4 ${newapiLoading ? 'animate-spin' : ''}`} />
                      {newapiLoading ? t('settings.newapiRefreshing') : t('settings.newapiRefreshUser')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleNewapiLogout()}
                    >
                      <LogOut className="mr-1.5 h-4 w-4" />
                      {t('settings.newapiLogout')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  {newapiUser && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiUsername')}</p>
                        <p className="mt-1 font-medium text-[#33402a]">{newapiUser.username}</p>
                      </div>
                      <div className="rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiRole')}</p>
                        <p className="mt-1 font-medium text-[#33402a]">{formatRole(newapiUser.role)}</p>
                      </div>
                      <div className="rounded-lg border border-[#96b77f]/80 bg-[#eef6e8] p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiQuota')}</p>
                        <p className="mt-1 font-semibold text-[#3e5a30]">
                          {newapiUser.unlimitedQuota
                            ? t('settings.newapiUnlimited')
                            : formatQuota(newapiUser.quota)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiUsedQuota')}</p>
                        <p className="mt-1 font-medium text-[#33402a]">{formatQuota(newapiUser.usedQuota)}</p>
                      </div>
                      <div className="rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiRemainQuota')}</p>
                        <p className="mt-1 font-medium text-[#33402a]">
                          {newapiUser.unlimitedQuota
                            ? t('settings.newapiUnlimited')
                            : formatQuota(newapiUser.remainQuota)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiRequestCount')}</p>
                        <p className="mt-1 font-medium text-[#33402a]">{newapiUser.requestCount}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Token 用量 */}
              <Card>
                <CardHeader className="flex-row items-center justify-between p-5 pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-5 w-5 text-[#5d7b4d]" />
                    {t('settings.newapiTokenUsage')}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleNewapiFetchTokenUsage()}
                    disabled={newapiLoading}
                  >
                    {t('settings.newapiFetchUsage')}
                  </Button>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  {newapiTokenUsage ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-[#96b77f]/80 bg-[#eef6e8] p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiQuota')}</p>
                        <p className="mt-1 font-semibold text-[#3e5a30]">
                          {newapiTokenUsage.unlimitedQuota
                            ? t('settings.newapiUnlimited')
                            : formatQuota(newapiTokenUsage.remainQuota + newapiTokenUsage.usedQuota)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiUsedQuota')}</p>
                        <p className="mt-1 font-medium text-[#33402a]">
                          {formatQuota(newapiTokenUsage.usedQuota)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3">
                        <p className="text-xs text-muted-foreground">{t('settings.newapiRemainQuota')}</p>
                        <p className="mt-1 font-medium text-[#33402a]">
                          {newapiTokenUsage.unlimitedQuota
                            ? t('settings.newapiUnlimited')
                            : formatQuota(newapiTokenUsage.remainQuota)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('settings.newapiFetchUsage')}</p>
                  )}
                </CardContent>
              </Card>

              {/* 模型选择 */}
              <Card>
                <CardHeader className="flex-row items-center justify-between p-5 pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {t('settings.newapiModelSection')}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleNewapiFetchModels()}
                    disabled={newapiLoading}
                  >
                    <RefreshCw className={`mr-1.5 h-4 w-4 ${newapiLoading ? 'animate-spin' : ''}`} />
                    {newapiLoading ? t('settings.newapiFetchingModels') : t('settings.newapiFetchModels')}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 p-5 pt-0">
                  <div>
                    <Select
                      value={newapiSelectedModel || '__none__'}
                      onValueChange={(v) => {
                        if (v !== '__none__') void handleNewapiSetModel(v)
                      }}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder={t('settings.newapiSelectModel')} />
                      </SelectTrigger>
                      <SelectContent>
                        {newapiModels.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            {t('settings.newapiFetchModels')}
                          </SelectItem>
                        ) : (
                          newapiModels.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.id}
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({m.ownedBy})
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* 订阅套餐 */}
              <Card>
                <CardHeader className="flex-row items-center justify-between p-5 pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-5 w-5 text-[#5d7b4d]" />
                    {t('settings.newapiSubscription')}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleNewapiFetchSubscription()}
                    disabled={newapiLoading}
                  >
                    {t('settings.newapiFetchSubscription')}
                  </Button>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  {newapiSubscription && newapiSubscription.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {newapiSubscription.map((sub) => {
                        const plan = newapiPlans?.find((p) => p.id === sub.planId)
                        const isActive = sub.status === 'active' && sub.endTime * 1000 > Date.now()
                        return (
                          <div
                            key={sub.id}
                            className={`rounded-lg border p-3 ${
                              isActive
                                ? 'border-[#96b77f]/80 bg-[#eef6e8]'
                                : 'border-[#d8ccb5]/80 bg-[#fffdf8]/78'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-[#33402a]">
                                {plan?.title || `${t('settings.newapiPlanName')} #${sub.planId}`}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] ${
                                  isActive
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {isActive ? t('settings.newapiPlanActive') : t('settings.newapiPlanExpired')}
                              </span>
                            </div>
                            {plan?.subtitle && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{plan.subtitle}</p>
                            )}
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">{t('settings.newapiPlanTotal')}: </span>
                                <span className="font-medium">{formatQuota(sub.amountTotal)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t('settings.newapiPlanUsed')}: </span>
                                <span className="font-medium">{formatQuota(sub.amountUsed)}</span>
                              </div>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {t('settings.newapiPlanExpiry')}: {formatTimestamp(sub.endTime)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('settings.newapiNoSubscription')}</p>
                  )}
                </CardContent>
              </Card>

              {/* 调用日志 */}
              <Card>
                <CardHeader className="flex-row items-center justify-between p-5 pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-5 w-5 text-[#5d7b4d]" />
                    {t('settings.newapiLogs')}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleNewapiFetchLogs()}
                    disabled={newapiLoading}
                  >
                    <RefreshCw className={`mr-1.5 h-4 w-4 ${newapiLoading ? 'animate-spin' : ''}`} />
                    {t('settings.newapiFetchLogs')}
                  </Button>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <p className="mb-3 text-xs text-muted-foreground">{t('settings.newapiLogsHint')}</p>
                  {newapiLogs.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#e3d8c5] text-left text-muted-foreground">
                            <th className="pb-2 pr-3 font-medium">{t('settings.newapiLogTokenName')}</th>
                            <th className="pb-2 pr-3 font-medium">{t('settings.newapiLogModel')}</th>
                            <th className="pb-2 pr-3 font-medium text-right">{t('settings.newapiLogQuota')}</th>
                            <th className="pb-2 pr-3 font-medium text-right">{t('settings.newapiLogPromptTokens')}</th>
                            <th className="pb-2 pr-3 font-medium text-right">{t('settings.newapiLogCompletionTokens')}</th>
                            <th className="pb-2 pr-3 font-medium text-right">{t('settings.newapiLogDuration')}</th>
                            <th className="pb-2 pr-3 font-medium">{t('settings.newapiLogTime')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newapiLogs.map((log) => (
                            <tr key={log.id} className="border-b border-[#e3d8c5]/50">
                              <td className="py-2 pr-3 text-[#33402a]">{log.tokenName}</td>
                              <td className="py-2 pr-3 text-[#33402a]">{log.modelName}</td>
                              <td className="py-2 pr-3 text-right">{formatQuota(log.quota)}</td>
                              <td className="py-2 pr-3 text-right">{log.promptTokens}</td>
                              <td className="py-2 pr-3 text-right">{log.completionTokens}</td>
                              <td className="py-2 pr-3 text-right">{formatDuration(log.useTime)}</td>
                              <td className="py-2 pr-3 text-muted-foreground">{formatTimestamp(log.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('settings.newapiNoLogs')}</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="advanced">
          <Card className="mb-4">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">{t('settings.stylesCloudUrl')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              <div>
                <div className="flex gap-2">
                  <Input
                    value={stylesCloudUrl}
                    onChange={(e) => setStylesCloudUrl(e.target.value)}
                    placeholder="https://example.com/styles.json"
                    className="h-10 flex-1"
                  />
                  <Button size="sm" onClick={() => void handleStylesCloudUrlSave()}>
                    {t('common.save')}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t('settings.stylesCloudUrlHint')}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">{t('settings.timeoutSection')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              <p className="text-xs text-muted-foreground">{t('settings.timeoutHint')}</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {timeoutFields.map((field) => (
                  <div key={field.profile}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {field.label}
                    </label>
                    <Input
                      type="number"
                      min={field.min}
                      max={3600}
                      step={30}
                      placeholder={t('settings.timeoutPlaceholder')}
                      value={timeoutSeconds[field.profile]}
                      onChange={(e) => handleTimeoutChange(field.profile, e.target.value)}
                      className="h-10"
                    />
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {field.hint}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveTimeouts} disabled={savingTimeouts}>
              {savingTimeouts ? t('common.saving') : t('settings.saveTimeouts')}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {modelDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2d291f]/42 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingModel) {
              setModelDialogOpen(false)
            }
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#d8ccb5]/85 bg-[#fffaf1] shadow-[0_24px_70px_rgba(53,44,32,0.28)]">
            <div className="flex items-center justify-between border-b border-[#e3d8c5] px-5 py-4">
              <h2 className="text-base font-semibold text-[#33402a]">
                {modelForm.id ? t('settings.editModel') : t('settings.addModel')}
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setModelDialogOpen(false)}
                disabled={savingModel}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3 p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {t('settings.modelName')}
                  </label>
                  <Input
                    value={modelForm.name}
                    onChange={(e) => updateModelForm({ name: e.target.value })}
                    placeholder={t('settings.modelNamePlaceholder')}
                    className="h-8"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {t('settings.providerPreset')}
                  </label>
                  <Select
                    value={modelForm.provider}
                    onValueChange={(value) =>
                      updateModelForm({ provider: value === 'anthropic' ? 'anthropic' : 'openai' })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder={t('settings.providerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">Claude (Anthropic)</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">model</label>
                <Input
                  placeholder={t('settings.modelPlaceholder')}
                  value={modelForm.model}
                  onChange={(e) => updateModelForm({ model: e.target.value })}
                  className="h-8"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.modelHint')}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">base_url</label>
                <Input
                  placeholder={t('settings.baseUrlPlaceholder')}
                  value={modelForm.baseUrl}
                  onChange={(e) => updateModelForm({ baseUrl: e.target.value })}
                  className="h-8"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.baseUrlHint')}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">max_tokens</label>
                <Input
                  type="number"
                  min={256}
                  max={16384}
                  step={256}
                  value={modelForm.maxTokens}
                  onChange={(e) => updateModelForm({ maxTokens: Math.max(256, Math.min(16384, Number(e.target.value) || 4096)) })}
                  className="h-8"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.maxTokensHint')}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">api_key</label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={t('settings.apiKeyPlaceholder', {
                      provider: modelForm.provider === 'openai' ? 'OpenAI' : 'Claude'
                    })}
                    value={modelForm.apiKey}
                    onChange={(e) => updateModelForm({ apiKey: e.target.value })}
                    className="h-8 min-w-0 flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleVerify}
                    disabled={verifying}
                    className="h-8 min-w-[80px] shrink-0 rounded-lg border border-[#7ea06f]/45 px-3 text-xs"
                  >
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    {verifying ? t('settings.verifying') : t('settings.verify')}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.verifyHint')}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#e3d8c5] px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setModelDialogOpen(false)}
                disabled={savingModel}
              >
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveModel} disabled={savingModel}>
                {savingModel ? t('common.saving') : t('settings.saveModel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
