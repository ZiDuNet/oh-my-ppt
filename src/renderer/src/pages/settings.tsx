import { memo, useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  CheckCircle2,
  FolderSearch,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Save
} from 'lucide-react'
import { useLang } from '../i18n'
import {
  CONFIGURABLE_MODEL_TIMEOUT_PROFILES,
  type ConfigurableModelTimeoutProfile,
  modelTimeoutMsToSeconds
} from '@shared/model-timeout.js'
import type { ModelInfo } from '@renderer/lib/ipc'

// ── helpers ──

const createTimeoutSeconds = (
  timeouts?: Partial<Record<ConfigurableModelTimeoutProfile, number>>
): Record<ConfigurableModelTimeoutProfile, number> =>
  Object.fromEntries(
    CONFIGURABLE_MODEL_TIMEOUT_PROFILES.map((profile) => [
      profile,
      modelTimeoutMsToSeconds(timeouts?.[profile], profile)
    ])
  ) as Record<ConfigurableModelTimeoutProfile, number>

function formatQuota(quota: number, usedQuota: number): string {
  const remaining = quota - usedQuota
  const toUSD = (v: number) => (v / 500000).toFixed(2)
  return `$${toUSD(remaining)} / $${toUSD(quota)}`
}

// ── memoized model option lists ──

const ModelSelectItems = memo(function ModelSelectItems({
  models
}: {
  models: ModelInfo[]
}) {
  return (
    <>
      {models.map((model) => (
        <SelectItem key={model.id} value={model.id}>
          {model.id}
        </SelectItem>
      ))}
    </>
  )
})

// ── Login form ──

const LoginForm = memo(function LoginForm() {
  const newapiLoading = useSettingsStore((s) => s.newapiLoading)
  const newapiLogin = useSettingsStore((s) => s.newapiLogin)
  const { success, error, warning } = useToastStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = useCallback(async () => {
    if (!username.trim()) {
      warning('请输入用户名。')
      return
    }
    if (!password.trim()) {
      warning('请输入密码。')
      return
    }
    const ok = await newapiLogin(username.trim(), password.trim())
    if (ok) {
      success('登录成功')
      setUsername('')
      setPassword('')
    } else {
      const msg = useSettingsStore.getState().verificationMessage
      error('登录失败', { description: msg || '请检查用户名和密码。' })
    }
  }, [username, password, newapiLogin, success, error, warning])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !newapiLoading) void handleLogin()
    },
    [handleLogin, newapiLoading]
  )

  return (
    <div className="flex gap-4">
      <div className="hidden w-48 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-[#eef6e8] to-[#d4e8c8] p-6 sm:flex">
        <div className="text-4xl">&#x1F680;</div>
        <p className="mt-3 text-center text-sm font-medium text-[#3e4a32]">
          AI 驱动的
          <br />
          PPT 生成
        </p>
        <p className="mt-1 text-center text-[11px] text-[#5d7b4d]">登录后即可使用</p>
      </div>

      <Card className="flex-1">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">账号登录</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            登录潮汐平台，使用 AI 模型生成 PPT
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <div>
            <label className="mb-1.5 block text-sm font-medium">用户名</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="h-10"
              onKeyDown={onKeyDown}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="h-10"
              onKeyDown={onKeyDown}
            />
          </div>
          <Button
            className="w-full"
            disabled={newapiLoading}
            onClick={() => void handleLogin()}
          >
            <LogIn className="mr-1.5 h-4 w-4" />
            {newapiLoading ? '登录中...' : '登录'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            还没有账号？{' '}
            <a
              href="https://new-api.chaoxi.live/register"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#5d7b4d] underline hover:text-[#3e5a32]"
            >
              前往注册
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
})

// ── Logged-in panel ──

