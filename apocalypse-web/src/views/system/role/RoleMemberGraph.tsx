import { motion } from 'motion/react'
import type { ComponentProps } from 'react'
import { Link2, Plus, ShieldCheck, Unlink, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { insightMotion } from '@/design/motion'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { useSurfaceAnimation } from '@/hooks/useSurfaceAnimation'
import type { RoleGraphMember } from './role-permission.queries'
import type { RoleMemberLinkState } from './role-member-draft.model'
import './role-member-relations.css'

export interface RoleMemberGraphNode {
  id: string
  member?: RoleGraphMember
  state?: RoleMemberLinkState
}

function MemberEdge({ y, state }: { y: number; state: RoleMemberLinkState }) {
  const enabled = useMotionPreference()
  const target = { d: `M 530 210 C 370 210,370 ${y},190 ${y}` }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.path
      initial={target}
      animate={controls}
      className="role-member-edit-edge"
      data-state={state}
    />
  )
}

function MemberNode({ y, ...props }: ComponentProps<typeof motion.button> & { y: number }) {
  const enabled = useMotionPreference()
  const target = { top: `${(y / 460) * 100}%`, opacity: 1 }
  const controls = useSurfaceAnimation(target, enabled, insightMotion.layout)
  return (
    <motion.button
      {...props}
      initial={enabled ? { ...target, opacity: 0 } : target}
      animate={controls}
    />
  )
}

export function RoleMemberGraph({
  roleName,
  nodes,
  selectedId,
  onSelect,
  onToggle,
  disabled = false,
}: {
  roleName: string
  nodes: readonly RoleMemberGraphNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle?: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('system')
  const nodeY = (index: number) => (nodes.length === 1 ? 210 : ((index + 0.5) / nodes.length) * 460)
  return (
    <div
      className="role-members-canvas relative mt-4"
      style={{ minHeight: `calc(var(--spacing) * ${Math.max(1, nodes.length) * 28})` }}
      role="group"
      aria-label={t('roleMembers.graph')}
    >
      <svg
        viewBox="0 0 720 460"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        fill="none"
        aria-hidden="true"
      >
        {nodes.map((node, index) => (
          <MemberEdge key={node.id} y={nodeY(index)} state={node.state ?? 'linked'} />
        ))}
      </svg>
      <div className="role-members-center absolute text-center">
        <span className="role-permission-role-icon flex size-16 items-center justify-center rounded-full border border-border">
          <ShieldCheck className="size-7" />
        </span>
        <p className="role-members-center-label absolute break-words text-sm font-semibold">
          {roleName}
        </p>
      </div>
      {nodes.map((node, index) => {
        const state = node.state ?? 'linked'
        const linked = state === 'linked' || state === 'added'
        const name = node.member?.nickname || node.member?.username || node.id
        const StateIcon = linked ? Link2 : state === 'removed' ? Unlink : Plus
        return (
          <MemberNode
            y={nodeY(index)}
            type="button"
            key={node.id}
            className="role-members-node absolute flex items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-state={state}
            data-selected={selectedId === node.id}
            aria-pressed={onToggle ? linked : selectedId === node.id}
            disabled={disabled}
            onClick={() => {
              onSelect(node.id)
              onToggle?.(node.id)
            }}
            aria-label={
              onToggle
                ? t(linked ? 'roleMemberEdit.removeNamed' : 'roleMemberEdit.addNamed', { name })
                : t('roleMembers.inspect', { name })
            }
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-brand-text">
              <UserRound className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {node.member ? name : t('roleMemberEdit.unreadProfile')}
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {node.member?.username ?? node.id}
              </span>
              {onToggle && (
                <span
                  className="mt-1 block truncate text-xs"
                  title={t(`roleMemberEdit.state.${state}`)}
                >
                  {t(`roleMemberEdit.state.${state}`)}
                </span>
              )}
            </span>
            {onToggle && <StateIcon className="size-4 shrink-0" aria-hidden="true" />}
          </MemberNode>
        )
      })}
    </div>
  )
}
