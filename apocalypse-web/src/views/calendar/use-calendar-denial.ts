import { useResourceDenial } from '@/lib/query/use-resource-denial'
import { calendarQueries, calendarScope } from './calendar.queries'

export function useCalendarDenial(
  calendarId: string,
  errors: readonly unknown[],
  reset: () => void,
  importId?: string,
) {
  return useResourceDenial({
    errors,
    reset,
    clear: {
      predicate: (query) =>
        calendarQueries.contexts.filter().predicate(query) ||
        (!!calendarId && calendarScope.filter({ calendarId }).predicate(query)) ||
        (importId !== undefined &&
          (calendarQueries.dataImports.filter().predicate(query) ||
            calendarQueries.importDiff.filter({ id: importId }).predicate(query))),
    },
    refresh: {
      predicate: (query) =>
        calendarQueries.contexts.filter().predicate(query) ||
        (importId !== undefined && calendarQueries.dataImports.filter().predicate(query)),
    },
  })
}
