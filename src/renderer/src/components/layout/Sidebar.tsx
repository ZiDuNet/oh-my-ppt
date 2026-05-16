import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { Home, FolderOpen, Settings, Plus, ArrowLeft, SwatchBook, LogIn, LogOut } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import logoUrl from '@renderer/assets/images/logo.png'
import { useT } from '@renderer/i18n'
import { ipc, formatQuota } from '@renderer/lib/ipc'
import { useSettingsStore } from '@renderer/store'
import { useToastStore } from '@renderer/store'
import { LoginDialog } from '../LoginDialog'

export function Sidebar(): React.JSX.Element {
  const location = useLocation()
  const t = useT()
  const { success } = useToastStore()
  const isDetailPage = location.pathname.startsWith('/sessions/') && location.pathname !== '/sessions'
  const [appVersion, setAppVersion] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)

  // NewAPI 状态
  const newapiLoggedIn = useSettingsStore((s) => s.newapiLoggedIn)
  const newapiUser = useSettingsStore((s) => s.newapiUser)
  const newapiLogout = useSettingsStore((s) => s.newapiLogout)
  const newapiLoading = useSettingsStore((s) => s.newapiLoading)
  const newapiFetchStatus = useSettingsStore((s) => s.newapiFetchStatus)
  const modelConfigs = useSettingsStore((s) => s.modelConfigs)
  const newapiSubscription = useSettingsStore((s) => s.newapiSubscription)
  const newapiPlans = useSettingsStore((s) => s.newapiPlans)
  const newapiFetchSubscription = useSettingsStore((s) => s.newapiFetchSubscription)

  const activeModelName = modelConfigs.find((c) => c.active)?.model || ''
  const settings = useSettingsStore((s) => s.settings)
  const visionModelName = settings?.visionModelId || ''

  // 初始化时获取登录状态
  useEffect(() => {
    let disposed = false
    const init = async () => {
      await newapiFetchStatus()
    }
    if (!disposed) void init()
    return () => {
      disposed = true
    }
  }, [newapiFetchStatus])

  // 登录后获取订阅
  useEffect(() => {
    if (newapiLoggedIn) {
      void newapiFetchSubscription()
    }
  }, [newapiLoggedIn, newapiFetchSubscription])

  // 获取版本号
  useEffect(() => {
    let disposed = false
    void ipc
      .getAppVersion()
      .then((result) => {
        if (!disposed) {
          setAppVersion(String(result?.version || ''))
        }
      })
      .catch(() => {
        if (!disposed) setAppVersion('')
      })
    return () => {
      disposed = true
    }
  }, [])

  const handleLogout = async () => {
    if (!window.confirm('确定退出登录？')) return
    await newapiLogout()
    success('已退出登录')
  }

  const navItems = [
    { path: '/', icon: Home, label: t('nav.home') },
    { path: '/sessions', icon: FolderOpen, label: t('nav.sessions') },
    { path: '/styles', icon: SwatchBook, label: t('nav.styles') },
    { path: '/settings', icon: Settings, label: t('nav.settings') },
  ]

  return (
    <aside className="flex h-full w-full flex-col bg-transparent">
      <div className="px-2 pt-1">
        <div className="mt-1 flex items-center gap-1">
          <img src={logoUrl} alt="Oh My PPT" className="h-14 w-14 select-none" draggable={false} />
          <h1 className="organic-serif text-[22px] font-semibold leading-none text-[#3e4a32]">Oh My PPT</h1>
        </div>
        <p className="mt-1 text-xs text-[#7f876e] px-4">{t('nav.tagline')}</p>
        {/* 当前模型 */}
        {newapiLoggedIn && activeModelName && (
          <div className="mt-1.5 space-y-0.5 px-4 text-[10px]">
            {activeModelName && (
              <div className="truncate text-[#4a5a3d]">
                <span className="text-[#7f876e]">主模型：</span><span className="font-medium">{activeModelName}</span>
              </div>
            )}
            {visionModelName && visionModelName !== activeModelName && (
              <div className="truncate text-[#4a5a3d]">
                <span className="text-[#7f876e]">视觉模型：</span><span className="font-medium">{visionModelName}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 pb-4 pt-5">
        {isDetailPage && (
          <Link
            to="/sessions"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#4a5a3d] transition-colors hover:bg-[#efe5d3]/75"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('nav.backToSessions')}
          </Link>
        )}
        {navItems.map((item) => {
          const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-[#dbe7ca]/80 text-[#2f3b28]'
                  : 'text-[#58664a] hover:bg-[#efe5d3]/75 hover:text-[#38452f]'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* 新建演示按钮 */}
      <div className="px-4 pb-3">
        <Link
          to="/"
          className="flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-[#6f8159] to-[#4f613f] px-3 py-2.5 text-[12px] font-medium text-white shadow-lg shadow-[#5d6b4d]/30 transition-all hover:translate-y-[-1px]"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Plus className="h-3.5 w-3.5 shrink-0" />
            {t('nav.newPresentation')}
          </span>
          {appVersion ? <span className="shrink-0 text-[10px] font-normal text-white/70">v{appVersion}</span> : null}
        </Link>
      </div>

      {/* 用户信息区 / 会员卡 */}
      <div className="border-t border-[#d9cfbd]/50 px-3 pb-3 pt-3">
        {newapiLoggedIn && newapiUser ? (
          <div className="space-y-2">
            {/* 会员卡 */}
            <Link to="/settings?tab=usage" className="block">
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#4a5a3d] via-[#5d6b4d] to-[#3e4a32] p-3 shadow-[0_8px_24px_rgba(74,90,61,0.25)]">
                {/* 装饰圆 */}
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/5" />
                <div className="pointer-events-none absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/5" />
                {/* 顶部：头像+名+状态 */}
                <div className="relative flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold text-white">
                    {(newapiUser.displayName || newapiUser.username).charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate text-[13px] font-semibold text-white/95">
                    {newapiUser.displayName || newapiUser.username}
                  </span>
                  {(() => {
                    const sub = newapiSubscription?.subscriptions?.[0]
                    if (sub?.status === 'active') {
                      return (
                        <span className="ml-auto shrink-0 rounded-full bg-[#a8d98a]/30 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-[#d4f5b8]">
                          有效
                        </span>
                      )
                    }
                    return (
                      <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white/50">
                        未订阅
                      </span>
                    )
                  })()}
                </div>
                {/* 套餐/余额信息 */}
                {(() => {
                  const sub = newapiSubscription?.subscriptions?.[0]
                  const plan = sub ? newapiPlans.find((p) => p.id === sub.planId) : null
                  if (sub) {
                    return (
                      <div className="relative mt-2 space-y-1">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-white/50">套餐</span>
                          <span className="text-[11px] font-medium text-white/80">
                            {plan?.title || `套餐 #${sub.planId}`}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-white/50">总额度</span>
                          <span className="text-[11px] font-medium text-white/80">
                            {sub.amountTotal === 0 ? '无限制' : formatQuota(sub.amountTotal)}
                          </span>
                        </div>
                        {sub.endTime > 0 && (
                          <div className="flex items-baseline justify-between">
                            <span className="text-[10px] text-white/50">到期</span>
                            <span className="text-[11px] font-medium text-white/80">
                              {new Date(sub.endTime * 1000).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  }
                  // 无订阅：显示余额
                  return (
                    <div className="relative mt-2 space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-white/50">账户余额</span>
                        <span className="text-[11px] font-medium text-white/80">
                          {formatQuota((newapiUser.quota ?? 0) - (newapiUser.usedQuota ?? 0))}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-white/50">已用</span>
                        <span className="text-[11px] font-medium text-white/80">{formatQuota(newapiUser.usedQuota)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </Link>
            {/* 退出按钮 */}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] text-[#8a7d6e] transition-colors hover:bg-[#efe5d3]/60 hover:text-[#5a5048]"
              disabled={newapiLoading}
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-3 w-3" />
              退出登录
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#d4e4c1]/60 px-3 py-2 text-[12px] font-medium text-[#4a5a3d] transition-colors hover:bg-[#d4e4c1]"
            onClick={() => setLoginOpen(true)}
          >
            <LogIn className="h-3.5 w-3.5" />
            登录潮汐平台
          </button>
        )}
      </div>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </aside>
  )
}
