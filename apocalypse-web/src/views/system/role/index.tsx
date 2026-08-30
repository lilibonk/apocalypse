/**
 * 角色管理：DynaLayer schema 渲染 + custom 行操作（菜单授权 / 分配用户）。
 *
 * custom 行操作扩展点用法：schema rowActions 声明 { kind:'custom', key, label, perm }，
 * 本页经 DynaPage 的 customActions prop 按 key 注入 handler；授权弹窗为页面局部组件
 * （shadcn Dialog + 原生 checkbox 多选，ui/ 无 checkbox 组件且禁止新增依赖）。
 *
 * 菜单与用户授权都先读取当前值；菜单树支持搜索、父子三态与保存前差异确认。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DynaPage } from '@/components/dyna'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  normalizeMenuNode,
  type MenuNode,
  type PageResult,
  type RawMenuNode,
} from '@/lib/api/types'
import { pageUsers } from '@/lib/api/user'

import schema from './role.schema'

type Row = Record<string, unknown>

/** 授权目标角色（从行数据收窄的最小形态；雪花 id 保持 string）。 */
interface GrantTarget {
  id: string
  roleName: string
}

/** 角色下用户（对应后端 RoleUserResp）。 */
interface RoleUserRow {
  id: string
  username: string
  nickname: string | null
  status: number
}

function grantTargetOf(row: Row): GrantTarget {
  return { id: String(row.id ?? ''), roleName: String(row.roleName ?? '') }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

function nodeIds(node: MenuNode): string[] {
  return [node.id, ...node.children.flatMap(nodeIds)]
}

function filterTree(nodes: MenuNode[], keyword: string): MenuNode[] {
  const normalized = keyword.trim().toLocaleLowerCase()
  if (!normalized) return nodes
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, normalized)
    const matches =
      node.menuName.toLocaleLowerCase().includes(normalized) ||
      node.perms?.toLocaleLowerCase().includes(normalized)
    return matches || children.length > 0 ? [{ ...node, children }] : []
  })
}

function TreeCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      className="size-4 accent-primary"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  )
}

/** 菜单树勾选节点：父节点根据整棵子树呈现 checked / mixed / unchecked。 */
function MenuChecklist({
  node,
  depth,
  selected,
  expanded,
  forceExpanded,
  onToggle,
  onToggleExpanded,
  nodeById,
}: {
  node: MenuNode
  depth: number
  selected: ReadonlySet<string>
  expanded: ReadonlySet<string>
  forceExpanded: boolean
  onToggle: (node: MenuNode, checked: boolean) => void
  onToggleExpanded: (id: string) => void
  nodeById: ReadonlyMap<string, MenuNode>
}) {
  const { t } = useTranslation()
  const typeLabel = node.menuType === 'C' ? '目录' : node.menuType === 'M' ? '菜单' : '按钮'
  const canonicalNode = nodeById.get(node.id) ?? node
  const subtreeIds = nodeIds(canonicalNode)
  const selectedCount = subtreeIds.filter((id) => selected.has(id)).length
  const checked = selectedCount === subtreeIds.length
  const indeterminate = selectedCount > 0 && !checked
  const hasChildren = node.children.length > 0
  const isExpanded = forceExpanded || expanded.has(node.id)
  return (
    <div className={depth > 0 ? 'ml-4 space-y-1 border-l border-border pl-3' : 'space-y-1'}>
      <div className="flex min-h-8 items-center rounded-md hover:bg-muted/60">
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              isExpanded
                ? t('common.折叠', { defaultValue: '折叠' })
                : t('common.展开', { defaultValue: '展开' })
            }
            aria-expanded={isExpanded}
            disabled={forceExpanded}
            onClick={() => onToggleExpanded(node.id)}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        ) : (
          <span className="size-8 shrink-0" aria-hidden />
        )}
        <label className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-sm">
          <TreeCheckbox
            checked={checked}
            indeterminate={indeterminate}
            label={node.menuName}
            onChange={(nextChecked) => onToggle(canonicalNode, nextChecked)}
          />
          <span className="truncate">{node.menuName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t(`dyna.${typeLabel}`, { defaultValue: typeLabel })}
          </span>
        </label>
      </div>
      {hasChildren &&
        isExpanded &&
        node.children.map((child) => (
          <MenuChecklist
            key={child.id}
            node={child}
            depth={depth + 1}
            selected={selected}
            expanded={expanded}
            forceExpanded={forceExpanded}
            onToggle={onToggle}
            onToggleExpanded={onToggleExpanded}
            nodeById={nodeById}
          />
        ))}
    </div>
  )
}

