import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api/client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => (error instanceof ApiError ? false : failureCount < 2),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})
