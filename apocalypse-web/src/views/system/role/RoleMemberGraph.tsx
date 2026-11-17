import { useMemo, useRef } from 'react'
import { Link2, Plus, ShieldCheck, Unlink, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FluidConduitOverlay, SketchBox, type ConduitLink } from '@/components/motion'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { RoleGraphMember } from './role-permission.queries'
import type { RoleMemberLinkState } from './role-member-draft.model'
import './role-stage.css'

export interface RoleMemberGraphNode {
  id: string
  member?: RoleGraphMember
  state?: RoleMemberLinkState
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
  const stageRef = useRef<HTMLDivElement>(null)

  const conduitLinks = useMemo<ConduitLink[]>(
    () =>
      nodes.map((node) => {
        const state = node.state ?? 'linked'
        const linked = state === 'linked' || state === 'added'
        return {
          id: `member-link-${node.id}`,
          from: `member-node-${node.id}`,
          to: 'member-role-hub',
          enabled: linked,
          scope: selectedId === node.id ? 'ALL' : linked ? 'STANDARD' : 'BROKEN',
        }
      }),
    [nodes, selectedId],
  )

  const linkedCount = nodes.filter((node) => {
    const state = node.state ?? 'linked'
    return state === 'linked' || state === 'added'
  }).length

  return (
    <div
      ref={stageRef}
      className="relative mt-4 rounded-panel border border-border-subtle bg-card/60 p-4 sm:p-5"
      role="group"
      aria-label={t('roleMembers.graph')}
    >
      <FluidConduitOverlay
        containerRef={stageRef}
        links={conduitLinks}
        flow="horizontal"
        minContainerWidth={460}
        pulseKey={`${selectedId ?? 'none'}-${linkedCount}`}
      />

      <div className="relative z-[2] grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,10.5rem)] md:gap-11">
        <ul className="space-y-2.5">
          {nodes.map((node) => {
            const state = node.state ?? 'linked'
            const linked = state === 'linked' || state === 'added'
            const name = node.member?.nickname || node.member?.username || node.id
            const StateIcon = linked ? Link2 : state === 'removed' ? Unlink : Plus
            const active = selectedId === node.id
            return (
              <li key={node.id}>
                <button
                  type="button"
                  data-conduit-anchor={`member-node-${node.id}`}
                  data-state={state}
                  data-selected={active}
                  aria-pressed={onToggle ? linked : active}
                  disabled={disabled}
                  onClick={() => {
                    onSelect(node.id)
                    onToggle?.(node.id)
                  }}
                  aria-label={
                    onToggle
                      ? t(linked ? 'roleMemberEdit.removeNamed' : 'roleMemberEdit.addNamed', {
                          name,
                        })
                      : t('roleMembers.inspect', { name })
                  }
                  className={cn(
                    'flex w-full items-center gap-3 rounded-panel border border-border-subtle bg-card/92 p-3 text-left shadow-xs transition-colors hover:border-brand-text/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                    active && 'border-brand-text/70 bg-primary/8',
                    state === 'removed' && 'border-destructive/45 bg-destructive/5',
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-brand-text">
                    <UserRound className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {node.member ? name : t('roleMemberEdit.unreadProfile')}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      @{node.member?.username ?? node.id}
                    </span>
                    {onToggle && (
                      <Badge
                        variant={linked ? 'secondary' : 'outline'}
                        className="w-fit max-w-full text-[11px]"
                      >
                        {t(`roleMemberEdit.state.${state}`)}
                      </Badge>
                    )}
                  </span>
                  {onToggle && (
                    <StateIcon className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex justify-center">
          <SketchBox
            seed={47}
            wash="normal"
            data-conduit-anchor="member-role-hub"
            className="w-full p-4 text-center"
          >
            <span className="role-permission-role-icon mx-auto mb-2 flex size-11 items-center justify-center rounded-full border border-border-subtle">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <p className="truncate text-sm font-semibold text-foreground">{roleName}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
              {linkedCount} / {nodes.length}
            </p>
          </SketchBox>
        </div>
      </div>
    </div>
  )
}