/** 菜单授权弹窗：当前授权回显 → 三态树编辑 → 差异确认 → 整体替换。 */
function GrantMenusDialog({ role, onClose }: { role: GrantTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  const open = role !== null
  const roleId = role?.id ?? ''
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [initialSelected, setInitialSelected] = useState<ReadonlySet<string>>(new Set())
  const [echoedRoleId, setEchoedRoleId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const treeQuery = useQuery({
    queryKey: ['system', 'menus', 'tree'],
    queryFn: () => request<RawMenuNode[]>('/system/menus/tree'),
    enabled: open,
  })
  const tree = useMemo(() => (treeQuery.data ?? []).map(normalizeMenuNode), [treeQuery.data])
  const visibleTree = useMemo(() => filterTree(tree, keyword), [keyword, tree])

  const currentQuery = useQuery({
    queryKey: ['system', 'roles', roleId, 'menus'],
    queryFn: () => request<string[]>(`/system/roles/${roleId}/menus`),
    enabled: open,
  })

  if (!open && echoedRoleId !== null) {
    setEchoedRoleId(null)
    setConfirming(false)
    setKeyword('')
    setExpanded(new Set())
  }
  if (open && currentQuery.data && echoedRoleId !== roleId) {
    const current = new Set(currentQuery.data.map(String))
    setEchoedRoleId(roleId)
    setInitialSelected(current)
    setSelected(current)
  }

  // parentId 索引：勾选节点时连带勾选祖先（只授权按钮不授权父菜单，授权在树上不可见）
  const parentOf = useMemo(() => {
    const map = new Map<string, string>()
    const walk = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node.parentId)
        walk(node.children)
      }
    }
    walk(tree)
    return map
  }, [tree])

  const nodeById = useMemo(() => {
    const map = new Map<string, MenuNode>()
    const walk = (nodes: MenuNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node)
        walk(node.children)
      }
    }
    walk(tree)
    return map
  }, [tree])
  const expandableIds = useMemo(
    () => [...nodeById.values()].filter((node) => node.children.length > 0).map((node) => node.id),
    [nodeById],
  )

  const handleClose = () => {
    setSelected(new Set())
    setInitialSelected(new Set())
    setEchoedRoleId(null)
    setConfirming(false)
    setKeyword('')
    setExpanded(new Set())
    onClose()
  }

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggle = (node: MenuNode, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        nodeIds(node).forEach((id) => next.add(id))
        let cursor = parentOf.get(node.id)
        while (cursor && cursor !== '0') {
          next.add(cursor)
          cursor = parentOf.get(cursor)
        }
      } else {
        nodeIds(node).forEach((id) => next.delete(id))
        let cursor = parentOf.get(node.id)
        while (cursor && cursor !== '0') {
          const parent = nodeById.get(cursor)
          if (parent && nodeIds(parent).some((id) => id !== parent.id && next.has(id))) break
          next.delete(cursor)
          cursor = parentOf.get(cursor)
        }
      }
      return next
    })
    setConfirming(false)
  }

  const addedIds = useMemo(
    () => [...selected].filter((id) => !initialSelected.has(id)),
    [initialSelected, selected],
  )
  const removedIds = useMemo(
    () => [...initialSelected].filter((id) => !selected.has(id)),
    [initialSelected, selected],
  )
  const changed = addedIds.length > 0 || removedIds.length > 0

  const saveMutation = useMutation({
    mutationFn: (menuIds: string[]) =>
      request<void>(`/system/roles/${roleId}/menus`, { method: 'PUT', body: menuIds }),
    onSuccess: () => {
      toast.success(t('common.菜单授权已保存', { defaultValue: '菜单授权已保存' }))
      void queryClient.invalidateQueries({ queryKey: ['system', 'roles', roleId, 'menus'] })
      handleClose()
    },
    onError: (error) =>
      toast.error(errorText(error, t('common.授权保存失败', { defaultValue: '授权保存失败' }))),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('common.菜单授权', { defaultValue: '菜单授权' })}</DialogTitle>
          <DialogDescription>
            {t('common.正在调整角色「{{name}}」的访问范围，保存前将显示完整变更。', {
              name: role?.roleName ?? '',
              defaultValue: '正在调整角色「{{name}}」的访问范围，保存前将显示完整变更。',
            })}
          </DialogDescription>
        </DialogHeader>
        {confirming ? (
          <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
            <div>
              <h3 className="text-sm font-semibold">确认权限变更</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                保存后将立即影响该角色下用户可访问的菜单与操作。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">新增授权</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{addedIds.length}</p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">移除授权</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">
                  {removedIds.length}
                </p>
              </div>
            </div>
            {selected.size === 0 && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                本次保存会清空该角色的全部菜单权限。
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索菜单名称或权限标识"
                className="sm:max-w-xs"
              />
              <div className="flex gap-2">
                <Badge variant="outline">当前 {initialSelected.size}</Badge>
                <Badge variant="outline">已选 {selected.size}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={keyword.trim().length > 0}
                  onClick={() => setExpanded(new Set(expandableIds))}
                >
                  {t('common.全部展开', { defaultValue: '全部展开' })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={keyword.trim().length > 0}
                  onClick={() => setExpanded(new Set())}
                >
                  {t('common.全部折叠', { defaultValue: '全部折叠' })}
                </Button>
              </div>
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border p-3">
              {(treeQuery.isLoading || currentQuery.isLoading) &&
                Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-7 w-full" />
                ))}
              {(treeQuery.isError || currentQuery.isError) && (
                <p className="text-sm text-destructive">
                  {errorText(
                    treeQuery.error ?? currentQuery.error,
                    t('common.权限数据加载失败', { defaultValue: '权限数据加载失败' }),
                  )}
                </p>
              )}
              {visibleTree.map((node) => (
                <MenuChecklist
                  key={node.id}
                  node={node}
                  depth={0}
                  selected={selected}
                  expanded={expanded}
                  forceExpanded={keyword.trim().length > 0}
                  onToggle={toggle}
                  onToggleExpanded={toggleExpanded}
                  nodeById={nodeById}
                />
              ))}
              {!treeQuery.isLoading && visibleTree.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">没有匹配的菜单</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">权限树全量加载，不分页</p>
          </div>
        )}
        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                返回修改
              </Button>
              <Button
                variant={removedIds.length > 0 ? 'destructive' : 'default'}
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate([...selected])}
              >
                {saveMutation.isPending ? '保存中…' : '确认并保存'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handleClose}>
                {t('common.取消', { defaultValue: '取消' })}
              </Button>
              <Button
                disabled={!changed || treeQuery.isLoading || currentQuery.isLoading}
                onClick={() => setConfirming(true)}
              >
                查看变更并继续
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 分配用户弹窗：全量用户多选（回显已分配）→ PUT /system/roles/{id}/users（body Long[]）。 */
function GrantUsersDialog({ role, onClose }: { role: GrantTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  const open = role !== null
  const roleId = role?.id ?? ''
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  // 候选全集：size 大值一次拉全量（系统用户量级小，无搜索需求）
  const usersQuery = useQuery({
    queryKey: ['system', 'users', 'all'],
    queryFn: () => pageUsers(1, 1000),
    enabled: open,
  })

  // 已分配回显：GET /system/roles/{id}/users 为现成接口
  const assignedQuery = useQuery({
    queryKey: ['system', 'roles', roleId, 'users'],
    queryFn: () =>
      request<PageResult<RoleUserRow>>(`/system/roles/${roleId}/users`, {
        query: { page: 1, size: 1000 },
      }),
    enabled: open,
  })

  // 回显同步：打开且分配数据到达时按角色初始化勾选（render 期按 prev 比较调整，替代 effect setState；
  // 同一角色数据后台 refetch 不重置，避免覆盖用户已改勾选）
  const [echoedRoleId, setEchoedRoleId] = useState<string | null>(null)
  if (!open && echoedRoleId !== null) {
    setEchoedRoleId(null)
  }
  if (open && assignedQuery.data && echoedRoleId !== roleId) {
    setEchoedRoleId(roleId)
    setSelected(new Set(assignedQuery.data.list.map((user) => user.id)))
  }

  const toggle = (userId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(userId)
      } else {
        next.delete(userId)
      }
      return next
    })
  }

  const saveMutation = useMutation({
    mutationFn: (userIds: string[]) =>
      request<void>(`/system/roles/${roleId}/users`, { method: 'PUT', body: userIds }),
    onSuccess: () => {
      toast.success(t('common.用户分配已保存', { defaultValue: '用户分配已保存' }))
      void queryClient.invalidateQueries({ queryKey: ['system', 'roles', roleId, 'users'] })
      onClose()
    },
    onError: (error) =>
      toast.error(errorText(error, t('common.分配保存失败', { defaultValue: '分配保存失败' }))),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.分配用户', { defaultValue: '分配用户' })}</DialogTitle>
          <DialogDescription>
            {t('common.为角色「{{name}}」勾选要分配的用户（已回显当前分配），保存将整体替换。', {
              name: role?.roleName ?? '',
              defaultValue:
                '为角色「{{name}}」勾选要分配的用户（已回显当前分配），保存将整体替换。',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border p-3">
          {usersQuery.isLoading &&
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          {usersQuery.isError && (
            <p className="text-sm text-destructive">
              {errorText(
                usersQuery.error,
                t('common.用户列表加载失败', { defaultValue: '用户列表加载失败' }),
              )}
            </p>
          )}
          {usersQuery.data?.list.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('common.暂无用户', { defaultValue: '暂无用户' })}
            </p>
          )}
          {usersQuery.data?.list.map((user) => (
            <label key={user.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.has(user.id)}
                onChange={(event) => toggle(user.id, event.target.checked)}
              />
              <span>{user.username}</span>
              <span className="text-xs text-muted-foreground">{user.nickname ?? ''}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          已加载 {usersQuery.data?.list.length ?? 0} / {usersQuery.data?.total ?? 0}
          名候选用户，单次上限 1000 条
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.取消', { defaultValue: '取消' })}
          </Button>
          <Button
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate([...selected])}
          >
            {saveMutation.isPending
              ? t('common.保存中…', { defaultValue: '保存中…' })
              : t('common.保存', { defaultValue: '保存' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function RolePage() {
  const [grantingMenus, setGrantingMenus] = useState<GrantTarget | null>(null)
  const [grantingUsers, setGrantingUsers] = useState<GrantTarget | null>(null)

  const customActions = useMemo(
    () => ({
      'grant-menus': (row: Row) => setGrantingMenus(grantTargetOf(row)),
      'grant-users': (row: Row) => setGrantingUsers(grantTargetOf(row)),
    }),
    [],
  )

  return (
    <>
      <DynaPage schema={schema} customActions={customActions} />
      <GrantMenusDialog role={grantingMenus} onClose={() => setGrantingMenus(null)} />
      <GrantUsersDialog role={grantingUsers} onClose={() => setGrantingUsers(null)} />
    </>
  )
}
