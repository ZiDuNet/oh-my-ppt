import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { LoginDialog } from '../components/LoginDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/Select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { useSettingsStore } from '../store'
import { useSearchParams } from 'react-router-dom'
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
import { formatQuota } from '@renderer/lib/ipc'

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
  const newapiSetModel = useSettingsStore((s) => s.newapiSetModel)
  const setVerificationMessage = useSettingsStore((s) => s.setVerificationMessage)
  const verifyApiKey = useSettingsStore((s) => s.verifyApiKey)
  const modelConfigs = useSettingsStore((s) => s.modelConfigs)
  const newapiFetchModels = useSettingsStore((s) => s.newapiFetchModels)
  const { success, error, warning } = useToastStore()

  const [fetchingModels, setFetchingModels] = useState(false)

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

  const handleFetchModels = useCallback(async () => {
    setFetchingModels(true)
    await newapiFetchModels()
    setFetchingModels(false)
  }, [newapiFetchModels])

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">模型选择</CardTitle>
          {activeModel && (
            <p className="mt-1 text-xs text-muted-foreground">当前模型：{activeModel}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium">选择模型</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                disabled={fetchingModels}
                onClick={() => void handleFetchModels()}
              >
                <RefreshCw className={`h-3 w-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                {fetchingModels ? '获取中...' : '获取模型'}
              </Button>
            </div>
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

// ── Usage panel ──

function UsagePanel(): React.JSX.Element {
  const newapiUser = useSettingsStore((s) => s.newapiUser)
  const newapiLoading = useSettingsStore((s) => s.newapiLoading)
  const newapiLogout = useSettingsStore((s) => s.newapiLogout)
  const newapiLogs = useSettingsStore((s) => s.newapiLogs)
  const newapiLogsTotal = useSettingsStore((s) => s.newapiLogsTotal)
  const newapiLogsPage = useSettingsStore((s) => s.newapiLogsPage)
  const newapiTokenUsage = useSettingsStore((s) => s.newapiTokenUsage)
  const newapiSubscription = useSettingsStore((s) => s.newapiSubscription)
  const newapiPlans = useSettingsStore((s) => s.newapiPlans)
  const newapiFetchLogs = useSettingsStore((s) => s.newapiFetchLogs)
  const newapiFetchTokenUsage = useSettingsStore((s) => s.newapiFetchTokenUsage)
  const newapiRefreshUser = useSettingsStore((s) => s.newapiRefreshUser)
  const newapiFetchSubscription = useSettingsStore((s) => s.newapiFetchSubscription)
  const { success } = useToastStore()

  useEffect(() => {
    void Promise.all([newapiFetchLogs(0, 20), newapiFetchTokenUsage(), newapiFetchSubscription()])
  }, [newapiFetchLogs, newapiFetchTokenUsage, newapiFetchSubscription])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      newapiRefreshUser(),
      newapiFetchLogs(newapiLogsPage, 20),
      newapiFetchTokenUsage(),
      newapiFetchSubscription()
    ])
  }, [newapiRefreshUser, newapiFetchLogs, newapiFetchTokenUsage, newapiFetchSubscription, newapiLogsPage])

  const handleLogout = useCallback(async () => {
    if (!window.confirm('确定退出登录？')) return
    await newapiLogout()
    success('已退出登录')
  }, [newapiLogout, success])

  const totalPages = Math.ceil(newapiLogsTotal / 20)

  const formatTime = (ts: number) => {
    if (!ts) return '-'
    const d = new Date(ts * 1000)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const activeSub = newapiSubscription?.subscriptions?.[0]
  const activePlan = activeSub ? newapiPlans.find((p) => p.id === activeSub.planId) : null

  const billingLabel = (val: string) => {
    if (val === 'subscription_first' || val === '优先订阅') return '优先订阅'
    if (val === 'wallet_first' || val === '优先钱包') return '优先钱包'
    if (val === 'subscription_only' || val === '仅用订阅') return '仅用订阅'
    if (val === 'wallet_only' || val === '仅用钱包') return '仅用钱包'
    return val
  }

  const durationLabel = (unit: string, value: number) => {
    const u = unit === 'month' ? '个月' : unit === 'year' ? '年' : unit === 'day' ? '天' : unit
    return `${value} ${u}`
  }

  return (
    <>
      {/* 账号信息 + 额度 合并 */}
      {newapiUser && (
        <Card className="mb-3">
          <CardHeader className="flex-row items-center justify-between p-3 pb-2">
            <CardTitle className="text-sm">账号信息</CardTitle>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => void handleRefresh()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={newapiLoading}
                onClick={() => void handleLogout()}
              >
                <LogOut className="h-3 w-3" />
                退出
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 text-xs">
            {/* 用户行 */}
            <div className="flex items-center gap-2 rounded-md border border-[#96b77f]/60 bg-[#eef6e8]/70 px-2.5 py-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4a5a3d] text-[11px] font-bold text-white">
                {(newapiUser.displayName || newapiUser.username).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#5d7b4d]" />
                  <span className="truncate font-medium text-[#33402a]">
                    {newapiUser.displayName || newapiUser.username}
                  </span>
                  <span className="text-[10px] text-muted-foreground">@{newapiUser.username}</span>
                  <span className={`ml-auto shrink-0 text-[10px] font-medium ${newapiUser.status === 1 ? 'text-[#5d7b4d]' : 'text-red-600'}`}>
                    {newapiUser.status === 1 ? '正常' : '异常'}
                  </span>
                </div>
              </div>
            </div>
            {/* 信息网格 */}
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
              <div><span>邮箱：</span><span className="text-[#3e4a32]">{newapiUser.email || '-'}</span></div>
              <div><span>用户组：</span><span className="text-[#3e4a32]">{newapiUser.group || '-'}</span></div>
              <div><span>角色：</span><span className="text-[#3e4a32]">{newapiUser.role === 100 ? '超级管理员' : newapiUser.role === 10 ? '管理员' : '用户'}</span></div>
              <div><span>请求次数：</span><span className="text-[#3e4a32]">{newapiUser.requestCount}</span></div>
            </div>
            {/* 额度行 */}
            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div className="rounded border border-[#96b77f]/30 bg-[#eef6e8]/40 px-2 py-1.5">
                <span className="text-muted-foreground">总额度</span>
                <p className="font-semibold text-[#3e4a32]">{formatQuota(newapiUser.quota)}</p>
              </div>
              <div className="rounded border border-[#96b77f]/30 bg-[#eef6e8]/40 px-2 py-1.5">
                <span className="text-muted-foreground">已用</span>
                <p className="font-semibold text-[#3e4a32]">{formatQuota(newapiUser.usedQuota)}</p>
              </div>
              <div className="rounded border border-[#96b77f]/30 bg-[#eef6e8]/40 px-2 py-1.5">
                <span className="text-muted-foreground">令牌剩余</span>
                <p className="font-semibold text-[#3e4a32]">
                  {newapiTokenUsage?.unlimitedQuota ? '无限制' : formatQuota(newapiTokenUsage?.remainQuota)}
                </p>
              </div>
              <div className="rounded border border-[#96b77f]/30 bg-[#eef6e8]/40 px-2 py-1.5">
                <span className="text-muted-foreground">令牌已用</span>
                <p className="font-semibold text-[#3e4a32]">{formatQuota(newapiTokenUsage?.usedQuota)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 订阅信息 */}
      <Card className="mb-3">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">订阅信息</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {activeSub ? (
            <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-[#4a5a3d] to-[#3e4a32] px-3 py-2.5 text-white shadow-md">
              <div className="pointer-events-none absolute -right-5 -top-5 h-14 w-14 rounded-full bg-white/5" />
              <div className="relative flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {activePlan?.title || `套餐 #${activeSub.planId}`}
                </span>
                <span
                  className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${
                    activeSub.status === 'active'
                      ? 'bg-[#a8d98a]/30 text-[#d4f5b8]'
                      : 'bg-white/10 text-white/60'
                  }`}
                >
                  {activeSub.status === 'active' ? '有效' : activeSub.status}
                </span>
              </div>
              <div className="relative mt-1.5 grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <span className="text-white/40">总额度</span>
                  <p className="font-medium text-white/80">{activeSub.amountTotal === 0 ? '无限' : formatQuota(activeSub.amountTotal)}</p>
                </div>
                <div>
                  <span className="text-white/40">已用</span>
                  <p className="font-medium text-white/80">{formatQuota(activeSub.amountUsed)}</p>
                </div>
                {activeSub.endTime > 0 && (
                  <div>
                    <span className="text-white/40">到期</span>
                    <p className="font-medium text-white/80">
                      {new Date(activeSub.endTime * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
              <div className="relative mt-1.5 grid grid-cols-3 gap-2 text-[10px]">
                {activeSub.startTime > 0 && (
                  <div>
                    <span className="text-white/40">开始</span>
                    <p className="font-medium text-white/80">
                      {new Date(activeSub.startTime * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                )}
                {newapiSubscription?.billingPreference && (
                  <div>
                    <span className="text-white/40">计费</span>
                    <p className="font-medium text-white/80">{billingLabel(newapiSubscription.billingPreference)}</p>
                  </div>
                )}
                {activePlan && (
                  <div>
                    <span className="text-white/40">时长/价格</span>
                    <p className="font-medium text-white/80">
                      {durationLabel(activePlan.durationUnit, activePlan.durationValue)} · {activePlan.priceAmount}{activePlan.currency?.toUpperCase() || 'CNY'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-[#96b77f]/40 px-3 py-2.5 text-xs">
              <div>
                <span className="font-medium text-[#5d6b4d]">未订阅任何套餐</span>
                <span className="ml-2 text-muted-foreground">订阅可获得更多额度</span>
              </div>
              <a
                href="https://new-api.chaoxi.live/console/topup"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded bg-[#d4e4c1]/80 px-2.5 py-1 text-[11px] font-medium text-[#4a5a3d] hover:bg-[#d4e4c1]"
              >
                去订阅
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 调用日志 */}
      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">调用日志</CardTitle>
          <p className="text-[11px] text-muted-foreground">共 {newapiLogsTotal} 条</p>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {newapiLogs.length === 0 ? (
            <p className="py-5 text-center text-xs text-muted-foreground">暂无调用记录</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-[10px] text-muted-foreground">
                      <th className="pb-1.5 pr-2 font-medium">时间</th>
                      <th className="pb-1.5 pr-2 font-medium">模型</th>
                      <th className="pb-1.5 pr-2 font-medium text-right">额度</th>
                      <th className="pb-1.5 pr-2 font-medium text-right">输入</th>
                      <th className="pb-1.5 pr-2 font-medium text-right">输出</th>
                      <th className="pb-1.5 pr-2 font-medium text-right">耗时</th>
                      <th className="pb-1.5 font-medium">计费</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newapiLogs.map((log) => (
                      <tr key={log.id} className="border-b border-border/30 last:border-0">
                        <td className="py-1.5 pr-2 whitespace-nowrap text-[10px] text-muted-foreground">
                          {formatTime(log.createdAt)}
                        </td>
                        <td className="py-1.5 pr-2 font-medium text-[#3e4a32]">
                          {log.modelName}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {log.quota}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                          {log.promptTokens}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                          {log.completionTokens}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                          {log.useTime}s
                        </td>
                        <td className="py-1.5 text-[10px] text-muted-foreground">
                          {log.billingSource === 'subscription' ? '订阅' : log.billingSource || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={newapiLogsPage === 0}
                    onClick={() => void newapiFetchLogs(newapiLogsPage - 1, 20)}
                  >
                    上一页
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {newapiLogsPage + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={newapiLogsPage >= totalPages - 1}
                    onClick={() => void newapiFetchLogs(newapiLogsPage + 1, 20)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ── Main page ──

export function SettingsPage(): React.JSX.Element {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const setVerificationMessage = useSettingsStore((s) => s.setVerificationMessage)
  const chooseStoragePath = useSettingsStore((s) => s.chooseStoragePath)
  const newapiFetchStatus = useSettingsStore((s) => s.newapiFetchStatus)
  const newapiLoggedIn = useSettingsStore((s) => s.newapiLoggedIn)
  const newapiModels = useSettingsStore((s) => s.newapiModels)
  const newapiFetchModels = useSettingsStore((s) => s.newapiFetchModels)
  const modelConfigs = useSettingsStore((s) => s.modelConfigs)
  const settings = useSettingsStore((s) => s.settings)
  const { success, error, info } = useToastStore()
  const { lang, setLang, t } = useLang()
  const [settingsLoginOpen, setSettingsLoginOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'general'
  const [activeTab, setActiveTab] = useState(initialTab)

  const [storagePath, setStoragePath] = useState(() => settings?.storagePath || '')
  const [timeoutSeconds, setTimeoutSeconds] = useState<
    Record<ConfigurableModelTimeoutProfile, number>
  >(() => createTimeoutSeconds(settings?.timeouts))
  const [savingTimeouts, setSavingTimeouts] = useState(false)
  const [stylesCloudUrl, setStylesCloudUrl] = useState(() => settings?.stylesCloudUrl || '')

  const activeModel = modelConfigs.find((c) => c.active)?.model || ''
  const visionModelId = settings?.visionModelId || ''

  // 切到模型接入 tab 时拉取模型列表
  useEffect(() => {
    if (activeTab === 'model' && newapiLoggedIn) {
      void newapiFetchModels()
    }
  }, [activeTab, newapiLoggedIn, newapiFetchModels])

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">{t('settings.generalTab')}</TabsTrigger>
          <TabsTrigger value="model">{t('settings.modelTab')}</TabsTrigger>
          <TabsTrigger value="advanced">{t('settings.advancedTab')}</TabsTrigger>
          {newapiLoggedIn && <TabsTrigger value="usage">账户信息</TabsTrigger>}
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
            <Card>
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base">模型接入</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  请先登录潮汐平台账号，登录后可配置 AI 模型。
                </p>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <Button onClick={() => setSettingsLoginOpen(true)}>
                  <LogIn className="mr-1.5 h-4 w-4" />
                  登录
                </Button>
              </CardContent>
            </Card>
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

        {newapiLoggedIn && (
          <TabsContent value="usage">
            <UsagePanel />
          </TabsContent>
        )}
      </Tabs>
      <LoginDialog open={settingsLoginOpen} onOpenChange={setSettingsLoginOpen} />
    </div>
  )
}
