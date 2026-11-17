import { useMemo, useRef, useState } from 'react'
import { KeyRound, Plus, ShieldCheck, Unlink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FluidConduitOverlay, SketchBox, type ConduitLink } from '@/components/motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PermissionDefinition } from '../permission/permission.types'
import type { RoleGrant } from './role-grant.model'
import './role-stage.css'

export interface GrantNode {
  id: string
  definition: PermissionDefinition | null
  state: 'linked' | 'unlinked' | 'added' | 'removed' | 'updated'
  configurable: boolean
}

const BASE_HEIGHT = 510
export const MIN_NODE_STEP = 72
export const SPRING_NODE_BUDGET = 24

/**
 * 计算权限图谱垂直几何布局：
 * - 小规模节点（<= 6）保持原 510 画布居中均分；
 * - 大规模节点（> 6）保证相邻节点最小安全间距 MIN_NODE_STEP (72)，自动撑开画布高度，杜绝文字与圆点重叠。
 */
export function computeGrantGraphGeometry(count: number): {
  canvasHeight: number
  roleY: number
  nodeY: (index: number) => number
} {
  if (count <= 1) {
    return {
      canvasHeight: BASE_HEIGHT,
      roleY: 250,
      nodeY: () => 250,
    }
  }
  const span = Math.max(360, (count - 1) * MIN_NODE_STEP)
  const canvasHeight = Math.max(BASE_HEIGHT, span + 150)
  const roleY = Math.min(250, Math.round(canvasHeight / 2))
  return {
    canvasHeight,
    roleY,
    nodeY: (index: number) => 75 + (index / (count - 1)) * span,
  }
}

