/**
 * DynaForm：schema 字段/校验/布局 → 对话框形态的新增/编辑表单。
 * 基于既有 react-hook-form + zod 栈（zodResolver），校验器由 form-model.ts 从 schema 生成。
 * 未识别的字段类型渲染明确报错文案（应扩展渲染器或走逃逸舱手写页面）。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useForm, type Control, type Resolver } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PixelScale } from '@/effects/PixelWave'

import {
  buildFormValidator,
  defaultFormValues,
  formValuesToBody,
  rowToFormValues,
  visibleFields,
  type DynaFormValues,
} from './form-model'
import type { DynaFormField, DynaPageSchema } from './schema'
import { useDynaText, useFieldOptions } from './use-dyna'

export interface DynaFormProps {
  config: NonNullable<DynaPageSchema['form']>
  mode: 'create' | 'edit'
  open: boolean
  /** 编辑态回填的行数据。 */
  initialRow?: Record<string, unknown> | null
  submitting: boolean
  onOpenChange: (open: boolean) => void
  /** 收到的是已转换的提交 body（空串已剔除、number 已转换）。 */
  onSubmit: (body: Record<string, unknown>) => void
}

function FieldControl({
  field,
  control,
  disabled,
}: {
  field: DynaFormField
  control: Control<DynaFormValues>
  disabled: boolean
}) {
  const t = useDynaText()
  const options = useFieldOptions(field)

  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: controller }) => {
        const text = typeof controller.value === 'string' ? controller.value : ''

        const controlElement = (() => {
          switch (field.type) {
            case 'input':
            case 'date':
            case 'datetime':
              return (
                <Input
                  {...controller}
                  value={text}
                  type={
                    field.type === 'input'
                      ? 'text'
                      : field.type === 'date'
                        ? 'date'
                        : 'datetime-local'
                  }
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  disabled={disabled}
                />
              )
            case 'password':
              return (
                <Input
                  {...controller}
                  value={text}
                  type="password"
                  autoComplete="new-password"
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  disabled={disabled}
                />
              )
            case 'textarea':
              return (
                <Textarea
                  {...controller}
                  value={text}
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  disabled={disabled}
                />
              )
            case 'number':
              return (
                <Input
                  {...controller}
                  value={text}
                  type="number"
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  disabled={disabled}
                />
              )
            case 'select':
            case 'dict':
              return (
                <Select value={text} onValueChange={controller.onChange} disabled={disabled}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={field.placeholder ? t(field.placeholder) : undefined}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            case 'radio':
              return (
                <RadioGroup
                  value={text}
                  onValueChange={controller.onChange}
                  disabled={disabled}
                  className="flex flex-wrap gap-4"
                >
                  {options.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={option.value} />
                      {t(option.label)}
                    </label>
                  ))}
                </RadioGroup>
              )
            case 'switch':
              return (
                <Switch
                  checked={Boolean(controller.value)}
                  onCheckedChange={controller.onChange}
                  disabled={disabled}
                />
              )
            default:
              // zod 校验器已拦截未知类型；这里是运行时兜底文案（走逃逸舱或扩展渲染器）
              return (
                <p className="text-sm text-destructive">
                  {t('unknownField', { type: String(field.type) })}
                </p>
              )
          }
        })()

        return (
          <FormItem>
            <FormLabel>
              {t(field.label)}
              {field.required && (
                <>
                  <span className="ml-1 text-destructive" aria-hidden="true">
                    *
                  </span>
                  <span className="sr-only">{t('required')}</span>
                </>
              )}
            </FormLabel>
            {field.type === 'select' || field.type === 'dict' ? (
              controlElement
            ) : (
              <FormControl>{controlElement}</FormControl>
            )}
            {(field.help || field.minLength !== undefined || field.maxLength !== undefined) && (
              <FormDescription>
                {field.help
                  ? t(field.help)
                  : field.minLength !== undefined && field.maxLength !== undefined
                    ? t('lengthRange', { min: field.minLength, max: field.maxLength })
                    : field.minLength !== undefined
                      ? t('lengthMin', { min: field.minLength })
                      : t('lengthMax', { max: field.maxLength! })}
              </FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

export function DynaForm({
  config,
  mode,
  open,
  initialRow,
  submitting,
  onOpenChange,
  onSubmit,
}: DynaFormProps) {
  const t = useDynaText()
  const dialogRef = useRef<HTMLDivElement>(null)
  const fields = useMemo(() => visibleFields(config.fields, mode), [config.fields, mode])
  // 校验消息走 dyna.msg* 插值模板；label 先翻译再进模板（切语言时随 t 重建校验器）
  const validator = useMemo(
    () =>
      buildFormValidator(fields, (key, params) =>
        t(key, {
          ...params,
          ...(typeof params.label === 'string' ? { label: t(params.label) } : {}),
        }),
      ),
    [fields, t],
  )

  const form = useForm<DynaFormValues>({
    // schema 动态生成的校验器静态类型与 DynaFormValues 无法精确对齐，此处一次性收窄
    resolver: zodResolver(validator) as unknown as Resolver<DynaFormValues>,
    defaultValues: defaultFormValues(fields),
  })

  // 对话框每次打开时按模式重置（新增 → 默认值；编辑 → 行数据回填）
  useEffect(() => {
    if (!open) return
    form.reset(
      mode === 'edit' && initialRow
        ? rowToFormValues(fields, initialRow)
        : defaultFormValues(fields),
    )
  }, [open, mode, initialRow, fields, form])

  // Radix 默认会对首个可聚焦 input 执行 select()。编辑态已有回填值时，
  // 这会造成整段文本被选中并增加误覆盖风险；改为聚焦 Dialog 容器。
  const handleOpenAutoFocus = useCallback(
    (event: Event) => {
      if (mode !== 'edit') return
      event.preventDefault()
      dialogRef.current?.focus({ preventScroll: true })
    },
    [mode],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dialogRef} onOpenAutoFocus={handleOpenAutoFocus}>
        <DialogHeader data-pixel-dialog-stage="header">
          <DialogTitle>
            {mode === 'edit' ? t(config.editTitle ?? '编辑') : t(config.createTitle ?? '新增')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? t('修改后点击保存生效') : t('填写以下信息完成创建')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) =>
              onSubmit(formValuesToBody(fields, values, mode)),
            )}
            className="grid grid-cols-2 gap-4"
          >
            <div data-pixel-dialog-stage="body" className="col-span-2 grid grid-cols-2 gap-4">
              {fields.map((field) => (
                <div key={field.name} className={field.span === 1 ? '' : 'col-span-2'}>
                  <FieldControl
                    field={field}
                    control={form.control}
                    disabled={mode === 'edit' && !!field.disabledInEdit}
                  />
                </div>
              ))}
            </div>
            <div data-pixel-dialog-stage="footer" className="col-span-2">
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  {t('取消')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <PixelScale variant="inline" tone="current" />}
                  {submitting ? t('保存中…') : t('保存')}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
