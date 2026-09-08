import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { SlimeChecks } from './SlimeChecks'

export function mountSlimeChecks(element: HTMLElement) {
  createRoot(element).render(createElement(SlimeChecks))
}
