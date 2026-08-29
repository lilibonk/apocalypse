/**
 * 菜单新增/编辑对话框（页面局部）：react-hook-form + zod，布局对齐 DynaForm 两列网格。
 * 字段按 menuType 条件展示：path 仅 C/M、component 仅 M、perms 仅 M/F、icon 仅 C/M；
 * 提交时非适用字段一律置空，避免改了类型后残留旧值。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { MotionSequence, MotionSequenceItem } from '@/components/motion/MotionSequence'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PixelScale } from '@/effects/PixelWave'
import { ApiError } from '@/lib/api/client'
import type { SnowflakeId } from '@/lib/api/types'

import { createMenu, updateMenu } from './menu.api'
import { MenuIconPicker } from './MenuIconPicker'
import {
  ROOT_PARENT_ID,
  collectSubtreeIds,
  type MenuNode,
  type MenuSaveReq,
  type MenuType,
} from './menu.types'
import { MenuTreeSelect } from './MenuTreeSelect'

/** 对话框载荷：create 带预设上级（根为 ROOT_PARENT_ID），edit 带被编辑节点。 */
export interface MenuFormPayload {
  mode: 'create' | 'edit'
  parentId?: SnowflakeId
  node?: MenuNode
}

const formSchema = z.object({
  parentId: z.string().min(1, '请选择上级菜单'),
  menuName: z.string().trim().min(1, '请输入菜单名称').max(64, '菜单名称最长 64 字符'),
  menuType: z.enum(['C', 'M', 'F']),
  path: z.string().trim().max(128, '路由地址最长 128 字符'),
  component: z.string().trim().max(128, '组件路径最长 128 字符'),
  perms: z.string().trim().max(128, '权限标识最长 128 字符'),
  icon: z.string().trim().max(64, '图标最长 64 字符'),
  sort: z.string().regex(/^\d{0,5}$/, '排序须为 0-99999 的整数'),
  visible: z.boolean(),
  status: z.boolean(),
  remark: z.string().trim().max(500, '备注最长 500 字符'),
})

type FormValues = z.infer<typeof formSchema>

const MENU_TYPE_OPTIONS: { value: MenuType; label: string }[] = [
  { value: 'C', label: '目录' },
  { value: 'M', label: '菜单' },
  { value: 'F', label: '按钮' },
]

function defaultsFor(payload: MenuFormPayload): FormValues {
  if (payload.mode === 'edit' && payload.node) {
    const node = payload.node
    return {
      parentId: node.parentId,
      menuName: node.menuName,
      menuType: node.menuType,
      path: node.path ?? '',
      component: node.component ?? '',
      perms: node.perms ?? '',
      icon: node.icon ?? '',
      sort: String(node.sort),
      // 树响应已带 visible/status；缺省（旧数据/异常）时回退后端默认（1=显示/正常）
      visible: node.visible !== 0,
      status: node.status !== 0,
      remark: node.remark ?? '',
    }
  }
  return {
    parentId: payload.parentId ?? ROOT_PARENT_ID,
    menuName: '',
    menuType: 'M',
    path: '',
    component: '',
    perms: '',
    icon: '',
    sort: '0',
    visible: true,
    status: true,
    remark: '',
  }
}

function findNodeName(nodes: MenuNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.menuName
    const hit = findNodeName(node.children, id)
    if (hit) return hit
  }
  return null
}

