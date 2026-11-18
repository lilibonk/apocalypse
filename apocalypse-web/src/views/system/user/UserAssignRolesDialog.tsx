import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Search, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, request } from '@/lib/api/client'
import type { PageResult, UserRoleSummary } from '@/lib/api/types'
import { useModuleMutation } from '@/lib/query/use-module-mutation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

interface RoleChoice {
  id: string
  roleName: string
  roleKey: string
  status: number
  dataScope?: string | null
}

export interface AssignRoleUserTarget {
  id: string
  username: string
  nickname?: string | null
  roles?: UserRoleSummary[]
}

export function UserAssignRolesDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: AssignRoleUserTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const client = useQueryClient()
  const canReadRoles = useAuthStore((state) => state.hasPerm('system:role:list'))
  const [keyword, setKeyword] = useState('')
  const initialIds = useMemo(() => (user?.roles ?? []).map((role) => String(role.id)), [user])
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds)

  const rolesQuery = useQuery({
    queryKey: ['system', 'roles', 'assign-options'],
    enabled: open && canReadRoles,
    queryFn: ({ signal }) =>
      request<PageResult<RoleChoice>>('/system/roles/page', {
        query: { page: 1, size: 200 },
        signal,
      }),
  })

  const choices = useMemo<RoleChoice[]>(() => {
    const serverList = rolesQuery.data?.list ?? []
    const byId = new Map<string, RoleChoice>()
    for (const role of user?.roles ?? []) {
      byId.set(String(role.id), {
        id: String(role.id),
        roleName: role.roleName,
        roleKey: role.roleKey,
        status: role.status,
        dataScope: role.dataScope,
      })
    }
    for (const role of serverList) {
      byId.set(String(role.id), { ...role, id: String(role.id) })
    }
    return [...byId.values()]
  }, [rolesQuery.data?.list, user?.roles])

  const visibleChoices = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return choices
    return choices.filter(
      (role) => role.roleName.toLowerCase().includes(q) || role.roleKey.toLowerCase().includes(q),
    )
  }, [choices, keyword])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const saveMutation = useModuleMutation(undefined, {
    localKey: user?.id ?? '',
    mutationFn: (run, roleIds: string[]) =>
      run({
        scope: undefined,
        requiredPerms: ['system:user:edit'],
        execute: (transport) =>
          request<void>(`/system/users/${user!.id}/roles`, {
            method: 'PUT',
            body: roleIds,
            ...transport,
          }),
      }),
    onSuccess: () => {
      toast.success(`已更新「${user?.nickname || user?.username}」的角色分配`)
      void client.invalidateQueries({ queryKey: ['dyna', '/system/users'] })
      void client.invalidateQueries({ queryKey: ['system', 'users'] })
      void client.invalidateQueries({ queryKey: ['system', 'roles'] })
      onSaved()
      onOpenChange(false)
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : '分配角色失败，请重试'),
  })

  const toggle = (roleId: string) => {
    setSelectedIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saveMutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-brand-text" aria-hidden="true" />
            <span>原地角色授权 · @{user?.username}</span>
          </div>
          <DialogTitle>为「{user?.nickname || user?.username}」分配角色</DialogTitle>
          <DialogDescription>直接勾选目标角色后保存，无需离开当前用户列表页。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="按角色名称或标识过滤…"
              aria-label="过滤可选角色"
              className="pl-9"
            />
          </div>

          {!canReadRoles && (
            <p className="rounded-control border border-border-subtle bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              当前账号缺少角色目录查看权限（system:role:list），仅可管理当前账号已关联的角色项。
            </p>
          )}

          {rolesQuery.isPending && canReadRoles ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rolesQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {rolesQuery.error instanceof ApiError
                ? rolesQuery.error.message
                : '加载可选角色列表失败'}
            </p>
          ) : (
            <ul
              aria-label="可选角色列表"
              className="max-h-72 divide-y divide-border-subtle overflow-y-auto rounded-control border border-border-subtle"
            >
              {visibleChoices.map((role) => {
                const checked = selectedSet.has(role.id)
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(role.id)}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted/60',
                        checked && 'bg-primary/8',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input bg-card',
                          )}
                          aria-hidden="true"
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{role.roleName}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            @{role.roleKey}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {role.dataScope && (
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {role.dataScope}
                          </Badge>
                        )}
                        <Badge variant={role.status === 1 ? 'success' : 'secondary'}>
                          {role.status === 1 ? '启用' : '停用'}
                        </Badge>
                      </div>
                    </button>
                  </li>
                )
              })}
              {visibleChoices.length === 0 && (
                <li className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                  没有匹配的角色选项
                </li>
              )}
            </ul>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            已选择 {selectedIds.length} 项角色
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saveMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || !user}
              onClick={() => saveMutation.mutate(selectedIds)}
            >
              {saveMutation.isPending ? '保存中…' : '保存角色'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
