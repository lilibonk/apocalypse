/**
 * 部门新增/编辑对话框（页面局部组件，仅部门管理页使用）。
 * 上级部门用页面局部 TreeSelect（ui/select + 全角空格缩进呈现层级）；
 * 编辑态禁选自身及下级作父部门（后端同样校验，前端提前拦截）。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PixelScale } from '@/effects/PixelWave'

import { collectSubTreeIds, flattenDeptTree } from './tree-utils'
import { ROOT_DEPT_ID, type DeptTreeNode, type SnowflakeId } from './types'

const formSchema = z.object({
  parentId: z.string().min(1, '请选择上级部门'),
  deptName: z.string().min(1, '请输入部门名称').max(64, '部门名称最长 64 字符'),
  leader: z.string().max(64, '负责人最长 64 字符'),
  phone: z.string().max(32, '联系电话最长 32 字符'),
  sort: z.string().regex(/^$|^\d{1,10}$/, '显示顺序须为非负整数'),
  status: z.boolean(),
  remark: z.string().max(500, '备注最长 500 字符'),
})

export type DeptFormValues = z.infer<typeof formSchema>

/** 页面局部上级部门树选择：全量展开拍平 + 全角空格按层级缩进；根部门为固定首项。 */
function DeptTreeSelect({
  tree,
  value,
  onChange,
  disabledIds,
}: {
  tree: DeptTreeNode[]
  value: string
  onChange: (value: string) => void
  /** 禁选 id 集（编辑态为自身及下级子树）。 */
  disabledIds?: ReadonlySet<string>
}) {
  const { t } = useTranslation()
  const rows = flattenDeptTree(tree, new Set())
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={t('common.请选择上级部门', { defaultValue: '请选择上级部门' })} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ROOT_DEPT_ID}>
          {t('common.作为根部门', { defaultValue: '作为根部门' })}
        </SelectItem>
        {rows.map((row) => (
          <SelectItem
            key={row.node.id}
            value={row.node.id}
            disabled={disabledIds?.has(row.node.id)}
          >
            {'　'.repeat(row.depth)}
            {row.node.deptName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DeptFormDialog({
  open,
  onOpenChange,
  editing,
  defaultParentId,
  tree,
  isPending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑态行；null 表示新增。 */
  editing: DeptTreeNode | null
  /** 新增态默认上级部门（点行内「新增下级」时带入，根为 '0'）。 */
  defaultParentId: SnowflakeId
  tree: DeptTreeNode[]
  isPending: boolean
  onSubmit: (values: DeptFormValues) => void
}) {
  const { t } = useTranslation()
  const form = useForm<DeptFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      parentId: ROOT_DEPT_ID,
      deptName: '',
      leader: '',
      phone: '',
      sort: '0',
      status: true,
      remark: '',
    },
  })

  // 每次打开按 新增/编辑 态回填
  useEffect(() => {
    if (open) {
      form.reset({
        parentId: editing ? editing.parentId : defaultParentId,
        deptName: editing?.deptName ?? '',
        leader: editing?.leader ?? '',
        phone: editing?.phone ?? '',
        sort: editing ? String(editing.sort ?? 0) : '0',
        status: editing ? editing.status === 1 : true,
        remark: editing?.remark ?? '',
      })
    }
  }, [open, editing, defaultParentId, form])

  const disabledParentIds = editing ? collectSubTreeIds(editing) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader data-pixel-dialog-stage="header">
          <DialogTitle>
            {editing
              ? t('common.编辑部门', { defaultValue: '编辑部门' })
              : t('common.新增部门', { defaultValue: '新增部门' })}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? t('common.修改「{{name}}」的信息', {
                  name: editing.deptName,
                  defaultValue: '修改「{{name}}」的信息',
                })
              : t('common.创建新的部门', { defaultValue: '创建新的部门' })}
          </DialogDescription>
        </DialogHeader>
        <div data-pixel-dialog-stage="body">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.上级部门', { defaultValue: '上级部门' })}</FormLabel>
                    <FormControl>
                      <DeptTreeSelect
                        tree={tree}
                        value={field.value}
                        onChange={field.onChange}
                        disabledIds={disabledParentIds}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deptName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.部门名称', { defaultValue: '部门名称' })}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('common.最长 64 字符', { defaultValue: '最长 64 字符' })}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="leader"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.负责人', { defaultValue: '负责人' })}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('common.最长 64 字符', { defaultValue: '最长 64 字符' })}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.联系电话', { defaultValue: '联系电话' })}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('common.最长 32 字符', { defaultValue: '最长 32 字符' })}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="sort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.显示顺序', { defaultValue: '显示顺序' })}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder={t('common.非负整数，越小越靠前', {
                          defaultValue: '非负整数，越小越靠前',
                        })}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <FormLabel>{t('common.状态', { defaultValue: '状态' })}</FormLabel>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {field.value
                          ? t('common.正常', { defaultValue: '正常' })
                          : t('common.停用', { defaultValue: '停用' })}
                      </span>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="remark"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.备注', { defaultValue: '备注' })}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('common.最长 500 字符', { defaultValue: '最长 500 字符' })}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div data-pixel-dialog-stage="footer">
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                    {t('common.取消', { defaultValue: '取消' })}
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending && <PixelScale variant="inline" tone="current" />}
                    {isPending
                      ? t('common.保存中…', { defaultValue: '保存中…' })
                      : t('common.保存', { defaultValue: '保存' })}
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
