import { motion } from 'motion/react'
import type { ReactNode } from 'react'
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

function GrantEdge({ y, state }: { y: number; state: GrantNode['state'] }) {
  const enabled = useMotionPreference()
  const target = { d: `M 150 250 C 335 250,335 ${y},500 ${y}` }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.path
      initial={target}
      animate={controls}
      className="role-menu-editor-edge"
      data-state={state}
    />
  )
}

function GrantPosition({ y, children }: { y: number; children: ReactNode }) {
  const enabled = useMotionPreference()
  const target = { top: `${(y / 510) * 100}%`, opacity: 1 }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.div
      className="absolute left-0 w-full"
      initial={enabled ? { ...target, opacity: 0 } : target}
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
  const y = (index: number) => (nodes.length === 1 ? 250 : 75 + (index / (nodes.length - 1)) * 360)
  return (
    <div className="role-menu-editor-canvas" role="group" aria-label={t('authorization.title')}>
      <svg viewBox="0 0 780 510" className="absolute inset-0 size-full" aria-hidden="true">
        {nodes.map((node, index) => (
          <GrantEdge key={node.id} y={y(index)} state={node.state} />
        ))}
      </svg>
      <div
        className="role-menu-editor-node flex items-center justify-center"
        data-role="true"
        style={{
          width: `${(104 / 780) * 100}%`,
          left: `${(150 / 780) * 100}%`,
          top: `${(250 / 510) * 100}%`,
        }}
      >
        <ShieldCheck className="size-8" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <p
        className="absolute line-clamp-3 break-words text-center text-sm font-semibold"
        style={{ left: '4%', top: '64%', width: '31%' }}
      >
        {roleName}
      </p>
      {nodes.map((node, index) => {
        const linked = ['linked', 'added', 'updated'].includes(node.state)
        const name = node.definition?.name ?? node.id
        return (
          <GrantPosition key={node.id} y={y(index)}>
            <button
              type="button"
              className="role-menu-editor-node flex items-center justify-center"
              data-state={node.state}
              data-active={selectedId === node.id}
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
                  aria-label={t(linked ? 'authorization.removeNamed' : 'authorization.addNamed', {
                    name,
                  })}
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
  )
}
