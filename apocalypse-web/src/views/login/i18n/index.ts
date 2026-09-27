import type { AppI18nModule } from '@/i18n/module-loader'

const loginPageI18n = {
  namespace: 'login-page',
  resources: {
    zh: {
      workspace: '你的管理工作空间',
      description: '账户、权限与日常管理，在一个清晰的工作空间。',
      subtitle: '登录后，继续今天的工作。',
      theme: '外观',
      language: '语言',
      usernamePlaceholder: '输入你的用户名',
      accessNote: '使用组织分配的账户登录。',
    },
    en: {
      workspace: 'Your management workspace',
      description: 'Accounts, permissions, and everyday administration in one clear workspace.',
      subtitle: 'Sign in to continue your work.',
      theme: 'Appearance',
      language: 'Language',
      usernamePlaceholder: 'Enter your username',
      accessNote: 'Use the account provided by your organization.',
    },
  },
} satisfies AppI18nModule

export default loginPageI18n
