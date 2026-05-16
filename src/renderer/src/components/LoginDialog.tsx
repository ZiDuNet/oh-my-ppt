import { useCallback, useState } from 'react'
import { LogIn } from 'lucide-react'
import { useSettingsStore } from '@renderer/store'
import { useToastStore } from '@renderer/store'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './ui/Dialog'

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps): React.JSX.Element {
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
      onOpenChange(false)
    } else {
      const msg = useSettingsStore.getState().verificationMessage
      error('登录失败', { description: msg || '请检查用户名和密码。' })
    }
  }, [username, password, newapiLogin, success, error, warning, onOpenChange])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !newapiLoading) void handleLogin()
    },
    [handleLogin, newapiLoading]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>登录潮汐平台</DialogTitle>
          <DialogDescription>登录后可使用 AI 模型生成 PPT</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">用户名</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="h-10"
              onKeyDown={onKeyDown}
              autoFocus
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
