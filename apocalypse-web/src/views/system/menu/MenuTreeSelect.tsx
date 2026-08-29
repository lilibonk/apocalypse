/**
 * 上级菜单树选择（页面局部）：数据与菜单树同源。
 * 用 shadcn Select 承载拍平的树（全角空格缩进表达层级），只有目录/菜单可作为上级；
 * 编辑时调用方传入需排除的子树 id（防止把菜单挂到自己或后代下成环）。
 */

import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { ROOT_PARENT_ID, type MenuNode } from './menu.types'

interface FlatOption {
  id: string
  depth: number
  menuName: string
}

function flattenSelectable(nodes: MenuNode[], excluded: Set<string>, depth = 0): FlatOption[] {
  return nodes
    .filter((node) => node.menuType !== 'F' && !excluded.has(node.id))
    .flatMap((node) => [
      { id: node.id, depth, menuName: node.menuName },
      ...flattenSelectable(node.children, excluded, depth + 1),
    ])
}

export function MenuTreeSelect({
  tree,
  value,
  onChange,
  excluded,
}: {
  tree: MenuNode[]
  value: string
  onChange: (value: string) => void
  excluded?: Set<string>
}) {
  const { t } = useTranslation()
  const options = flattenSelectable(tree, excluded ?? new Set<string>())
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={t('common.选择上级菜单', { defaultValue: '选择上级菜单' })} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ROOT_PARENT_ID}>
          {t('common.根节点', { defaultValue: '根节点' })}
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {'　'.repeat(option.depth)}
            {option.menuName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
