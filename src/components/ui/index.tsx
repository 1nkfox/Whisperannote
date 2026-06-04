// FILE: src/components/ui/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Provide reusable React UI primitives for the renderer using the Figma-derived heritage palette.
//   SCOPE: Button, Card, Input, Select, Switch, Tabs, Dialog, Progress, Table, Toast, Tooltip, Badge,
//          ScrollArea, Separator, Label, and the cn class helper.
//   DEPENDS: React
//   LINKS: M-UI, V-M-UI
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   cn - className join helper used by UI primitives.
//   Button/Card/Input/Select/Switch - heritage-themed form and action primitives.
//   Tabs/Dialog/Progress/Table - state and data display primitives.
//   Toast/Tooltip/Badge/ScrollArea/Separator/Label - supporting UI primitives.
// END_MODULE_MAP
import React from 'react'

type ClassValue = string | false | null | undefined

// START_CONTRACT: cn
//   PURPOSE: Join optional class names without pulling a runtime dependency into the UI foundation.
//   INPUTS: { values: ClassValue[] - class names or falsey values }
//   OUTPUTS: string - space-separated class list
//   SIDE_EFFECTS: none
//   LINKS: M-UI
// END_CONTRACT: cn
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'border border-transparent bg-[#B8422E] text-white hover:bg-[#9E3827] dark:bg-[#B8422E] dark:hover:bg-[#9E3827]',
  secondary: 'border border-[rgba(108,114,120,0.35)] bg-transparent text-[#1A1C1E] hover:border-[#1A1C1E] dark:border-zinc-700 dark:text-zinc-50 dark:hover:border-zinc-300',
  ghost: 'border border-transparent bg-transparent text-[#1A1C1E] hover:text-[#B8422E] dark:text-zinc-50 dark:hover:text-[#D95B45]',
  destructive: 'border border-transparent bg-[#B8422E] text-white hover:bg-[#9E3827]'
}

const buttonSizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base'
}

// START_CONTRACT: Button
//   PURPOSE: Render an accessible action button with project-standard variants and sizes.
//   INPUTS: { props: ButtonProps - native button props plus variant and size }
//   OUTPUTS: JSX.Element - button element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Button
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-[4px] font-medium tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8422E]/40 disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    />
  )
})

// START_CONTRACT: Card
//   PURPOSE: Render a bordered content container with light/dark theme classes.
//   INPUTS: { props: HTMLAttributes<HTMLDivElement> - card container props }
//   OUTPUTS: JSX.Element - card element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Card
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
        className={cn('rounded-lg border border-[rgba(108,114,120,0.2)] bg-white text-[#1A1C1E] shadow-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50', className)}
      {...props}
    />
  )
})

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  }
)

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn('text-xl font-medium leading-tight tracking-[-0.02em] text-[#1A1C1E] dark:text-zinc-50', className)} {...props} />
  }
)

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  }
)

// START_CONTRACT: Input
//   PURPOSE: Render a styled native input compatible with form libraries and accessibility tooling.
//   INPUTS: { props: InputHTMLAttributes<HTMLInputElement> - native input props }
//   OUTPUTS: JSX.Element - input element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Input
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-11 w-full rounded-[4px] border border-[rgba(108,114,120,0.26)] bg-white px-3 py-2 text-sm text-[#1A1C1E] placeholder:text-[#6C7278] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8422E]/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50',
          className
        )}
        {...props}
      />
    )
  }
)

// START_CONTRACT: Label
//   PURPOSE: Render a form label with consistent typography.
//   INPUTS: { props: LabelHTMLAttributes<HTMLLabelElement> - native label props }
//   OUTPUTS: JSX.Element - label element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Label
export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return <label ref={ref} className={cn('text-xs font-medium uppercase leading-none tracking-[0.08em] text-[#6C7278] dark:text-zinc-400', className)} {...props} />
  }
)

