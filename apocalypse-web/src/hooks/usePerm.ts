/**
 * 权限 hook：usePerm('system:user:list') → boolean。
 * perms 命名约定：域:对象:动作。区块级包裹组件见 components/Perm.tsx。
 */

import { useAuthStore } from '@/stores/auth'

export function usePerm(perm: string): boolean {
  return useAuthStore((state) => state.perms.includes(perm))
}
