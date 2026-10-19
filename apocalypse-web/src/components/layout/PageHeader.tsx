import type { ReactNode } from 'react'

/**
 * The single page header: title and description on the left; on the right the view switch first,
 * then page actions. Every view of a page renders the same header, so switching views never moves
 * the title or the actions.
 */
export function PageHeader({
  title,
  description,
  view,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  /** View switch (SegmentedControl); omitted on pages with a single view. */
  view?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {(view || actions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {view}
          {view && actions && (
            <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />
          )}
          {actions}
        </div>
      )}
    </header>
  )
}