// START_CONTRACT: Select
//   PURPOSE: Render a styled native select for deterministic keyboard and test behavior.
//   INPUTS: { props: SelectHTMLAttributes<HTMLSelectElement> - native select props }
//   OUTPUTS: JSX.Element - select element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Select
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
          className={cn('h-8 rounded-[4px] border border-[rgba(108,114,120,0.26)] bg-white px-2 py-1 text-xs text-[#1A1C1E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8422E]/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50', className)}
        {...props}
      />
    )
  }
)

export type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'role'> & {
  checked?: boolean
}

// START_CONTRACT: Switch
//   PURPOSE: Render an accessible switch control with aria-checked semantics.
//   INPUTS: { props: SwitchProps - checked state and native button props }
//   OUTPUTS: JSX.Element - role=switch button
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Switch
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, checked = false, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      role="switch"
      aria-checked={checked}
        className={cn('inline-flex h-6 w-11 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8422E]/40', checked ? 'bg-[#B8422E] dark:bg-[#D95B45]' : 'bg-[#6C7278]/35 dark:bg-zinc-700', className)}
      {...props}
    >
       <span className={cn('h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-zinc-950', checked ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
})

export type TabsProps = React.HTMLAttributes<HTMLDivElement> & {
  value: string
}

// START_CONTRACT: Tabs
//   PURPOSE: Render a simple tabs container that advertises the selected value to child primitives.
//   INPUTS: { props: TabsProps - selected tab value and container props }
//   OUTPUTS: JSX.Element - data-selected tabs container
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Tabs
export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { className, value, ...props },
  ref
) {
  return <div ref={ref} data-selected-tab={value} className={cn('w-full', className)} {...props} />
})

export const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function TabsList({ className, ...props }, ref) {
    return <div ref={ref} role="tablist" className={cn('inline-flex h-10 items-center rounded-md bg-zinc-100 p-1 dark:bg-zinc-800', className)} {...props} />
  }
)

export type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string
  selected?: boolean
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { className, value, selected = false, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      role="tab"
      aria-selected={selected}
      data-value={value}
      className={cn('rounded-sm px-3 py-1.5 text-sm font-medium transition-colors', selected ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-300', className)}
      {...props}
    />
  )
})

export type DialogProps = React.HTMLAttributes<HTMLDivElement> & {
  open?: boolean
  title?: string
}

// START_CONTRACT: Dialog
//   PURPOSE: Render dialog content only when open, preserving accessible role and label semantics.
//   INPUTS: { props: DialogProps - open state, optional title, and content props }
//   OUTPUTS: JSX.Element | null - dialog content when open
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Dialog
export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  { className, open = false, title, children, ...props },
  ref
) {
  if (!open) {
    return null
  }

  return (
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cn('fixed inset-0 z-50 grid place-items-center bg-black/40 p-4', className)} {...props}>
      <div className="w-full max-w-lg rounded-sm border border-[rgba(108,114,120,0.2)] bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        {title ? <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2> : null}
        {children}
      </div>
    </div>
  )
})

export type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: number
  max?: number
}

// START_CONTRACT: Progress
//   PURPOSE: Render an accessible progress indicator with clamped numeric value.
//   INPUTS: { props: ProgressProps - value and max values }
//   OUTPUTS: JSX.Element - role=progressbar element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Progress
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { className, value = 0, max = 100, ...props },
  ref
) {
  const safeMax = max > 0 ? max : 100
  const clamped = Math.min(Math.max(value, 0), safeMax)
  const width = `${(clamped / safeMax) * 100}%`

  return (
    <div ref={ref} role="progressbar" aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={clamped} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[#EEECE9] dark:bg-zinc-800', className)} {...props}>
      <div className="h-full bg-[#B8422E] transition-all dark:bg-[#D95B45]" style={{ width }} />
    </div>
  )
})

