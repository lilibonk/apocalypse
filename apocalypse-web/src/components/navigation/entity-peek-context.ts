import { createContext, useContext } from 'react'

import type { EntityRouteIntent } from './entity-intent'

export interface EntityPeekContextValue {
  openPeek: (intent: EntityRouteIntent, authorizedPath: string | null) => void
  closePeek: () => void
}

export const EntityPeekContext = createContext<EntityPeekContextValue | null>(null)

export function useEntityPeek(): EntityPeekContextValue | null {
  return useContext(EntityPeekContext)
}
