import type { useAuthStore } from '@/stores/auth'

/** Questions need both role read and catalog read; user profiles are scoped server-side. */
export const canAskAuthorizationQuestions = (auth: ReturnType<typeof useAuthStore.getState>) =>
  auth.meLoaded &&
  auth.perms.includes('system:role:list') &&
  auth.perms.includes('system:permission:list')
