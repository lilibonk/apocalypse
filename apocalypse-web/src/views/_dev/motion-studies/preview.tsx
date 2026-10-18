/** Development-only, offline design study. Never imported by the production app or menu map. */
import { createRoot } from 'react-dom/client'

import { AppProviders } from '@/app/providers'
import '@/index.css'

import { MotionStudies } from './MotionStudies'

if (!import.meta.env.DEV) throw new Error('Motion studies are development-only')

createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <MotionStudies />
  </AppProviders>,
)
