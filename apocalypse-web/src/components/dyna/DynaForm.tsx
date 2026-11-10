/**
 * DynaForm：schema 字段/校验/布局 → 对话框形态的新增/编辑表单。
 * 基于既有 react-hook-form + zod 栈（zodResolver），校验器由 form-model.ts 从 schema 生成。
 * 未识别的字段类型渲染明确报错文案（应扩展渲染器或走逃逸舱手写页面）。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch, type Control, type Resolver } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileUpload } from '@/components/ui/file-upload'
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
import { FieldOption, FieldSelect } from '@/components/ui/field-select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PixelScale } from '@/effects/PixelWave'
import { submitForm } from '@/lib/form-submit'

import {
  buildFormValidator,
  defaultFormValues,
  formValuesToBody,
  isFieldVisible,
  rowToFormValues,
  visibleFields,
  type DynaFormValues,
} from './form-model'
import type { DynaFormField, DynaPageSchema } from './schema'
import { useDynaText, useFieldOptions } from './use-dyna'

export type DynaAsyncFieldValidator = (
  value: string,
  values: DynaFormValues,
  mode?: 'create' | 'edit',
) => Promise<string | null | undefined>

export interface AsyncFieldValidationControllerOptions {
  fieldName: string
  mode?: 'create' | 'edit'
  disabled?: boolean
  debounceMs?: number
  asyncValidator?: DynaAsyncFieldValidator
  getValues: () => DynaFormValues
  setError: (name: string, error: { type: string; message: string }) => void
  clearErrors: (name: string) => void
}

/**
 * 失焦立即校验 + 输入防抖校验控制器（FE-W5 / M4）：
 * - 输入变更触发 300ms 防抖预检；
 * - 失焦（onBlur）立即取消挂起防抖并触发即时预检；
 * - 通过递增序号（seq）丢弃乱序慢响应，防止旧请求覆盖最新输入状态。
 */
export function createAsyncFieldValidationController({
  fieldName,
  mode,
  disabled = false,
  debounceMs = 300,
  asyncValidator,
  getValues,
  setError,
  clearErrors,
}: AsyncFieldValidationControllerOptions) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  const cancelDebounce = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  const runNow = (candidateValue: string) => {
    if (!asyncValidator || disabled) return
    const currentSeq = ++seq
    void Promise.resolve(
      mode !== undefined
        ? asyncValidator(candidateValue, getValues(), mode)
        : asyncValidator(candidateValue, getValues()),
    )
      .then((errorMessage) => {
        if (currentSeq !== seq) return
        if (errorMessage) {
          setError(fieldName, { type: 'validate', message: errorMessage })
        } else {
          clearErrors(fieldName)
        }
      })
      .catch(() => {
        // 防抖/失焦预检网络异常时不打断用户输入，交由提交阶段统一拦截
      })
  }

  return {
    scheduleDebounced(candidateValue: string) {
      if (!asyncValidator || disabled) return
      cancelDebounce()
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        runNow(candidateValue)
      }, debounceMs)
    },
    flushOnBlur(candidateValue: string) {
      if (!asyncValidator || disabled) return
      cancelDebounce()
      runNow(candidateValue)
    },
    dispose() {
      seq++
      cancelDebounce()
    },
  }
}

export interface DynaFormProps {
  config: NonNullable<DynaPageSchema['form']>
  mode: 'create' | 'edit'
  open: boolean
  /** 编辑态回填的行数据。 */
  initialRow?: Record<string, unknown> | null
  submitting: boolean
  submitDisabled?: boolean
  feedback?: ReactNode
  /** 可选异步校验器（如唯一性预检，M4）：字段名 → 返回错误文案或 null。 */
  asyncValidators?: Record<string, DynaAsyncFieldValidator>
  onOpenChange: (open: boolean) => void
  /** 收到的是已转换的提交 body（空串已剔除、number 已转换）。 */
  onSubmit: (body: Record<string, unknown>) => void
}

