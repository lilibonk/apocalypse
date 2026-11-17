/**
 * Cross-page Entity Pill dual-track context routing protocol (URL SearchParams + History State).
 *
 * Security Invariant (AGENTS.md Redline 13):
 * `EntityRouteIntent` is strictly a client-side selection/filter hint. Target workspaces MUST
 * load data through their own authorized queries and never trust route state as data or grant truth.
 */

export type EntityKind =
  | 'user'
  | 'role'
  | 'dept'
  | 'permission'
  | 'menu'
  | 'session'
  | 'dict'
  | 'config'
  | 'calendar'
  | 'log-login'
  | 'log-oper'

export type EntityRelation = 'permissions' | 'members' | 'menus' | 'children' | 'roles'

/** Controlled menu `component` keys resolved via `useMenuRoute` / `flattenMenuRoutes(menus)`. */
export const ENTITY_COMPONENT_MAP: Record<EntityKind, string> = {
  role: 'system/role',
  user: 'system/user',
  dept: 'system/dept',
  permission: 'system/permission',
  menu: 'system/menu',
  session: 'system/online',
  dict: 'system/dict',
  config: 'system/config',
  calendar: 'calendar/calendars',
  'log-login': 'system/log/login',
  'log-oper': 'system/log/oper',
}

/** Primary domain-specific query parameter key for each entity kind. */
export const ENTITY_PRIMARY_PARAM: Record<EntityKind, string> = {
  role: 'roleId',
  user: 'userId',
  dept: 'deptId',
  permission: 'permId',
  menu: 'menuId',
  session: 'tokenId',
  dict: 'dictType',
  config: 'configKey',
  calendar: 'calendarId',
  'log-login': 'keyword',
  'log-oper': 'keyword',
}

export interface EntitySourceRef {
  kind: EntityKind
  id: string
  label: string
  path?: string
}

export interface EntityRouteIntent {
  /** Discriminant entity kind. */
  kind: EntityKind
  /** Target entity identifier (Snowflake ID string or business key like roleKey / code / dictType / configKey). */
  id: string
  /** Human-readable display label (used only as a search/breadcrumb hint). */
  label?: string
  /** Optional secondary relation lens in the target workspace (e.g., 'permissions' | 'members' | 'menus'). */
  relation?: EntityRelation
  /** Secondary entity ID or code to highlight inside the target workspace. */
  focusTargetId?: string
  /** Department filter hint (for user / dept workspaces). */
  deptId?: string
  /** Role filter hint (for user / role workspaces). */
  roleId?: string
  /** Permission module key hint (supports `'__core__'`). */
  moduleKey?: string
  /** Permission resource hint. */
  resource?: string
  /** Config or dict group key hint. */
  groupKey?: string
  /** Whether to expand ancestor chains on arrival. */
  expandAncestors?: boolean
  /** One-shot causal pulse flag (stored in History State and cleared after consumption). */
  triggerPulse?: boolean
  /** Optional origin entity reference for rendering a quick `< Back to source` pill. */
  source?: EntitySourceRef
}

const VALID_KINDS = new Set<EntityKind>([
  'user',
  'role',
  'dept',
  'permission',
  'menu',
  'session',
  'dict',
  'config',
  'calendar',
  'log-login',
  'log-oper',
])

const VALID_RELATIONS = new Set<EntityRelation>([
  'permissions',
  'members',
  'menus',
  'children',
  'roles',
])

function cleanToken(value: unknown, maxLength = 200): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return undefined
  return trimmed
}

export function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === 'string' && VALID_KINDS.has(value as EntityKind)
}

/**
 * Encodes an `EntityRouteIntent` into URLSearchParams (writing both `focusId` and the
 * domain-specific parameter key for deep-link and refresh compatibility).
 */
export function buildEntitySearchParams(
  intent: EntityRouteIntent,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base)
  const id = cleanToken(intent.id, 120)
  if (!id) return params

  params.set('focusId', id)
  params.set(ENTITY_PRIMARY_PARAM[intent.kind], id)

  if (intent.kind === 'role') {
    if (!id.match(/^\d+$/)) {
      params.set('roleKey', id)
    }
    if (intent.relation && VALID_RELATIONS.has(intent.relation)) {
      params.set('relation', intent.relation)
      params.set('roleRelation', intent.relation)
    }
    if (intent.focusTargetId) {
      params.set('focus', intent.focusTargetId)
    }
  }

  if (intent.kind === 'user') {
    if (intent.label) params.set('keyword', intent.label)
    if (intent.deptId) params.set('deptId', intent.deptId)
    if (intent.roleId) params.set('roleId', intent.roleId)
  }

  if (intent.kind === 'permission') {
    if (intent.moduleKey) params.set('moduleKey', intent.moduleKey)
    if (intent.resource) params.set('resource', intent.resource)
    if (intent.label) params.set('keyword', intent.label)
  }

  if (intent.kind === 'config' && intent.groupKey) {
    params.set('group', intent.groupKey)
  }

  if (intent.kind === 'session' && intent.label) {
    params.set('keyword', intent.label)
  }

  return params
}

/**
 * Builds the full navigation target (`pathname`, `search`, and `state.entityIntent`)
 * for `navigate(to, { state })`.
 */
