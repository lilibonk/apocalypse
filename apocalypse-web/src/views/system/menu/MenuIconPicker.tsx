/** 菜单图标选择器：选项与 MenuIcon 的受控映射共享同一数据源。 */

import { Check, ChevronsUpDown, CircleOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { MenuIcon } from '@/components/layout/MenuIcon'
import { MENU_ICON_NAMES } from '@/components/layout/menu-icons'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

interface MenuIconPickerProps extends Omit<ComponentProps<'button'>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

export function MenuIconPicker({
  value,
  onChange,
  className,
  disabled,
  ...buttonProps
}: MenuIconPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const selectIcon = (iconName: string) => {
    onChange(iconName)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          'w-full justify-start font-normal',
          !value && 'text-muted-foreground',
          className,
        )}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        {...buttonProps}
      >
        {value ? <MenuIcon name={value} /> : <CircleOff className="size-4" />}
        <span className="min-w-0 flex-1 truncate text-left">
          {value || t('common.选择图标', { defaultValue: '选择图标' })}
        </span>
        <ChevronsUpDown className="ml-auto size-4 opacity-50" />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        depth="nested"
        title={t('common.选择图标', { defaultValue: '选择图标' })}
        description={t('common.搜索并选择菜单图标', { defaultValue: '搜索并选择菜单图标' })}
        className="sm:max-w-xl"
      >
        <CommandInput placeholder={t('common.搜索图标名称…', { defaultValue: '搜索图标名称…' })} />
        <CommandList className="max-h-96">
          <CommandEmpty>
            {t('common.没有匹配的图标', { defaultValue: '没有匹配的图标' })}
          </CommandEmpty>
          <CommandGroup
            heading={t('common.可用图标', { defaultValue: '可用图标' })}
            className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-3 [&_[cmdk-group-items]]:gap-1 sm:[&_[cmdk-group-items]]:grid-cols-4"
          >
            <CommandItem
              value="no-icon"
              onSelect={() => selectIcon('')}
              className="relative min-h-16 flex-col justify-center gap-1"
            >
              <CircleOff className="size-5" />
              <span className="max-w-full truncate text-xs">
                {t('common.无图标', { defaultValue: '无图标' })}
              </span>
              <Check
                className={cn(
                  'absolute top-2 right-2 size-3.5 text-primary',
                  value ? 'opacity-0' : 'opacity-100',
                )}
              />
            </CommandItem>
            {MENU_ICON_NAMES.map((iconName) => (
              <CommandItem
                key={iconName}
                value={iconName}
                onSelect={() => selectIcon(iconName)}
                className="relative min-h-16 flex-col justify-center gap-1"
              >
                <MenuIcon name={iconName} className="size-5" />
                <span className="max-w-full truncate text-xs">{iconName}</span>
                <Check
                  className={cn(
                    'absolute top-2 right-2 size-3.5 text-primary',
                    value === iconName ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
