/**
 * 菜单删除确认对话框（页面局部）：AlertDialog 确认 → DELETE /system/menus/{id}。
 * 后端在存在子菜单时拒绝删除；有子节点时这里同步加强警告文案（仍允许尝试，错误透后端中文文案）。
 */

import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { PixelScale } from '@/components/ui/pixel-scale'
import { ApiError } from '@/lib/api/client'

import { deleteMenu } from './menu.api'
import type { MenuNode } from './menu.types'

export function MenuDeleteDialog({
  node,
  onClose,
  onDeleted,
}: {
  node: MenuNode | null
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMenu(id),
    onSuccess: () => {
      toast.success(t('common.菜单已删除', { defaultValue: '菜单已删除' }))
      onClose()
      onDeleted()
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('common.删除失败', { defaultValue: '删除失败' }),
      )
    },
  })

  const childCount = node?.children.length ?? 0

  return (
    <AlertDialog
      open={!!node}
      onOpenChange={(open) => !open && !deleteMutation.isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.确认删除', { defaultValue: '确认删除' })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('common.将删除菜单「{{name}}」，该操作为逻辑删除。', {
              name: node?.menuName ?? '',
              defaultValue: '将删除菜单「{{name}}」，该操作为逻辑删除。',
            })}
            {childCount > 0 && (
              <span className="mt-1 block text-destructive">
                {t(
                  'common.警告：该菜单包含 {{count}} 个直接子菜单，后端将拒绝删除，请先删除全部子菜单。',
                  {
                    count: childCount,
                    defaultValue:
                      '警告：该菜单包含 {{count}} 个直接子菜单，后端将拒绝删除，请先删除全部子菜单。',
                  },
                )}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            {t('common.取消', { defaultValue: '取消' })}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={(event) => {
              event.preventDefault()
              if (node) deleteMutation.mutate(node.id)
            }}
          >
            {deleteMutation.isPending && <PixelScale variant="inline" tone="current" />}
            {deleteMutation.isPending
              ? t('common.删除中…', { defaultValue: '删除中…' })
              : t('common.确认删除', { defaultValue: '确认删除' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