export function buildEntityRouteTarget(
  pathname: string,
  intent: EntityRouteIntent,
): {
  pathname: string
  search: string
  state: { entityIntent: EntityRouteIntent }
} {
  const params = buildEntitySearchParams(intent)
  const query = params.toString()
  return {
    pathname,
    search: query ? `?${query}` : '',
    state: {
      entityIntent: {
        ...intent,
        triggerPulse: intent.triggerPulse ?? true,
      },
    },
  }
}

function parseStateIntent(
  rawState: unknown,
  expectedKind?: EntityKind,
): EntityRouteIntent | undefined {
  if (!rawState || typeof rawState !== 'object') return undefined

  // Primary: location.state.entityIntent
  if (
    'entityIntent' in rawState &&
    rawState.entityIntent &&
    typeof rawState.entityIntent === 'object'
  ) {
    const candidate = rawState.entityIntent as Record<string, unknown>
    const rawKind = candidate.kind ?? candidate.type
    if (isEntityKind(rawKind) && (!expectedKind || rawKind === expectedKind)) {
      const id = cleanToken(candidate.id, 120)
      if (id) {
        const relation = VALID_RELATIONS.has(candidate.relation as EntityRelation)
          ? (candidate.relation as EntityRelation)
          : undefined
        let source: EntitySourceRef | undefined
        if (candidate.source && typeof candidate.source === 'object') {
          const src = candidate.source as Record<string, unknown>
          const srcKind = src.kind ?? src.type
          const srcId = cleanToken(src.id, 120)
          const srcLabel = cleanToken(src.label, 200)
          if (isEntityKind(srcKind) && srcId && srcLabel) {
            source = {
              kind: srcKind,
              id: srcId,
              label: srcLabel,
              path: cleanToken(src.path, 200),
            }
          }
        }
        return {
          kind: rawKind,
          id,
          label: cleanToken(candidate.label, 200),
          relation,
          focusTargetId: cleanToken(candidate.focusTargetId, 120),
          deptId: cleanToken(candidate.deptId, 100),
          roleId: cleanToken(candidate.roleId, 100),
          moduleKey: cleanToken(candidate.moduleKey, 100),
          resource: cleanToken(candidate.resource, 100),
          groupKey: cleanToken(candidate.groupKey, 100),
          expandAncestors:
            typeof candidate.expandAncestors === 'boolean' ? candidate.expandAncestors : undefined,
          triggerPulse: candidate.triggerPulse === true,
          source,
        }
      }
    }
  }

  return undefined
}

/**
 * Reads and merges the cross-page `EntityRouteIntent` from URL SearchParams (primary durable track)
 * and `location.state` (transient pulse & source breadcrumb track).
 */
export function readEntityIntent(
  searchParams: URLSearchParams,
  locationState: unknown,
  expectedKind?: EntityKind,
): EntityRouteIntent | undefined {
  const fromState = parseStateIntent(locationState, expectedKind)

  const kind: EntityKind | undefined =
    expectedKind ??
    fromState?.kind ??
    (searchParams.has('roleId') || searchParams.has('roleKey')
      ? 'role'
      : searchParams.has('deptId')
        ? 'dept'
        : searchParams.has('userId')
          ? 'user'
          : searchParams.has('permId')
            ? 'permission'
            : searchParams.has('menuId')
              ? 'menu'
              : searchParams.has('tokenId')
                ? 'session'
                : searchParams.has('dictType')
                  ? 'dict'
                  : searchParams.has('configKey')
                    ? 'config'
                    : searchParams.has('calendarId')
                      ? 'calendar'
                      : searchParams.has('keyword')
                        ? 'log-login'
                        : undefined)

  if (!kind) return fromState

  const primaryParam = ENTITY_PRIMARY_PARAM[kind]
  const paramId =
    cleanToken(searchParams.get(primaryParam), 120) ??
    (kind === 'role' ? cleanToken(searchParams.get('roleKey'), 120) : undefined) ??
    cleanToken(searchParams.get('focusId'), 120)

  const id = paramId ?? fromState?.id
  if (!id) return undefined

  const rawRelation = searchParams.get('relation') ?? searchParams.get('roleRelation')
  const relation = VALID_RELATIONS.has(rawRelation as EntityRelation)
    ? (rawRelation as EntityRelation)
    : fromState?.relation

  return {
    kind,
    id,
    label: cleanToken(searchParams.get('keyword'), 200) ?? fromState?.label,
    relation,
    focusTargetId: cleanToken(searchParams.get('focus'), 120) ?? fromState?.focusTargetId,
    deptId: cleanToken(searchParams.get('deptId'), 100) ?? fromState?.deptId,
    roleId: cleanToken(searchParams.get('roleId'), 100) ?? fromState?.roleId,
    moduleKey: cleanToken(searchParams.get('moduleKey'), 100) ?? fromState?.moduleKey,
    resource: cleanToken(searchParams.get('resource'), 100) ?? fromState?.resource,
    groupKey: cleanToken(searchParams.get('group'), 100) ?? fromState?.groupKey,
    expandAncestors: fromState?.expandAncestors ?? true,
    triggerPulse: fromState?.triggerPulse ?? false,
    source: fromState?.source,
  }
}
