/**
 * Command palette "?" provider for authorization questions, discovered at build time by
 * components/layout/command-extensions.ts. Components live in AuthorizationQuestions.tsx.
 */
import { lazy } from 'react'

import type { CommandQuestionProvider } from '@/components/layout/command-extensions'

import { canAskAuthorizationQuestions } from './authorization-questions.model'

// The panel ships in its own chunk; only this descriptor is part of the palette's entry code.
const AuthorizationQuestions = lazy(() =>
  import('./AuthorizationQuestions').then((module) => ({ default: module.AuthorizationQuestions })),
)

const authorizationQuestions: CommandQuestionProvider = {
  id: 'authorization',
  canAsk: canAskAuthorizationQuestions,
  deniedHint: (t) => t('system:commandQa.denied'),
  Panel: AuthorizationQuestions,
}

export default authorizationQuestions
