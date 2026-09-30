'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border-subtle)',
          '--border-radius': 'var(--radius-panel)',
          '--success-bg': 'var(--success)',
          '--success-text': 'var(--success-foreground)',
          '--success-border': 'var(--success)',
          '--warning-bg': 'var(--warning)',
          '--warning-text': 'var(--warning-foreground)',
          '--warning-border': 'var(--warning)',
          '--info-bg': 'var(--info)',
          '--info-text': 'var(--info-foreground)',
          '--info-border': 'var(--info)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
