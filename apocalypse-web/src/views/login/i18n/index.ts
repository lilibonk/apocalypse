import type { AppI18nModule } from '@/i18n/module-loader'

const loginPageI18n = {
  namespace: 'login-page',
  resources: {
    zh: {
      workspace: '你的管理工作空间',
      gestureHint: '按住揉捏 · 拎起松手 · 快速摇晃',
      description: '账户、权限与日常管理，在一个清晰的工作空间。',
      subtitle: '登录后，继续今天的工作。',
      world: '风格世界',
      worldFluid: '清透流体',
      worldSketchbook: '手绘手账',
      worldObsidian: '深邃夜色',
      language: '语言',
      langZh: '中文',
      langEn: 'English',
      usernamePlaceholder: '输入你的用户名',
      accessNote: '使用组织分配的账户登录。',
    },
    en: {
      workspace: 'Your management workspace',
      gestureHint: 'Hold to squish · Drag & toss · Shake',
      description: 'Accounts, permissions, and everyday administration in one clear workspace.',
      subtitle: 'Sign in to continue your work.',
      world: 'Theme world',
      worldFluid: 'Fluid',
      worldSketchbook: 'Sketchbook',
      worldObsidian: 'Obsidian',
      language: 'Language',
      langZh: '中文',
      langEn: 'English',
      usernamePlaceholder: 'Enter your username',
      accessNote: 'Use the account provided by your organization.',
    },
  },
} satisfies AppI18nModule

export default loginPageI18n
