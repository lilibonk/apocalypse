import { createRef, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const captured = vi.hoisted(() => ({
  select: undefined as ComponentProps<'button'> | undefined,
  date: undefined as ComponentProps<'button'> | undefined,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

// Inspect the adapter-to-trigger boundary without replacing the production prop composition.
vi.mock('./select', () => ({
  Select: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectTrigger: (props: ComponentProps<'button'>) => {
    captured.select = props
    return <button {...props} />
  },
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: () => null,
  SelectItem: () => null,
}))

vi.mock('radix-ui', () => ({
  Popover: {
    Root: ({ children }: { children: ReactNode }) => <>{children}</>,
    Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    Portal: () => null,
    Content: () => null,
  },
}))

vi.mock('./button', () => ({
  Button: ({ variant, ...props }: ComponentProps<'button'> & { variant?: string }) => {
    captured.date = props
    return <button data-variant={variant} {...props} />
  },
}))

import { DatePicker } from './date-picker'
import { FieldOption, FieldSelect } from './field-select'

beforeEach(() => {
  captured.select = undefined
  captured.date = undefined
})

describe('field control trigger contracts', () => {
  const contract = () => ({
    id: 'start-date',
    'aria-label': 'Start date',
    'aria-describedby': 'start-date-description start-date-message',
    'aria-invalid': true as const,
    onBlur: vi.fn(),
    ref: createRef<HTMLButtonElement>(),
  })

  it('connects select validation, descriptions, blur and focus refs to the trigger', () => {
    const props = contract()
    const html = renderToStaticMarkup(
      <FieldSelect {...props} value="" onValueChange={vi.fn()}>
        <FieldOption value="">Choose an option</FieldOption>
      </FieldSelect>,
    )
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="start-date-description start-date-message"')
    expect(captured.select).toMatchObject(props)
    expect(captured.select?.ref).toBe(props.ref)
    expect(captured.select?.onBlur).toBe(props.onBlur)
  })

  it('connects date validation, descriptions, blur and focus refs to its visible trigger', () => {
    const props = contract()
    const html = renderToStaticMarkup(
      <DatePicker {...props} value="2026-09-27" onValueChange={vi.fn()} />,
    )
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="start-date-description start-date-message"')
    expect(html).toContain('2026-09-27')
    expect(captured.date).toMatchObject(props)
    expect(captured.date?.ref).toBe(props.ref)
    expect(captured.date?.onBlur).toBe(props.onBlur)
  })
})
