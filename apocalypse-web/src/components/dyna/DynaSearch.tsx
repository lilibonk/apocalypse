/**
 * DynaSearch：schema 搜索项 → 搜索区（查询/重置，超过折叠阈值时收起/展开）。
 * 只负责受控渲染与事件回调，查询状态由 DynaPage 持有。
 */

import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldOption, FieldSelect } from '@/components/ui/field-select'

import type { DynaSearchField } from './schema'
import { useDynaText, useFieldOptions } from './use-dyna'

/** 收起态直出的搜索项数量；超出部分折叠到「展开」。 */
const COLLAPSED_COUNT = 3

export interface DynaSearchProps {
  fields: DynaSearchField[]
  presentation?: 'panel' | 'toolbar'
  /** 草稿值（输入态，未生效）；生效查询条件由父组件持有。 */
  values: Record<string, string>
  onChange: (name: string, value: string) => void
  onSearch: () => void
  onReset: () => void
}

function SearchControl({
  field,
  id,
  values,
  onChange,
}: {
  field: DynaSearchField
  id: string
  values: Record<string, string>
  onChange: (name: string, value: string) => void
}) {
  const t = useDynaText()
  const options = useFieldOptions(field)
  const value = values[field.name] ?? ''

  if (field.type === 'input') {
    return (
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(field.name, event.target.value)}
        placeholder={field.placeholder ? t(field.placeholder) : undefined}
        className="w-full sm:w-56"
      />
    )
  }

  if (field.type === 'date-range') {
    const [beginKey, endKey] = field.rangeKeys ?? [`${field.name}Begin`, `${field.name}End`]
    const labelText = t(field.label ?? field.placeholder ?? 'querySearch')
    return (
      <div className="flex flex-wrap items-center gap-2" data-slot="search-date-range">
        <DatePicker
          id={id}
          mode="date"
          value={values[beginKey] ?? ''}
          onValueChange={(next) => onChange(beginKey, next)}
          aria-label={`${labelText} (${t('rangeStart')})`}
          className="w-36"
        />
        <span className="text-muted-foreground" aria-hidden="true">
          –
        </span>
        <DatePicker
          id={`${id}-end`}
          mode="date"
          value={values[endKey] ?? ''}
          onValueChange={(next) => onChange(endKey, next)}
          aria-label={`${labelText} (${t('rangeEnd')})`}
          className="w-36"
        />
      </div>
    )
  }

  if (field.type === 'number-range') {
    const [minKey, maxKey] = field.rangeKeys ?? [`${field.name}Min`, `${field.name}Max`]
    return (
      <div className="flex items-center gap-2" data-slot="search-number-range">
        <Input
          id={id}
          type="number"
          value={values[minKey] ?? ''}
          onChange={(event) => onChange(minKey, event.target.value)}
          placeholder={t('rangeMin')}
          className="w-24"
        />
        <span className="text-muted-foreground" aria-hidden="true">
          –
        </span>
        <Input
          id={`${id}-max`}
          type="number"
          value={values[maxKey] ?? ''}
          onChange={(event) => onChange(maxKey, event.target.value)}
          placeholder={t('rangeMax')}
          aria-label={`${t(field.label ?? field.placeholder ?? 'querySearch')} (${t('rangeMax')})`}
          className="w-24"
        />
      </div>
    )
  }

  return (
    <FieldSelect
      id={id}
      value={value}
      onValueChange={(next) => onChange(field.name, next)}
      className="w-full sm:w-56"
      placeholder={field.placeholder ? t(field.placeholder) : undefined}
    >
      <FieldOption value="">{t('全部')}</FieldOption>
      {options.map((option) => (
        <FieldOption key={option.value} value={option.value}>
          {t(option.label)}
        </FieldOption>
      ))}
    </FieldSelect>
  )
}

export function DynaSearch({
  fields,
  values,
  onChange,
  onSearch,
  onReset,
  presentation = 'panel',
}: DynaSearchProps) {
  const t = useDynaText()
  const [expanded, setExpanded] = useState(false)
  const searchId = useId()

  const collapsible = fields.length > COLLAPSED_COUNT
  const visible = collapsible && !expanded ? fields.slice(0, COLLAPSED_COUNT) : fields

  if (fields.length === 0) return null

  return (
    <form
      className={cn(
        'grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end',
        presentation === 'panel' ? 'rounded-panel bg-muted/40 p-4' : 'object-workspace-search',
      )}
      aria-label={t('queryFilters')}
      onSubmit={(event) => {
        event.preventDefault()
        onSearch()
      }}
    >
      {visible.map((field) => (
        <div
          key={field.name}
          className={cn(
            'col-span-2 sm:col-auto',
            presentation === 'toolbar' && fields.length === 1
              ? 'flex items-center gap-3'
              : 'space-y-2',
          )}
        >
          <Label htmlFor={`${searchId}-${field.name}`}>
            {t(field.label ?? field.placeholder ?? 'querySearch')}
          </Label>
          <SearchControl
            id={`${searchId}-${field.name}`}
            field={field}
            values={values}
            onChange={onChange}
          />
        </div>
      ))}
      <Button type="submit" variant="secondary">
        <Search className="size-4" />
        {t('查询')}
      </Button>
      <Button type="button" variant="ghost" onClick={onReset}>
        {t('重置')}
      </Button>
      {collapsible && (
        <Button
          type="button"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('收起') : t('展开')}
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      )}
    </form>
  )
}