export function MenuFormDialog({
  open,
  payload,
  tree,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  payload: MenuFormPayload
  tree: MenuNode[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const isEdit = payload.mode === 'edit' && !!payload.node

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFor(payload),
  })

  // 对话框每次打开时按载荷重置（新增 → 默认值；编辑 → 行数据回填）
  useEffect(() => {
    if (open) form.reset(defaultsFor(payload))
  }, [open, payload, form])

  const menuType = form.watch('menuType')

  // 编辑时上级选择排除自身子树，防止成环
  const excluded = useMemo(
    () => (isEdit && payload.node ? collectSubtreeIds(payload.node) : new Set<string>()),
    [isEdit, payload.node],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const optional = (text: string) => (text === '' ? undefined : text)
      const body: MenuSaveReq = {
        parentId: values.parentId,
        menuName: values.menuName,
        menuType: values.menuType,
        path: values.menuType === 'F' ? undefined : optional(values.path),
        component: values.menuType === 'M' ? optional(values.component) : undefined,
        perms: values.menuType === 'C' ? undefined : optional(values.perms),
        icon: values.menuType === 'F' ? undefined : optional(values.icon),
        sort: values.sort === '' ? 0 : Number(values.sort),
        visible: values.visible ? 1 : 0,
        status: values.status ? 1 : 0,
        remark: optional(values.remark),
      }
      if (isEdit && payload.node) return updateMenu(payload.node.id, body)
      return createMenu(body)
    },
    onSuccess: () => {
      toast.success(
        isEdit
          ? t('common.菜单已更新', { defaultValue: '菜单已更新' })
          : t('common.菜单已创建', { defaultValue: '菜单已创建' }),
      )
      onOpenChange(false)
      onSaved()
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.保存失败', { defaultValue: '保存失败' }),
      )
    },
  })

  const parentName =
    payload.mode === 'create' && payload.parentId && payload.parentId !== ROOT_PARENT_ID
      ? findNodeName(tree, payload.parentId)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <MotionSequence className="contents">
          <MotionSequenceItem>
            <DialogHeader>
              <DialogTitle>
                {isEdit
                  ? t('common.编辑菜单', { defaultValue: '编辑菜单' })
                  : t('common.新增菜单', { defaultValue: '新增菜单' })}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? t('common.修改「{{name}}」的配置，保存后立即影响全站路由与权限', {
                      name: payload.node?.menuName ?? '',
                      defaultValue: '修改「{{name}}」的配置，保存后立即影响全站路由与权限',
                    })
                  : parentName
                    ? t('common.在「{{name}}」下新增菜单', {
                        name: parentName,
                        defaultValue: '在「{{name}}」下新增菜单',
                      })
                    : t('common.创建新的系统菜单', { defaultValue: '创建新的系统菜单' })}
              </DialogDescription>
            </DialogHeader>
          </MotionSequenceItem>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
              className="grid grid-cols-2 gap-4"
            >
              <MotionSequenceItem className="col-span-2 grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="parentId"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>{t('common.上级菜单', { defaultValue: '上级菜单' })}</FormLabel>
                      <FormControl>
                        <MenuTreeSelect
                          tree={tree}
                          value={field.value}
                          onChange={field.onChange}
                          excluded={excluded}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="menuName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.菜单名称', { defaultValue: '菜单名称' })}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('common.排序', { defaultValue: '排序' })}</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={99999} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="menuType"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>{t('common.菜单类型', { defaultValue: '菜单类型' })}</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="flex items-center gap-4"
                        >
                          {MENU_TYPE_OPTIONS.map((option) => (
                            <FormItem key={option.value} className="flex items-center gap-1.5">
                              <FormControl>
                                <RadioGroupItem value={option.value} />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {t(`dyna.${option.label}`, { defaultValue: option.label })}
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {menuType !== 'F' && (
                  <FormField
                    control={form.control}
                    name="path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.路由地址', { defaultValue: '路由地址' })}</FormLabel>
                        <FormControl>
                          <Input placeholder="system" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {menuType === 'M' && (
                  <FormField
                    control={form.control}
                    name="component"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.组件路径', { defaultValue: '组件路径' })}</FormLabel>
                        <FormControl>
                          <Input placeholder="system/menu/index" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {menuType !== 'C' && (
                  <FormField
                    control={form.control}
                    name="perms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.权限标识', { defaultValue: '权限标识' })}</FormLabel>
                        <FormControl>
                          <Input placeholder="system:menu:list" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {menuType !== 'F' && (
                  <FormField
                    control={form.control}
                    name="icon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('common.图标', { defaultValue: '图标' })}</FormLabel>
                        <FormControl>
                          <MenuIconPicker value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormDescription>
                          {t('common.选择侧栏及顶部导航使用的图标', {
                            defaultValue: '选择侧栏及顶部导航使用的图标',
                          })}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="visible"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <FormLabel>{t('common.是否显示', { defaultValue: '是否显示' })}</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <FormLabel>{t('common.状态', { defaultValue: '状态' })}</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remark"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>{t('common.备注', { defaultValue: '备注' })}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </MotionSequenceItem>
              <MotionSequenceItem className="col-span-2">
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                    {t('common.取消', { defaultValue: '取消' })}
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending && <PixelScale variant="inline" tone="current" />}
                    {saveMutation.isPending
                      ? t('common.保存中…', { defaultValue: '保存中…' })
                      : t('common.保存', { defaultValue: '保存' })}
                  </Button>
                </DialogFooter>
              </MotionSequenceItem>
            </form>
          </Form>
        </MotionSequence>
      </DialogContent>
    </Dialog>
  )
}
