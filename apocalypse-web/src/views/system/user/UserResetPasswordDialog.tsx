import { KeyRound } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, request } from '@/lib/api/client'
import { useModuleMutation } from '@/lib/query/use-module-mutation'

export interface ResetPasswordUserTarget {
  id: string
  username: string
  nickname?: string | null
}

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length

export function UserResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: ResetPasswordUserTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const newPasswordId = useId()
  const confirmPasswordId = useId()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const mutation = useModuleMutation(undefined, {
    localKey: user?.id ?? '',
    mutationFn: (run, password: string) =>
      run({
        scope: undefined,
        requiredPerms: ['system:user:edit'],
        execute: (transport) =>
          request<void>(`/system/users/${user!.id}/password`, {
            method: 'PUT',
            body: { newPassword: password },
            ...transport,
          }),
      }),
    onSuccess: () => {
      toast.success(`已重置「${user?.nickname || user?.username}」的登录密码`)
      setNewPassword('')
      setConfirmPassword('')
      setValidationError(null)
      onOpenChange(false)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : '重置密码失败，请检查密码策略'),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user || mutation.isPending) return
    if (newPassword.length < 8 || newPassword.length > 64) {
      setValidationError('密码长度须为 8–64 个字符')
      return
    }
    if (utf8Bytes(newPassword) > 72) {
      setValidationError('密码 UTF-8 编码不能超过 72 字节')
      return
    }
    if (newPassword !== confirmPassword) {
      setValidationError('两次输入的新密码不一致')
      return
    }
    setValidationError(null)
    mutation.mutate(newPassword)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRound className="size-3.5 text-brand-text" aria-hidden="true" />
            <span>安全凭证维护 · @{user?.username}</span>
          </div>
          <DialogTitle>重置用户密码</DialogTitle>
          <DialogDescription>
            为「{user?.nickname || user?.username}」设置新密码后，其现有登录会话将被吊销。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={newPasswordId}>新密码</Label>
            <Input
              id={newPasswordId}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value)
                setValidationError(null)
              }}
              placeholder="请输入 8–64 位新密码（含大小写字母与数字）"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={confirmPasswordId}>确认新密码</Label>
            <Input
              id={confirmPasswordId}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                setValidationError(null)
              }}
              placeholder="请再次输入新密码"
              required
            />
          </div>

          {validationError && (
            <p role="alert" className="text-xs text-destructive">
              {validationError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending || !newPassword || !confirmPassword}>
              {mutation.isPending ? '提交中…' : '确认重置'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