const LoggedInPanel = memo(function LoggedInPanel({
  models,
  activeModel,
  visionModelId,
  t
}: {
  models: ModelInfo[]
  activeModel: string
  visionModelId: string
  t: (key: string) => string
}) {
  const newapiUser = useSettingsStore((s) => s.newapiUser)
  const newapiLoading = useSettingsStore((s) => s.newapiLoading)
  const newapiLogout = useSettingsStore((s) => s.newapiLogout)
  const newapiSetModel = useSettingsStore((s) => s.newapiSetModel)
  const newapiRefreshUser = useSettingsStore((s) => s.newapiRefreshUser)
  const setVerificationMessage = useSettingsStore((s) => s.setVerificationMessage)
  const verifyApiKey = useSettingsStore((s) => s.verifyApiKey)
  const modelConfigs = useSettingsStore((s) => s.modelConfigs)
  const { success, error, warning } = useToastStore()

  const [pendingModel, setPendingModel] = useState(activeModel)
  const [verifying, setVerifying] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [localVisionId, setLocalVisionId] = useState(visionModelId)

  // sync from parent
  useEffect(() => {
    setPendingModel(activeModel)
  }, [activeModel])

  useEffect(() => {
    setLocalVisionId(visionModelId)
  }, [visionModelId])

  const handleLogout = useCallback(async () => {
    if (!window.confirm('确定退出登录？')) return
    await newapiLogout()
    success('已退出登录')
  }, [newapiLogout, success])

  const handleRefreshUser = useCallback(async () => {
    await newapiRefreshUser()
  }, [newapiRefreshUser])

  const handleVerify = useCallback(async () => {
    if (!pendingModel) {
      warning('请先选择模型。')
      return
    }
    setVerifying(true)
    setVerificationMessage(null)
    try {
      const config = modelConfigs.find((c) => c.active)
      if (!config) return
      const valid = await verifyApiKey(
        config.provider,
        config.apiKey,
        pendingModel,
        config.baseUrl,
        30000
      )
      const msg = useSettingsStore.getState().verificationMessage
      if (valid) {
        success('连接验证成功', { description: msg || '模型连接正常。' })
      } else {
        error('连接验证失败', { description: msg || '请检查模型配置。' })
      }
    } finally {
      setVerifying(false)
    }
  }, [pendingModel, modelConfigs, verifyApiKey, setVerificationMessage, success, error, warning])

  const handleSave = useCallback(async () => {
    if (!pendingModel) {
      warning('请先选择模型。')
      return
    }
    setSavingModel(true)
    try {
      await newapiSetModel(pendingModel)
      const saveError = useSettingsStore.getState().verificationMessage
      if (saveError) {
        error('保存失败', { description: saveError })
        return
      }
      success('模型已保存')
    } finally {
      setSavingModel(false)
    }
  }, [pendingModel, newapiSetModel, success, error, warning])

  const handleVisionChange = useCallback(
    async (id: string) => {
      const value = id === '__default__' ? '' : id
      setLocalVisionId(value)
      setVerificationMessage(null)
      try {
        const { saveSettings } = useSettingsStore.getState()
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
    },
    [setVerificationMessage, success, error, t]
  )

  const modelChanged = pendingModel !== activeModel

  const modelOptions = useMemo(() => models, [models])

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between p-5 pb-3">
          <CardTitle className="text-base">账号信息</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => void handleRefreshUser()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          {newapiUser && (
            <div className="rounded-lg border border-[#96b77f]/80 bg-[#eef6e8] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#5d7b4d]" />
                    <span className="font-medium text-[#33402a]">
                      {newapiUser.displayName || newapiUser.username}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">@{newapiUser.username}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={newapiLoading}
                  onClick={() => void handleLogout()}
                >
                  <LogOut className="mr-1.5 h-4 w-4" />
                  退出登录
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-white/60 p-2.5 text-xs">
                <div>
                  <span className="text-muted-foreground">剩余额度</span>
                  <p className="mt-0.5 font-semibold text-[#3e4a32]">
                    {formatQuota(newapiUser.quota, newapiUser.usedQuota)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">账号状态</span>
                  <p className="mt-0.5 font-semibold text-[#3e4a32]">
                    {newapiUser.status === 1 ? (
                      <span className="text-[#5d7b4d]">正常</span>
                    ) : (
                      <span className="text-red-600">异常</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">模型选择</CardTitle>
          {activeModel && (
            <p className="mt-1 text-xs text-muted-foreground">当前模型：{activeModel}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          <div>
            <label className="mb-1.5 block text-sm font-medium">选择模型</label>
            <Select value={pendingModel} onValueChange={setPendingModel}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="选择可用模型" />
              </SelectTrigger>
              <SelectContent>
                <ModelSelectItems models={modelOptions} />
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              模型列表来自平台，不同账号可用的模型可能不同。
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t('settings.visionModel')}</label>
            <Select
              value={localVisionId || '__default__'}
              onValueChange={(v) => void handleVisionChange(v)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t('settings.visionModelFollowDefault')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  {t('settings.visionModelFollowDefault')}
                </SelectItem>
                <ModelSelectItems models={modelOptions} />
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">{t('settings.visionModelHint')}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              disabled={verifying || !pendingModel}
              onClick={() => void handleVerify()}
              className="rounded-lg border border-[#7ea06f]/45"
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              {verifying ? '验证中...' : '验证连接'}
            </Button>
            <Button disabled={savingModel || !modelChanged} onClick={() => void handleSave()}>
              <Save className="mr-1.5 h-4 w-4" />
              {savingModel ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
})

// ── Main page ──

export function SettingsPage(): React.JSX.Element {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const setVerificationMessage = useSettingsStore((s) => s.setVerificationMessage)
  const chooseStoragePath = useSettingsStore((s) => s.chooseStoragePath)
  const newapiFetchStatus = useSettingsStore((s) => s.newapiFetchStatus)
  const newapiLoggedIn = useSettingsStore((s) => s.newapiLoggedIn)
  const newapiModels = useSettingsStore((s) => s.newapiModels)
  const modelConfigs = useSettingsStore((s) => s.modelConfigs)
  const settings = useSettingsStore((s) => s.settings)
  const { success, error, info } = useToastStore()
  const { lang, setLang, t } = useLang()

  const [storagePath, setStoragePath] = useState(() => settings?.storagePath || '')
  const [timeoutSeconds, setTimeoutSeconds] = useState<
    Record<ConfigurableModelTimeoutProfile, number>
  >(() => createTimeoutSeconds(settings?.timeouts))
  const [savingTimeouts, setSavingTimeouts] = useState(false)
  const [stylesCloudUrl, setStylesCloudUrl] = useState(() => settings?.stylesCloudUrl || '')

  const activeModel = modelConfigs.find((c) => c.active)?.model || ''
  const visionModelId = settings?.visionModelId || ''

  useEffect(() => {
    let active = true
    const load = async () => {
      await Promise.all([fetchSettings(), newapiFetchStatus()])
      if (!active) return
      const s = useSettingsStore.getState().settings
      setStoragePath(s?.storagePath || '')
      setTimeoutSeconds(createTimeoutSeconds(s?.timeouts))
      setStylesCloudUrl(s?.stylesCloudUrl || '')
    }
    void load()
    return () => {
      active = false
    }
  }, [fetchSettings, newapiFetchStatus])

  const timeoutFields = useMemo(
    () =>
      [
        { profile: 'planning', label: t('settings.timeoutPlanning'), hint: t('settings.timeoutPlanningHint'), min: 120 },
        { profile: 'design', label: t('settings.timeoutDesign'), hint: t('settings.timeoutDesignHint'), min: 120 },
        { profile: 'agent', label: t('settings.timeoutAgent'), hint: t('settings.timeoutAgentHint'), min: 300 },
        { profile: 'document', label: t('settings.timeoutDocument'), hint: t('settings.timeoutDocumentHint'), min: 300 }
      ] as const,
    [t]
  )

  const handleTimeoutChange = useCallback(
    (profile: ConfigurableModelTimeoutProfile, value: string) => {
      setTimeoutSeconds((current) => ({
        ...current,
        [profile]: modelTimeoutMsToSeconds(Number(value) * 1000, profile)
      }))
      setVerificationMessage(null)
    },
    [setVerificationMessage]
  )

  const handleSaveTimeouts = useCallback(async () => {
    setSavingTimeouts(true)
    setVerificationMessage(null)
    try {
      await saveSettings({
        timeouts: Object.fromEntries(
          CONFIGURABLE_MODEL_TIMEOUT_PROFILES.map((profile) => [profile, timeoutSeconds[profile] * 1000])
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
  }, [timeoutSeconds, saveSettings, setVerificationMessage, success, error, t])

  const handleChoosePath = useCallback(async () => {
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
  }, [chooseStoragePath, saveSettings, setVerificationMessage, error, info, t])

  const handleStylesCloudUrlSave = useCallback(async () => {
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
  }, [stylesCloudUrl, saveSettings, setVerificationMessage, success, error, t])

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
                    onClick={() => void handleChoosePath()}
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
          {!newapiLoggedIn ? (
            <LoginForm />
          ) : (
            <LoggedInPanel
              models={newapiModels}
              activeModel={activeModel}
              visionModelId={visionModelId}
              t={t}
            />
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
            <Button onClick={() => void handleSaveTimeouts()} disabled={savingTimeouts}>
              {savingTimeouts ? t('common.saving') : t('settings.saveTimeouts')}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