// START_CONTRACT: Table
//   PURPOSE: Render a styled table wrapper while preserving native table semantics.
//   INPUTS: { props: TableHTMLAttributes<HTMLTableElement> - native table props }
//   OUTPUTS: JSX.Element - table element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Table
export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  function Table({ className, ...props }, ref) {
    return <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  }
)

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  }
)

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  }
)

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, ...props }, ref) {
    return <tr ref={ref} className={cn('border-b border-zinc-200 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900', className)} {...props} />
  }
)

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, ...props }, ref) {
    return <th ref={ref} className={cn('h-10 px-2 text-left align-middle font-medium text-zinc-500 dark:text-zinc-400', className)} {...props} />
  }
)

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, ...props }, ref) {
    return <td ref={ref} className={cn('p-2 align-middle', className)} {...props} />
  }
)

export type ToastProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string
  description?: string
}

// START_CONTRACT: Toast
//   PURPOSE: Render a non-invasive status message suitable for later toast manager integration.
//   INPUTS: { props: ToastProps - title, description, and container props }
//   OUTPUTS: JSX.Element - role=status toast element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Toast
export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { className, title, description, children, ...props },
  ref
) {
  return (
    <div ref={ref} role="status" className={cn('rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-950', className)} {...props}>
      {title ? <div className="font-medium text-zinc-950 dark:text-zinc-50">{title}</div> : null}
      {description ? <div className="mt-1 text-zinc-600 dark:text-zinc-300">{description}</div> : null}
      {children}
    </div>
  )
})

export type TooltipProps = React.HTMLAttributes<HTMLSpanElement> & {
  content: string
}

// START_CONTRACT: Tooltip
//   PURPOSE: Provide an accessible title-backed tooltip wrapper without portal dependencies.
//   INPUTS: { props: TooltipProps - tooltip text and wrapper props }
//   OUTPUTS: JSX.Element - span with title attribute
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Tooltip
export const Tooltip = React.forwardRef<HTMLSpanElement, TooltipProps>(function Tooltip(
  { className, content, ...props },
  ref
) {
  return <span ref={ref} title={content} className={cn('inline-flex', className)} {...props} />
})

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'outline' | 'success' | 'warning'
}

const badgeVariants: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-[#1A1C1E] text-white dark:bg-zinc-50 dark:text-zinc-950',
  outline: 'border border-[rgba(108,114,120,0.25)] bg-white/60 text-[#1A1C1E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50',
  success: 'bg-emerald-700 text-white dark:bg-emerald-600',
  warning: 'bg-amber-500 text-[#1A1C1E]'
}

// START_CONTRACT: Badge
//   PURPOSE: Render compact status metadata with semantic text content.
//   INPUTS: { props: BadgeProps - status variant and span props }
//   OUTPUTS: JSX.Element - badge span
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Badge
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'default', ...props },
  ref
) {
  return <span ref={ref} className={cn('inline-flex items-center rounded-[2px] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em]', badgeVariants[variant], className)} {...props} />
})

// START_CONTRACT: ScrollArea
//   PURPOSE: Render a constrained overflow container for long transcript and table surfaces.
//   INPUTS: { props: HTMLAttributes<HTMLDivElement> - scroll container props }
//   OUTPUTS: JSX.Element - overflow container
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: ScrollArea
export const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function ScrollArea({ className, ...props }, ref) {
    return <div ref={ref} className={cn('overflow-auto', className)} {...props} />
  }
)

export type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical'
}

// START_CONTRACT: Separator
//   PURPOSE: Render an accessible visual separator for layout grouping.
//   INPUTS: { props: SeparatorProps - orientation and container props }
//   OUTPUTS: JSX.Element - role=separator element
//   SIDE_EFFECTS: none
//   LINKS: M-UI, V-M-UI
// END_CONTRACT: Separator
export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, orientation = 'horizontal', ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', 'bg-[rgba(108,114,120,0.2)] dark:bg-zinc-800', className)}
      {...props}
    />
  )
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - Made native Select thinner and smaller for compact Heritage settings controls.
//   LAST_CHANGE: v1.2.0 - Tuned primitives to Heritage tokens: flat cards, 8px radius, outline secondary controls, and single-accent actions.
//   LAST_CHANGE: v1.1.0 - Applied the Figma heritage palette, sharper cards, brick accent controls, and themed progress primitives.
// END_CHANGE_SUMMARY
