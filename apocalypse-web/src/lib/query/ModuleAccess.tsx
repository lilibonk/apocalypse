import {
  Fragment,
  createElement,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react'

import { accessLifecycle } from './access-lease'
import type { ModuleScope } from './module-scope'

/** Authorization changes reset the affected module's editor state in the rendering boundary. */
export function ModuleAccess({
  scope,
  component,
  children,
}: {
  scope: ModuleScope
  component?: ComponentType
  children?: ReactNode
}) {
  useSyncExternalStore(
    accessLifecycle.subscribe,
    accessLifecycle.snapshot,
    accessLifecycle.snapshot,
  )
  const base = accessLifecycle.capture(scope.moduleKey, [])
  const editorGeneration = accessLifecycle.capture(scope.moduleKey, scope.requiredPerms)
  if (!accessLifecycle.isCurrent(base)) return null
  return component
    ? createElement(component, { key: editorGeneration.key })
    : createElement(Fragment, { key: editorGeneration.key }, children)
}