export function RoleGrantGraph({
  roleName,
  nodes,
  grants,
  selectedId,
  editing,
  disabled,
  onSelect,
  onToggle,
}: {
  roleName: string
  nodes: readonly GrantNode[]
  grants?: ReadonlyMap<string, RoleGrant>
  selectedId: string | null
  editing: boolean
  disabled: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation('system')
  const stageRef = useRef<HTMLDivElement>(null)
  const modules = Array.from(new Set(nodes.map((node) => node.definition?.moduleKey ?? 'system')))
  const [activeModule, setActiveModule] = useState<string | null>(null)
  const effectiveModule = activeModule && modules.includes(activeModule) ? activeModule : null
  const visibleNodes = effectiveModule
    ? nodes.filter((node) => (node.definition?.moduleKey ?? 'system') === effectiveModule)
    : nodes

  const conduitLinks = useMemo<ConduitLink[]>(() => {
    const links: ConduitLink[] = []
    for (let idx = 0; idx < visibleNodes.length; idx += 1) {
      const node = visibleNodes[idx]
      const prev = idx > 0 ? visibleNodes[idx - 1] : null
      const grant = grants?.get(node.id)
      const linked = ['linked', 'added', 'updated'].includes(node.state)
      links.push({
        id: `valve-bus-${node.id}`,
        from: prev ? `grant-valve-${prev.id}` : 'grant-bus-root',
        to: `grant-valve-${node.id}`,
        enabled: linked,
        scope: grant?.scopeOverride === 'ALL' ? 'ALL' : linked ? 'STANDARD' : 'BROKEN',
      })
    }
    return links
  }, [grants, visibleNodes])

  const linkedCount = visibleNodes.filter((n) =>
    ['linked', 'added', 'updated'].includes(n.state),
  ).length

  return (
    <div className="space-y-3 p-3 sm:p-4">
      {nodes.length > 12 && modules.length > 1 && (
        <div
          role="toolbar"
          data-slot="grant-graph-module-filter"
          aria-label={t('authorization.moduleFilter', { defaultValue: '模块分流筛选' })}
          className="flex flex-wrap items-center gap-1.5"
        >
          <Button
            type="button"
            size="xs"
            variant={effectiveModule === null ? 'secondary' : 'ghost'}
            onClick={() => setActiveModule(null)}
          >
            {t('authorization.allModules', { defaultValue: '全部' })} ({nodes.length})
          </Button>
          {modules.map((moduleKey) => {
            const count = nodes.filter(
              (node) => (node.definition?.moduleKey ?? 'system') === moduleKey,
            ).length
            return (
              <Button
                key={moduleKey}
                type="button"
                size="xs"
                variant={effectiveModule === moduleKey ? 'secondary' : 'ghost'}
                onClick={() => setActiveModule(moduleKey)}
              >
                {moduleKey} ({count})
              </Button>
            )
          })}
        </div>
      )}

      <div
        ref={stageRef}
        role="group"
        aria-label={t('authorization.title')}
        className="relative max-h-[36rem] overflow-y-auto overflow-x-hidden pr-1"
      >
        <FluidConduitOverlay
          containerRef={stageRef}
          links={conduitLinks}
          flow="vertical"
          minContainerWidth={260}
          pulseKey={`${effectiveModule ?? 'all'}-${linkedCount}`}
        />

        <div className="relative z-[2] space-y-3 pl-2 sm:pl-3">
          <div className="flex items-center gap-3.5">
            <span
              data-conduit-anchor="grant-bus-root"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-primary/15 text-brand-text shadow-xs"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{roleName}</span>
              <span>·</span>
              <span className="tabular-nums">
                {linkedCount} / {visibleNodes.length}
              </span>
            </div>
          </div>

          <ul className="space-y-3">
            {visibleNodes.map((node) => {
              const linked = ['linked', 'added', 'updated'].includes(node.state)
              const name = node.definition?.name ?? node.id
              const grant = grants?.get(node.id)
              const isSelected = selectedId === node.id
              return (
                <li key={node.id} className="relative flex items-center gap-3 sm:gap-3.5">
                  <button
                    type="button"
                    data-conduit-anchor={`grant-valve-${node.id}`}
                    data-state={node.state}
                    data-active={isSelected}
                    aria-pressed={isSelected}
                    aria-label={t('authorization.inspect', { name })}
                    onClick={() => onSelect(node.id)}
                    className={cn(
                      'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      linked
                        ? 'border-brand-text/50 bg-primary/15 text-brand-text'
                        : 'border-border-subtle bg-muted text-muted-foreground',
                      isSelected && 'ring-2 ring-ring',
                    )}
                  >
                    <KeyRound className="size-3.5" aria-hidden="true" />
                  </button>

                  <SketchBox
                    seed={node.id.length * 7 + 13}
                    wash={isSelected ? 'normal' : 'none'}
                    className={cn(
                      'min-w-0 flex-1 transition-colors',
                      isSelected && 'border-brand-text/60',
                    )}
                  >
                    <div className="grid items-center gap-2 p-2.5 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto] sm:gap-3 sm:px-3.5 sm:py-2.5">
                      <button
                        type="button"
                        onClick={() => onSelect(node.id)}
                        className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {node.definition?.name ?? t('authorization.definitionMissing')}
                          </span>
                        </div>
                        <p
                          className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                          title={node.definition?.code ?? node.id}
                        >
                          {node.definition?.code ?? node.id}
                        </p>
                      </button>

                      <Badge variant="outline" className="w-fit text-[11px]">
                        {grant
                          ? t(`authorization.${grant.scopeOverride}`, {
                              defaultValue: grant.scopeOverride,
                            })
                          : t(`authorization.${node.state}`)}
                      </Badge>

                      <span className="text-xs text-muted-foreground tabular-nums">
                        {grant
                          ? grant.validFrom || grant.validUntil
                            ? `${grant.validFrom ? new Date(grant.validFrom).toLocaleDateString() : '∞'} → ${grant.validUntil ? new Date(grant.validUntil).toLocaleDateString() : '∞'}`
                            : t('authorization.permanent', { defaultValue: '长期' })
                          : t(`authorization.${node.state}`)}
                      </span>

                      {editing ? (
                        <Button
                          type="button"
                          size="xs"
                          variant={linked ? 'ghost' : 'outline'}
                          disabled={disabled || (!linked && !node.configurable)}
                          onClick={() => onToggle(node.id)}
                          aria-label={t(
                            linked ? 'authorization.removeNamed' : 'authorization.addNamed',
                            { name },
                          )}
                        >
                          {linked ? (
                            <Unlink className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Plus className="size-3.5" aria-hidden="true" />
                          )}
                          <span>{t(`authorization.${node.state}`)}</span>
                        </Button>
                      ) : null}
                    </div>
                  </SketchBox>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
