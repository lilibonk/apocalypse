import type { ComponentType } from 'react'
import type { NavigateOptions } from 'react-router'

import type { FlatRoute } from '@/routes/menu-routes'
import type { useAuthStore } from '@/stores/auth'

/**
 * Command palette "?" question providers. Modules own their questions, data and copy; the core
 * palette only discovers `views/<module>/command-questions.tsx` at build time (same pattern as module
 * locale packs), so layout never imports business modules directly.
 */
export interface CommandQuestionPanelProps {
  /** Text after the leading "?". */
  query: string
  setQuery: (query: string) => void
  routes: readonly FlatRoute[]
  /** Optional route state carries display context only; destinations reload authorized data. */
  navigate: (path: string, options?: NavigateOptions) => void
  /** Highlight an item by its cmdk value, e.g. the first result of an asynchronous lookup. */
  highlight: (value: string) => void
}

export interface CommandQuestionProvider {
  id: string
  /** Static permission gate; providers that cannot answer render nothing. */
  canAsk: (auth: ReturnType<typeof useAuthStore.getState>) => boolean
  /** Shown when no provider can answer, e.g. the permissions required. */
  deniedHint: (t: (key: string) => string) => string
  Panel: ComponentType<CommandQuestionPanelProps>
}

const discovered = import.meta.glob<{ default: CommandQuestionProvider }>(
  '../../views/**/command-questions.tsx',
  { eager: true },
)

export const commandQuestionProviders: readonly CommandQuestionProvider[] = Object.keys(discovered)
  .sort()
  .map((path) => discovered[path].default)
