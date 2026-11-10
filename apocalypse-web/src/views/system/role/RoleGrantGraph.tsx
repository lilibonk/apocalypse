import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { KeyRound, Plus, ShieldCheck, Unlink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import { Button } from '@/components/ui/button'
import type { PermissionDefinition } from '../permission/permission.types'
import './role-permission-editor.css'

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

function GrantEdge({
  y,
  roleY,
  state,
  animate,
}: {
  y: number
  roleY: number
  state: GrantNode['state']
  animate: boolean
}) {
  const target = { d: `M 150 ${roleY} C 335 ${roleY},335 ${y},500 ${y}` }
  const controls = useSurfaceAnimation(target, animate, insightMotion.layout)
  return (
    <motion.path
      initial={target}
      animate={controls}
      className="role-menu-editor-edge"
      data-state={state}
    />
  )
}

function GrantPosition({
  y,
  canvasHeight,
  animate,
  children,
}: {
  y: number
  canvasHeight: number
  animate: boolean
  children: ReactNode
}) {
  const target = { top: `${(y / canvasHeight) * 100}%`, opacity: 1 }
  const controls = useSurfaceAnimation(target, animate, insightMotion.layout)
  return (
    <motion.div
      className="absolute left-0 w-full"
      initial={animate ? { ...target, opacity: 0 } : target}
      animate={controls}
    >
      {children}
    </motion.div>
  )
}

export function RoleGrantGraph({
  roleName,
  nodes,
  selectedId,
  editing,
  disabled,
  onSelect,
  onToggle,
}: {
  roleName: string
  nodes: readonly GrantNode[]
  selectedId: string | null
  editing: boolean
  disabled: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation('system')
  const motionEnabled = useMotionPreference()
  const modules = Array.from(new Set(nodes.map((node) => node.definition?.moduleKey ?? 'system')))
  const [activeModule, setActiveModule] = useState<string | null>(null)
  const effectiveModule = activeModule && modules.includes(activeModule) ? activeModule : null
  const visibleNodes = effectiveModule
    ? nodes.filter((node) => (node.definition?.moduleKey ?? 'system') === effectiveModule)
    : nodes

  const { canvasHeight, roleY, nodeY } = computeGrantGraphGeometry(visibleNodes.length)
  const animate = motionEnabled && visibleNodes.length <= SPRING_NODE_BUDGET

  return (
    <div className="space-y-2">
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
        className={
          canvasHeight > BASE_HEIGHT
            ? 'max-h-[34rem] overflow-y-auto overflow-x-hidden rounded-panel'
            : undefined
        }
      >
        <div
          className="role-menu-editor-canvas"
          role="group"
          aria-label={t('authorization.title')}
          style={canvasHeight > BASE_HEIGHT ? { aspectRatio: `780 / ${canvasHeight}` } : undefined}
        >
          <svg
            viewBox={`0 0 780 ${canvasHeight}`}
            className="absolute inset-0 size-full"
            aria-hidden="true"
          >
            {visibleNodes.map((node, index) => (
              <GrantEdge
                key={node.id}
                y={nodeY(index)}
                roleY={roleY}
                state={node.state}
                animate={animate}
              />
            ))}
          </svg>
          <div
            className="role-menu-editor-node flex items-center justify-center"
            data-role="true"
            style={{
              width: `${(104 / 780) * 100}%`,
              left: `${(150 / 780) * 100}%`,
              top: `${(roleY / canvasHeight) * 100}%`,
            }}
          >
            <ShieldCheck className="size-8" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p
            className="absolute line-clamp-3 break-words text-center text-sm font-semibold"
            style={{
              left: '4%',
              top: `${((roleY + 76) / canvasHeight) * 100}%`,
              width: '31%',
            }}
          >
            {roleName}
          </p>
          {visibleNodes.map((node, index) => {
            const linked = ['linked', 'added', 'updated'].includes(node.state)
            const name = node.definition?.name ?? node.id
            const currentY = nodeY(index)
            return (
              <GrantPosition
                key={node.id}
                y={currentY}
                canvasHeight={canvasHeight}
                animate={animate}
              >
                <button
                  type="button"
                  className="role-menu-editor-node flex items-center justify-center"
                  data-state={node.state}
                  data-active={selectedId === node.id}
                  data-node-y={Math.round(currentY)}
                  style={{
                    width: `${(56 / 780) * 100}%`,
                    left: `${(500 / 780) * 100}%`,
                    top: 0,
                  }}
                  aria-pressed={selectedId === node.id}
                  aria-label={t('authorization.inspect', { name })}
                  onClick={() => onSelect(node.id)}
                >
                  <KeyRound className="size-5" aria-hidden="true" />
                </button>
                <div
                  className="role-menu-editor-node-label space-y-2"
                  style={{
                    width: `${(205 / 780) * 100}%`,
                    left: `${(545 / 780) * 100}%`,
                    top: 0,
                  }}
                >
                  <button
                    className="block w-full truncate text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                    onClick={() => onSelect(node.id)}
                  >
                    {node.definition?.name ?? t('authorization.definitionMissing')}
                  </button>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={node.definition?.code ?? node.id}
                  >
                    {node.definition?.code ?? node.id}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {node.definition
                      ? `${node.definition.moduleKey ?? 'system'} / ${node.definition.resource} / ${node.definition.action}`
                      : ''}
                  </p>
                  {editing ? (
                    <Button
                      size="xs"
                      variant={linked ? 'ghost' : 'outline'}
                      disabled={disabled || (!linked && !node.configurable)}
                      onClick={() => onToggle(node.id)}
                      aria-label={t(
                        linked ? 'authorization.removeNamed' : 'authorization.addNamed',
                        {
                          name,
                        },
                      )}
                    >
                      {linked ? <Unlink className="size-3.5" /> : <Plus className="size-3.5" />}
                      {t(`authorization.${node.state}`)}
                    </Button>
                  ) : null}
                </div>
              </GrantPosition>
            )
          })}
        </div>
      </div>
    </div>
  )
}
