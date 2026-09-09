import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Paints the red border when the field has a validation message under it */
  invalid?: boolean
}

/**
 * Shared between Input, Select and any other bordered control, so they line up.
 *
 * The fill is `surface` — a shade *below* the card it sits on. On a dark theme
 * a field reads as somewhere to type by being recessed, the mirror of the way a
 * white field sat proud of a grey page in the light theme.
 */
export const fieldClasses =
  'h-11 w-full rounded-lg border border-input bg-surface px-3.5 text-sm text-ink ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'placeholder:text-ink-muted ' +
  'hover:border-brand-400 ' +
  'focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/35 ' +
  'disabled:cursor-not-allowed disabled:border-line disabled:bg-card disabled:text-ink-muted'

export const invalidFieldClasses =
  'border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/30'

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
