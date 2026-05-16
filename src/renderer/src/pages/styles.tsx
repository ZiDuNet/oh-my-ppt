import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '../components/ui/AlertDialog'
import { ipc } from '@renderer/lib/ipc'
import { useToastStore } from '../store'
import { Plus, PencilLine, Trash2, RefreshCw } from 'lucide-react'
import { useT } from '../i18n'

type StyleSource = 'builtin' | 'custom' | 'override' | 'cloud'
type FilterTab = 'all' | 'builtin' | 'cloud' | 'custom'

type StyleSummary = {
  id: string
  label: string
  description: string
  source?: StyleSource
  editable?: boolean
  category: string
  createdAt?: number
  updatedAt?: number
}

function isBuiltinSource(source?: StyleSource): boolean {
  return source === 'builtin' || source === 'override'
}

function sourceLabel(source: StyleSource | undefined, t: (key: string) => string): string {
  if (source === 'cloud') return t('styles.filterCloud')
  if (source === 'custom') return t('styles.filterCustom')
  return t('styles.sourceBuiltin')
}

export function StylesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [styles, setStyles] = useState<StyleSummary[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [deleteTarget, setDeleteTarget] = useState<StyleSummary | null>(null)
  const [syncing, setSyncing] = useState(false)
  const { error, info } = useToastStore()
  const t = useT()

  const loadStyles = useCallback(async (): Promise<void> => {
    try {
      const { items } = await ipc.listStyles()
      const sorted = [...items].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      setStyles(sorted)
    } catch (e) {
      error(t('styles.loadFailed'), {
        description: e instanceof Error ? e.message : t('common.retryLater'),
      })
    }
  }, [error, t])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStyles()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadStyles])

  const filteredStyles = (() => {
    switch (filter) {
      case 'builtin': return styles.filter((s) => isBuiltinSource(s.source))
      case 'cloud': return styles.filter((s) => s.source === 'cloud')
      case 'custom': return styles.filter((s) => s.source === 'custom')
      default: return styles
    }
  })()

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('styles.filterAll') },
    { key: 'builtin', label: t('styles.filterBuiltin') },
    { key: 'cloud', label: t('styles.filterCloud') },
    { key: 'custom', label: t('styles.filterCustom') },
  ]

  const handleSyncCloud = async (): Promise<void> => {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await ipc.syncStylesFromCloud()
      if (result.added > 0 || result.updated > 0) {
        info(t('styles.syncSuccess', { added: result.added, updated: result.updated }))
        await loadStyles()
      } else {
        info(t('styles.syncNoChanges'))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'cloud_url_not_set') {
        error(t('styles.cloudUrlNotSet'))
      } else {
        error(t('styles.syncFailed'), {
          description: msg || undefined,
        })
      }
    } finally {
      setSyncing(false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    const style = deleteTarget
    if (!style) return
    setDeleteTarget(null)
    try {
      const result = await ipc.deleteStyle(style.id)
      if (result.deleted) {
        info(t('styleEditor.deleted'))
        setStyles((prev) => prev.filter((s) => s.id !== style.id))
      } else {
        error(t('styleEditor.deleteFailed'), {
          description: result.message || t('styleEditor.cannotDelete'),
        })
      }
    } catch (e) {
      error(t('styleEditor.deleteFailed'), {
        description: e instanceof Error ? e.message : '',
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{t('styles.eyebrow')}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">{t('styles.title')}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <Button size="sm" variant="outline" onClick={() => void handleSyncCloud()} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {t('styles.syncFromCloud')}
            </Button>
            <Button size="sm" className="min-w-[112px]" onClick={() => navigate('/styles/new')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('styles.newStyle')}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t('styles.description')}</p>
      </div>

      {/* 过滤按钮 */}
      <div className="mb-4 flex items-center gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.key
                ? 'bg-[#3e4a32] text-white shadow-sm'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {filteredStyles.map((style) => (
          <Card
            key={style.id}
            className="group !rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(88,75,56,0.18)]"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="truncate transition-colors duration-200 group-hover:text-foreground">{style.label}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="transition-all duration-200 group-hover:-translate-y-0.5"
                  onClick={() => navigate(`/styles/${style.id}`)}
                >
                  <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                  {t('common.edit')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-2 text-sm text-muted-foreground transition-colors duration-200 group-hover:text-foreground/85">
                {style.description || style.id}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground transition-colors duration-200 group-hover:text-foreground/70">
                  {style.category} · {sourceLabel(style.source, t)}
                </p>
                {!isBuiltinSource(style.source) && style.source !== 'cloud' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(style)
                    }}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground/60 opacity-0 transition-all duration-200 hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('styleEditor.deleteConfirmDescription', { name: deleteTarget?.label || '' })}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void confirmDelete() }}
              className="bg-red-500/90 text-white hover:bg-red-600"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
