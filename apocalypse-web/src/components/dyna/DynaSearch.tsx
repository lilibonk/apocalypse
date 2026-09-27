/**
 * DynaSearch：schema 搜索项 → 搜索区（查询/重置，超过折叠阈值时收起/展开）。
 * 只负责受控渲染与事件回调，查询状态由 DynaPage 持有。
 */

import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldOption, FieldSelect } from '@/components/ui/field-select'

import type { DynaSearchField } from './schema'
import { useDynaText, useFieldOptions } from './use-dyna'

/** 收起态直出的搜索项数量；超出部分折叠到「展开」。 */
const COLLAPSED_COUNT = 3

export interface DynaSearchProps {
  fields: DynaSearchField[]
  /** 草稿值（输入态，未生效）；生效查询条件由父组件持有。 */
  values: Record<string, string>
  onChange: (name: string, value: string) => void
  onSearch: () => void
  onReset: () => void
}

function SearchControl({
  field,
  id,
  value,
  onChange,
}: {
  field: DynaSearchField
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const t = useDynaText()
  const options = useFieldOptions(field)

  if (field.type === 'input') {
    return (
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder ? t(field.placeholder) : undefined}
        className="w-full sm:w-56"
      />
    )
  }

  return (
    <FieldSelect
      id={id}
      value={value}
      onValueChange={onChange}
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

export function DynaSearch({ fields, values, onChange, onSearch, onReset }: DynaSearchProps) {
  const t = useDynaText()
  const [expanded, setExpanded] = useState(false)
  const searchId = useId()

  const collapsible = fields.length > COLLAPSED_COUNT
  const visible = collapsible && !expanded ? fields.slice(0, COLLAPSED_COUNT) : fields

  if (fields.length === 0) return null

  return (
    <form
      className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4 sm:flex sm:flex-wrap sm:items-end"
      aria-label={t('queryFilters')}
      onSubmit={(event) => {
        event.preventDefault()
        onSearch()
      }}
    >
      {visible.map((field) => (
        <div key={field.name} className="col-span-2 space-y-2 sm:col-auto">
          <Label htmlFor={`${searchId}-${field.name}`}>
            {t(field.label ?? field.placeholder ?? 'querySearch')}
          </Label>
          <SearchControl
            id={`${searchId}-${field.name}`}
            field={field}
            value={values[field.name] ?? ''}
            onChange={(value) => onChange(field.name, value)}
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
