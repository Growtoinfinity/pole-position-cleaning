import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Paints the red border when the field has a validation message under it */
  invalid?: boolean
}

/** Shared between Input, Select and any other bordered control, so they line up. */
export const fieldClasses =
  'h-11 w-full rounded-lg border border-input bg-white px-3.5 text-sm text-ink ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'placeholder:text-ink-muted ' +
  'hover:border-line-strong ' +
  'focus-visible:border-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/25 ' +
  'disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-subtle'

export const invalidFieldClasses =
  'border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/20'

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldClasses, invalid && invalidFieldClasses, className)}
      {...props}
    />
  )
})

export default Input
