/**
 * 上级菜单树选择：默认只渲染已展开分支，大树场景通过搜索直接定位节点。
 * 编辑时调用方传入需排除的子树 id，避免把菜单挂到自己或后代下成环。
 */

import { Check, ChevronDown, ChevronRight, ChevronsUpDown, FolderRoot, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { MenuIcon } from '@/components/layout/MenuIcon'
import { MotionSequence, MotionSequenceItem } from '@/components/motion/MotionSequence'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import {
  buildSelectableMenuTree,
  collectExpandedAncestorIds,
  countSelectableMenuOptions,
  findMenuTreeOption,
  MAX_PARENT_MENU_SEARCH_RESULTS,
  searchSelectableMenus,
  type MenuTreeOption,
} from './menu-tree-options'
import { ROOT_PARENT_ID, type MenuNode } from './menu.types'

const EMPTY_EXCLUDED_IDS = new Set<string>()

interface TreeLabels {
  collapse: string
  directory: string
  expand: string
  menu: string
}

interface MenuTreeSelectProps extends Omit<ComponentProps<'button'>, 'onChange' | 'value'> {
  tree: MenuNode[]
  value: string
  onChange: (value: string) => void
  excluded?: Set<string>
}

function MenuTreeBranch({
  nodes,
  value,
  expanded,
  labels,
  depth = 0,
  onToggle,
  onSelect,
}: {
  nodes: MenuTreeOption[]
  value: string
  expanded: Set<string>
  labels: TreeLabels
  depth?: number
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  return (
    <div
      role={depth === 0 ? 'tree' : 'group'}
      className={cn(depth > 0 && 'mt-1 ml-5 space-y-1 border-l border-border pl-2')}
    >
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isExpanded = expanded.has(node.id)
        const isSelected = value === node.id

        return (
          <div
            key={node.id}
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={isSelected}
            className="space-y-1"
          >
            <div className="flex min-w-0 items-center gap-1">
              {hasChildren ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={isExpanded ? labels.collapse : labels.expand}
                  onClick={() => onToggle(node.id)}
                >
                  {isExpanded ? <ChevronDown /> : <ChevronRight />}
                </Button>
              ) : (
                <span className="size-8 shrink-0" aria-hidden="true" />
              )}
              <Button
                type="button"
                variant={isSelected ? 'secondary' : 'ghost'}
                className="h-auto min-w-0 flex-1 justify-start px-2 py-2 font-normal"
                onClick={() => onSelect(node.id)}
              >
                <MenuIcon name={node.icon} />
                <span className="min-w-0 flex-1 truncate text-left">{node.menuName}</span>
                <Badge variant="outline" className="shrink-0">
                  {node.menuType === 'C' ? labels.directory : labels.menu}
                </Badge>
                <Check className={cn('size-4 text-primary', !isSelected && 'opacity-0')} />
              </Button>
            </div>
            {hasChildren && isExpanded && (
              <MenuTreeBranch
                nodes={node.children}
                value={value}
                expanded={expanded}
                labels={labels}
                depth={depth + 1}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function MenuTreeSelect({
  tree,
  value,
  onChange,
  excluded,
  className,
  disabled,
  ...buttonProps
}: MenuTreeSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const deferredQuery = useDeferredValue(query)
  const excludedIds = excluded ?? EMPTY_EXCLUDED_IDS

  const options = useMemo(() => buildSelectableMenuTree(tree, excludedIds), [tree, excludedIds])
  const selectedOption = useMemo(() => findMenuTreeOption(options, value), [options, value])
  const optionCount = useMemo(() => countSelectableMenuOptions(options), [options])
  const searchResult = useMemo(
    () => searchSelectableMenus(options, deferredQuery),
    [options, deferredQuery],
  )
  const isSearching = deferredQuery.trim().length > 0

  const initializeDialog = () => {
    setQuery('')
    setExpanded(collectExpandedAncestorIds(options, value))
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) initializeDialog()
    setOpen(nextOpen)
  }

  const labels: TreeLabels = {
    collapse: t('common.折叠', { defaultValue: '折叠' }),
    directory: t('common.目录', { defaultValue: '目录' }),
    expand: t('common.展开', { defaultValue: '展开' }),
    menu: t('common.菜单', { defaultValue: '菜单' }),
  }

  const selectNode = (id: string) => {
    onChange(id)
    setOpen(false)
  }

  const toggleNode = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const triggerLabel =
    value === ROOT_PARENT_ID
      ? t('common.根节点', { defaultValue: '根节点' })
      : (selectedOption?.breadcrumb ?? t('common.选择上级菜单', { defaultValue: '选择上级菜单' }))

  return (
    <>
      <Button
        {...buttonProps}
        type="button"
        variant="outline"
        className={cn(
          'w-full justify-start font-normal',
          !selectedOption && value !== ROOT_PARENT_ID && 'text-muted-foreground',
          className,
        )}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={triggerLabel}
        onClick={() => handleOpenChange(true)}
      >
        {value === ROOT_PARENT_ID ? (
          <FolderRoot className="size-4" />
        ) : (
          <MenuIcon name={selectedOption?.icon ?? null} />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <ChevronsUpDown className="ml-auto size-4 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent depth="nested" className="gap-0 overflow-hidden p-0 sm:max-w-xl">
          <MotionSequence className="contents">
            <MotionSequenceItem>
              <DialogHeader className="p-6 pb-4">
                <DialogTitle>
                  {t('common.选择上级菜单', { defaultValue: '选择上级菜单' })}
                </DialogTitle>
                <DialogDescription>
                  {t('common.按需展开节点，或搜索后直接选择', {
                    defaultValue: '按需展开节点，或搜索后直接选择',
                  })}
                </DialogDescription>
              </DialogHeader>
            </MotionSequenceItem>

            <MotionSequenceItem>
              <div className="relative px-6 pb-4">
                <Search className="pointer-events-none absolute top-2.5 left-9 size-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('common.搜索菜单名称、路由或层级路径…', {
                    defaultValue: '搜索菜单名称、路由或层级路径…',
                  })}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </MotionSequenceItem>

            <MotionSequenceItem>
              <div className="border-t border-border">
                <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                  <span>
                    {isSearching
                      ? t('common.parentMenuSearchCount', {
                          count: searchResult.total,
                          defaultValue: '找到 {{count}} 个节点',
                        })
                      : t('common.parentMenuNodeCount', {
                          count: optionCount,
                          defaultValue: '{{count}} 个可选节点',
                        })}
                  </span>
                  {selectedOption && (
                    <span className="max-w-1/2 truncate" title={selectedOption.breadcrumb}>
                      {t('common.当前选择', { defaultValue: '当前选择' })}：
                      {selectedOption.menuName}
                    </span>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {!isSearching && (
                    <Button
                      type="button"
                      variant={value === ROOT_PARENT_ID ? 'secondary' : 'ghost'}
                      className="mb-1 w-full justify-start font-normal"
                      onClick={() => selectNode(ROOT_PARENT_ID)}
                    >
                      <FolderRoot />
                      <span className="flex-1 text-left">
                        {t('common.根节点', { defaultValue: '根节点' })}
                      </span>
                      <Check
                        className={cn(
                          'size-4 text-primary',
                          value !== ROOT_PARENT_ID && 'opacity-0',
                        )}
                      />
                    </Button>
                  )}

                  {isSearching ? (
                    <div role="list" className="space-y-1">
                      {searchResult.matches.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          {t('common.没有匹配结果', { defaultValue: '没有匹配结果' })}
                        </p>
                      ) : (
                        searchResult.matches.map((node) => (
                          <Button
                            key={node.id}
                            type="button"
                            variant={value === node.id ? 'secondary' : 'ghost'}
                            className="h-auto w-full justify-start px-3 py-2 font-normal"
                            onClick={() => selectNode(node.id)}
                          >
                            <MenuIcon name={node.icon} />
                            <span className="min-w-0 flex-1 text-left">
                              <span className="flex items-center gap-2">
                                <span className="truncate font-medium">{node.menuName}</span>
                                <Badge variant="outline">
                                  {node.menuType === 'C' ? labels.directory : labels.menu}
                                </Badge>
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {node.breadcrumb}
                                {node.path ? ` · ${node.path}` : ''}
                              </span>
                            </span>
                            <Check
                              className={cn(
                                'size-4 text-primary',
                                value !== node.id && 'opacity-0',
                              )}
                            />
                          </Button>
                        ))
                      )}
                      {searchResult.total > MAX_PARENT_MENU_SEARCH_RESULTS && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          {t('common.parentMenuSearchLimited', {
                            count: MAX_PARENT_MENU_SEARCH_RESULTS,
                            defaultValue: '仅显示前 {{count}} 个结果，请继续输入关键词缩小范围',
                          })}
                        </p>
                      )}
                    </div>
                  ) : options.length > 0 ? (
                    <MenuTreeBranch
                      nodes={options}
                      value={value}
                      expanded={expanded}
                      labels={labels}
                      onToggle={toggleNode}
                      onSelect={selectNode}
                    />
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {t('common.暂无可选菜单', { defaultValue: '暂无可选菜单' })}
                    </p>
                  )}
                </div>
              </div>
            </MotionSequenceItem>
          </MotionSequence>
        </DialogContent>
      </Dialog>
    </>
  )
}