function FieldControl({
  field,
  control,
  disabled,
  asyncValidator,
  getValues,
  setError,
  clearErrors,
}: {
  field: DynaFormField
  control: Control<DynaFormValues>
  disabled: boolean
  asyncValidator?: DynaAsyncFieldValidator
  getValues: () => DynaFormValues
  setError: (name: string, error: { type: string; message: string }) => void
  clearErrors: (name: string) => void
}) {
  const t = useDynaText()
  const options = useFieldOptions(field)
  const asyncValidation = useMemo(
    () =>
      createAsyncFieldValidationController({
        fieldName: field.name,
        disabled,
        asyncValidator,
        getValues,
        setError,
        clearErrors,
      }),
    [asyncValidator, clearErrors, disabled, field.name, getValues, setError],
  )

  useEffect(() => {
    return () => {
      asyncValidation.dispose()
    }
  }, [asyncValidation])

  const scheduleDebouncedValidation = useCallback(
    (candidateValue: string) => {
      asyncValidation.scheduleDebounced(candidateValue)
    },
    [asyncValidation],
  )

  const flushBlurValidation = useCallback(
    (candidateValue: string) => {
      asyncValidation.flushOnBlur(candidateValue)
    },
    [asyncValidation],
  )

  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: controller }) => {
        const text = typeof controller.value === 'string' ? controller.value : ''

        const controlElement = (() => {
          switch (field.type) {
            case 'input':
              return (
                <Input
                  {...controller}
                  value={text}
                  onChange={(event) => {
                    controller.onChange(event)
                    scheduleDebouncedValidation(event.target.value)
                  }}
                  onBlur={() => {
                    controller.onBlur()
                    flushBlurValidation(text)
                  }}
                  type="text"
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  disabled={disabled}
                />
              )
            case 'date':
            case 'datetime':
              return (
                <DatePicker
                  value={text}
                  onValueChange={(nextValue) => {
                    controller.onChange(nextValue)
                    scheduleDebouncedValidation(nextValue)
                  }}
                  onBlur={() => {
                    controller.onBlur()
                    flushBlurValidation(text)
                  }}
                  ref={controller.ref}
                  mode={field.type === 'date' ? 'date' : 'datetime-local'}
                  aria-label={t(field.label)}
                  disabled={disabled}
                />
              )
            case 'password':
              return (
                <Input
                  {...controller}
                  value={text}
                  onChange={(event) => {
                    controller.onChange(event)
                    scheduleDebouncedValidation(event.target.value)
                  }}
                  onBlur={() => {
                    controller.onBlur()
                    flushBlurValidation(text)
                  }}
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
                  onChange={(event) => {
                    controller.onChange(event)
                    scheduleDebouncedValidation(event.target.value)
                  }}
                  onBlur={() => {
                    controller.onBlur()
                    flushBlurValidation(text)
                  }}
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  disabled={disabled}
                />
              )
            case 'number':
              return (
                <Input
                  {...controller}
                  value={text}
                  onChange={(event) => {
                    controller.onChange(event)
                    scheduleDebouncedValidation(event.target.value)
                  }}
                  onBlur={() => {
                    controller.onBlur()
                    flushBlurValidation(text)
                  }}
                  type="number"
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  disabled={disabled}
                />
              )
            case 'select':
            case 'dict':
            case 'tree-select':
              return (
                <FieldSelect
                  value={text}
                  onValueChange={(nextValue) => {
                    controller.onChange(nextValue)
                    scheduleDebouncedValidation(nextValue)
                  }}
                  onBlur={() => {
                    controller.onBlur()
                    flushBlurValidation(text)
                  }}
                  ref={controller.ref}
                  disabled={disabled}
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                >
                  <FieldOption value="" disabled={field.required}>
                    {t('queryUnselected')}
                  </FieldOption>
                  {options.map((option) => (
                    <FieldOption key={option.value} value={option.value}>
                      {field.translateOptions === false ? option.label : t(option.label)}
                    </FieldOption>
                  ))}
                </FieldSelect>
              )
            case 'upload':
              return (
                <FileUpload
                  value={text}
                  onValueChange={controller.onChange}
                  accept={field.accept}
                  maxSizeMb={field.maxSizeMb}
                  disabled={disabled}
                  aria-label={t(field.label)}
                />
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
                      {field.translateOptions === false ? option.label : t(option.label)}
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
            <FormControl>{controlElement}</FormControl>
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
  submitDisabled = false,
  feedback,
  asyncValidators,
  onOpenChange,
  onSubmit,
}: DynaFormProps) {
  const t = useDynaText()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const resetContext = useRef<{
    open: boolean
    mode: 'create' | 'edit'
    row: DynaFormProps['initialRow']
  } | null>(null)
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

  const watchedValues = useWatch({ control: form.control }) as DynaFormValues
  const activeFields = useMemo(
    () => fields.filter((field) => isFieldVisible(field, watchedValues ?? {})),
    [fields, watchedValues],
  )
  const isDirty = form.formState.isDirty
  const showDiscardConfirm = confirmDiscard && open && isDirty

  // 对话框每次打开时按模式重置（新增 → 默认值；编辑 → 行数据回填）
  useEffect(() => {
    const previous = resetContext.current
    resetContext.current = { open, mode, row: initialRow }
    if (!open) return
    // Loading new choices or changing their labels must not erase an in-progress form.
    if (previous?.open && previous.mode === mode && previous.row === initialRow) return
    form.reset(
      mode === 'edit' && initialRow
        ? rowToFormValues(fields, initialRow)
        : defaultFormValues(fields),
    )
  }, [open, mode, initialRow, fields, form])

  const requestClose = useCallback(() => {
    if (submitting) return
    if (form.formState.isDirty) {
      setConfirmDiscard(true)
      return
    }
    setConfirmDiscard(false)
    onOpenChange(false)
  }, [form.formState.isDirty, onOpenChange, submitting])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true)
        return
      }
      requestClose()
    },
    [onOpenChange, requestClose],
  )

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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent ref={dialogRef} onOpenAutoFocus={handleOpenAutoFocus}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? t(config.editTitle ?? '编辑') : t(config.createTitle ?? '新增')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? t('修改后点击保存生效') : t('填写以下信息完成创建')}
          </DialogDescription>
        </DialogHeader>
        {feedback}
        {showDiscardConfirm && (
          <div
            role="alert"
            data-slot="dirty-form-guard"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-sm"
          >
            <span className="font-medium text-foreground">{t('dirtyFormHint')}</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDiscard(false)}
              >
                {t('dirtyFormContinue')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => {
                  setConfirmDiscard(false)
                  form.reset()
                  onOpenChange(false)
                }}
              >
                {t('dirtyFormDiscard')}
              </Button>
            </div>
          </div>
        )}
        <Form {...form}>
          <form
            onSubmit={(event) =>
              submitForm(
                form.handleSubmit(async (values) => {
                  if (submitDisabled || submitting) return
                  if (asyncValidators) {
                    for (const field of activeFields) {
                      if (mode === 'edit' && field.disabledInEdit) continue
                      const asyncValidator = asyncValidators[field.name]
                      if (!asyncValidator) continue
                      const raw = values[field.name]
                      const text = typeof raw === 'string' ? raw : ''
                      const errorMessage = await asyncValidator(text, values, mode)
                      if (errorMessage) {
                        form.setError(field.name, { type: 'validate', message: errorMessage })
                        return
                      }
                    }
                  }
                  setConfirmDiscard(false)
                  onSubmit(formValuesToBody(fields, values, mode))
                })(event),
                t('保存失败'),
              )
            }
            className="grid grid-cols-2 gap-6"
          >
            <div className="col-span-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {activeFields.map((field) => (
                <div key={field.name} className={field.span === 1 ? '' : 'sm:col-span-2'}>
                  <FieldControl
                    field={field}
                    control={form.control}
                    disabled={mode === 'edit' && !!field.disabledInEdit}
                    asyncValidator={asyncValidators?.[field.name]}
                    getValues={form.getValues}
                    setError={form.setError}
                    clearErrors={form.clearErrors}
                  />
                </div>
              ))}
            </div>
            <div className="col-span-2 border-t border-border pt-4">
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={requestClose}>
                  {t('取消')}
                </Button>
                <Button type="submit" disabled={submitting || submitDisabled}>
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
