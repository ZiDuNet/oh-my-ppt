import { useEffect, useMemo, useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/Select'
import { ipc, type FontListItem, type FontRole, type FontScript } from '@renderer/lib/ipc'
import { useToastStore } from '@renderer/store'
import { FolderOpen, Loader2, Trash2, Type, Upload } from 'lucide-react'

const roleToLabel = (role: FontRole[]): string => {
  const hasTitle = role.includes('title')
  const hasBody = role.includes('body')
  if (hasTitle && hasBody) return '标题/正文'
  if (hasTitle) return '标题'
  if (hasBody) return '正文'
  return '未设置'
}

const roleClassName = (role: FontRole[]): string => {
  const hasTitle = role.includes('title')
  const hasBody = role.includes('body')
  if (hasTitle && hasBody) return 'border-[#bad8b7]/80 bg-[#eef9ec] text-[#4a7a46]'
  if (hasTitle) return 'border-[#d6c08d]/80 bg-[#fff7e8] text-[#7c6a4c]'
  if (hasBody) return 'border-[#bdd2e6]/80 bg-[#eef6ff] text-[#3e6685]'
  return 'border-[#d5cfc5]/60 bg-[#f9f6f1] text-[#6b6560]'
}

const scriptsToLabel = (scripts: FontScript[]): string => {
  const hasLatin = scripts.includes('latin')
  const hasCjk = scripts.includes('cjk')
  if (hasLatin && hasCjk) return '中英混排'
  if (hasCjk) return '中文'
  if (hasLatin) return '英文'
  return '未设置'
}

const scriptsClassName = (scripts: FontScript[]): string => {
  const hasLatin = scripts.includes('latin')
  const hasCjk = scripts.includes('cjk')
  if (hasLatin && hasCjk) return 'border-[#c8b8d4]/80 bg-[#f4eff8] text-[#5e4a72]'
  if (hasCjk) return 'border-[#d6c08d]/80 bg-[#fff7e8] text-[#7c6a4c]'
  if (hasLatin) return 'border-[#c5d4c0]/80 bg-[#f0f6ec] text-[#4a6940]'
  return 'border-[#d5cfc5]/60 bg-[#f9f6f1] text-[#6b6560]'
}

const categoryLabel: Record<string, string> = {
  brand: '品牌',
  'sans-body': '无衬线正文',
  'sans-title': '无衬线标题',
  serif: '衬线',
  display: '展示',
  handwriting: '手写',
  mono: '等宽',
  'cjk-sans': '中文无衬线',
  'cjk-serif': '中文衬线',
  'cjk-display': '中文展示'
}

const roleFromValue = (value: string): FontRole[] => {
  if (value === 'title') return ['title']
  if (value === 'body') return ['body']
  return ['title', 'body']
}

const scriptsFromValue = (value: string): FontScript[] => {
  if (value === 'latin') return ['latin']
  if (value === 'cjk') return ['cjk']
  return ['latin', 'cjk']
}

export function FontsPage(): React.JSX.Element {
  const { success, error } = useToastStore()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [googleFonts, setGoogleFonts] = useState<FontListItem[]>([])
  const [userFonts, setUserFonts] = useState<FontListItem[]>([])
  const [family, setFamily] = useState('')
  const [category, setCategory] = useState('brand')
  const [role, setRole] = useState('both')
  const [scripts, setScripts] = useState('')
  const [weight, setWeight] = useState('400')
  const [filePaths, setFilePaths] = useState<string[]>([])

  const loadFonts = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await ipc.listFonts()
      setGoogleFonts(result.googleFonts)
      setUserFonts(result.userFonts)
    } catch (err) {
      error('字体加载失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFonts()
  }, [])

  const selectedFileLabel = useMemo(() => {
    if (filePaths.length === 0) return null
    if (filePaths.length === 1) return filePaths[0].split(/[\\/]/).pop() || filePaths[0]
    return `${filePaths.length} 个文件`
  }, [filePaths])

  const handleChooseFiles = async (): Promise<void> => {
    try {
      const result = await ipc.chooseFontFiles()
      if (!result.canceled) setFilePaths(result.filePaths || [])
    } catch (err) {
      error('选择字体失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    }
  }

  const handleUpload = async (): Promise<void> => {
    const familyText = family.trim()
    if (!familyText) {
      error('请填写字体族名称')
      return
    }
    if (filePaths.length === 0) {
      error('请选择 .woff2 字体文件')
      return
    }
    if (!scripts) {
      error('请选择适用文字')
      return
    }
    const parsedWeight = Number.parseInt(weight, 10)
    setUploading(true)
    try {
      await ipc.uploadFont({
        family: familyText,
        category,
        role: roleFromValue(role),
        scripts: scriptsFromValue(scripts),
        files: filePaths.map((filePath) => ({
          path: filePath,
          weight: Number.isFinite(parsedWeight) ? parsedWeight : 400,
          style: 'normal'
        }))
      })
      success('字体已上传')
      setFamily('')
      setCategory('brand')
      setRole('both')
      setScripts('')
      setWeight('400')
      setFilePaths([])
      await loadFonts()
    } catch (err) {
      error('字体上传失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (font: FontListItem): Promise<void> => {
    try {
      await ipc.deleteFont(font.id)
      success('字体已删除')
      await loadFonts()
    } catch (err) {
      error('字体删除失败', {
        description: err instanceof Error ? err.message : '请稍后重试'
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Fonts</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">
            字体管理
          </h1>
          <Button size="sm" variant="outline" onClick={() => void ipc.revealFontsFolder()}>
            <FolderOpen className="mr-2 h-4 w-4" />
            打开字体目录
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          管理本机上传字体，生成时在首页选择字体方案，默认自动匹配。
        </p>
      </div>

      <div className="space-y-4">
        {/* Upload card */}
        <Card>
          <CardHeader className="flex-row items-center justify-between p-5 pb-3">
            <CardTitle className="text-base">上传字体</CardTitle>
            <span className="text-[11px] text-muted-foreground">仅支持 .woff2</span>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px_80px]">
              <div>
                <label className="mb-1 block text-sm font-medium">字体族名称</label>
                <Input
                  placeholder="My Brand Sans"
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">适用位置</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">标题和正文</SelectItem>
                    <SelectItem value="title">标题</SelectItem>
                    <SelectItem value="body">正文</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">适用文字</label>
                <Select value={scripts} onValueChange={setScripts}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latin">英文</SelectItem>
                    <SelectItem value="cjk">中文</SelectItem>
                    <SelectItem value="mixed">中英混排</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">字重</label>
                <Input
                  value={weight}
                  inputMode="numeric"
                  onChange={(e) => setWeight(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32">
                <label className="mb-1 block text-sm font-medium">分类</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabel).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-[#7ea06f]/45"
                  onClick={() => void handleChooseFiles()}
                >
                  <Type className="mr-1.5 h-3.5 w-3.5" />
                  选择文件
                </Button>
                {selectedFileLabel && (
                  <span className="truncate text-xs text-muted-foreground">{selectedFileLabel}</span>
                )}
              </div>
              <div className="ml-auto">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 min-w-[96px]"
                  onClick={() => void handleUpload()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  上传
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User fonts */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">已上传字体</CardTitle>
            {userFonts.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{userFonts.length} 个字体</p>
            )}
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">加载中...</p>
            ) : userFonts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#d8ccb5]/85 bg-[#fff9ef]/70 py-6 text-center text-sm text-muted-foreground">
                还没有上传字体，在上方表单添加你的品牌字体。
              </div>
            ) : (
              <div className="space-y-2">
                {userFonts.map((font) => (
                  <div
                    key={font.id}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3 transition-all hover:border-[#c4b89e]/90 hover:shadow-[0_8px_20px_rgba(90,72,52,0.1)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#33402a]">{font.family}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`rounded-md border px-1.5 py-0.5 font-medium ${roleClassName(font.role)}`}>
                          {roleToLabel(font.role)}
                        </span>
                        <span className={`rounded-md border px-1.5 py-0.5 font-medium ${scriptsClassName(font.scripts)}`}>
                          {scriptsToLabel(font.scripts)}
                        </span>
                        <span className="rounded-md border border-[#d5cfc5]/60 bg-[#f9f6f1] px-1.5 py-0.5 text-[#6b6560]">
                          {categoryLabel[font.category] || font.category}
                        </span>
                        <span className="text-muted-foreground">
                          {font.files?.length || 0} 文件
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => void handleDelete(font)}
                      aria-label={`删除 ${font.family}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Google fonts */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">内置 Google Fonts</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  通过 CDN 加载，生成时自动匹配或手动选择。
                </p>
              </div>
              <span className="rounded-full bg-[#e9efde] px-2.5 py-0.5 text-[11px] font-medium text-[#506141]">
                {googleFonts.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="max-h-[460px] overflow-auto pr-1">
              <div className="grid gap-2 sm:grid-cols-2">
                {googleFonts.map((font) => (
                  <div
                    key={font.id}
                    className="rounded-lg border border-[#d8ccb5]/60 bg-[#fffdf8]/50 px-3 py-2.5 transition-colors hover:border-[#c4b89e]/80 hover:bg-[#fffdf8]"
                  >
                    <p className="text-sm font-medium text-[#33402a]">{font.family}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={`rounded-md border px-1.5 py-0.5 font-medium ${roleClassName(font.role)}`}>
                        {roleToLabel(font.role)}
                      </span>
                      <span className={`rounded-md border px-1.5 py-0.5 font-medium ${scriptsClassName(font.scripts)}`}>
                        {scriptsToLabel(font.scripts)}
                      </span>
                      <span className="text-muted-foreground">{font.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
