/**
 * 用户管理：手写 CRUD 参照物（golden sample）。
 *
 * 本文件不挂任何路由，仅作为 DynaLayer（schema 驱动渲染器）的视觉/交互回归对照保留 ——
 * 正式页面是 views/system/user/index.tsx（<DynaPage schema={user.schema} />）。
 * 需要越出标准 CRUD 模式时，以此为底本复制到手写页面（逃逸舱）。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { DictTag } from '@/components/DictTag'
import { Perm } from '@/components/Perm'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { createUser, deleteUser, pageUsers, updateUser } from '@/lib/api/user'
import type { UserInfo } from '@/lib/api/types'

const PAGE_SIZE = 10

const formSchema = z.object({
  username: z.string().min(1, '请输入用户名').max(64, '用户名最长 64 字符'),
  password: z
    .string()
    .min(8, '密码长度须为 8-64 字符')
    .max(64, '密码长度须为 8-64 字符')
    .or(z.literal('')),
  nickname: z.string().max(64, '昵称最长 64 字符').optional(),
  status: z.enum(['0', '1']).optional(),
})

type FormValues = z.infer<typeof formSchema>

export default function UserPageHandwritten() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UserInfo | null>(null)
  const [deleting, setDeleting] = useState<UserInfo | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['system', 'users', 'page', page, keyword],
    queryFn: () => pageUsers(page, PAGE_SIZE, keyword),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', password: '', nickname: '', status: '1' },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system', 'users'] })

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (editing) {
        return updateUser(editing.id, {
          nickname: values.nickname || undefined,
          status: values.status ? Number(values.status) : undefined,
        })
      }
      return createUser({
        username: values.username,
        password: values.password,
        nickname: values.nickname || undefined,
      })
    },
    onSuccess: () => {
      toast.success(editing ? '用户已更新' : '用户已创建')
      setDialogOpen(false)
      void invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '保存失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success('用户已删除')
      setDeleting(null)
      void invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : '删除失败')
    },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ username: '', password: '', nickname: '', status: '1' })
    setDialogOpen(true)
  }

  const openEdit = (user: UserInfo) => {
    setEditing(user)
    form.reset({
      username: user.username,
      password: '',
      nickname: user.nickname ?? '',
      status: String(user.status ?? 1) as '0' | '1',
    })
    setDialogOpen(true)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">用户管理</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">系统用户的增删改查</p>
        </div>
        <Perm perm="system:user:add">
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            新增用户
          </Button>
        </Perm>
      </div>

      {/* 搜索区 */}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setKeyword(keywordInput.trim())
        }}
      >
        <Input
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          placeholder="用户名 / 昵称"
          className="w-56"
        />
        <Button type="submit" variant="secondary" size="sm">
          <Search className="size-4" />
          查询
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setKeywordInput('')
            setKeyword('')
            setPage(1)
          }}
        >
          重置
        </Button>
      </form>

      {/* 表格 */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 6 }).map((__, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.list.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            )}
            {data?.list.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.nickname ?? '-'}</TableCell>
                <TableCell>{user.deptName ?? '-'}</TableCell>
                <TableCell>
                  <DictTag type="sys_user_status" value={user.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.createTime?.replace('T', ' ').slice(0, 19) ?? '-'}
                </TableCell>
                <TableCell className="text-right">
                  <Perm perm="system:user:edit">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑"
                      onClick={() => openEdit(user)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </Perm>
                  <Perm perm="system:user:remove">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除"
                      onClick={() => setDeleting(user)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </Perm>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      </div>

      {/* 新增 / 编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑用户' : '新增用户'}</DialogTitle>
            <DialogDescription>
              {editing ? `修改 ${editing.username} 的资料` : '创建新的系统用户'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!!editing} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!editing && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密码</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>昵称</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {editing && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>状态</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">正常</SelectItem>
                          <SelectItem value="0">停用</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? '保存中…' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              将删除用户「{deleting?.nickname ?? deleting?.username}」，该操作为逻辑删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
