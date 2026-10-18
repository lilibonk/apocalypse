export type StudyLanguage = 'zh' | 'en'

export interface StudyProps {
  language: StudyLanguage
  /** Combined user preference and system reduced-motion setting. */
  motionEnabled: boolean
  onOpenGraph?: () => void
}
