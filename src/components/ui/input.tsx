import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Paints the red border when the field has a validation message under it */
  invalid?: boolean
}

/**
 * Shared between Input, Select and any other bordered control, so they line up.
 *
 * The fill is white, the same as the page — which means the BORDER is the only
 * thing saying "type here". That is why it is `input` (line-strong, 3.30:1) and
 * not the 1.36:1 divider line: a field bordered at 1.4:1 reads as blank space
 * until you hover it. WCAG 1.4.11 asks 3:1 of a control's boundary and this is
 * the control where it bites hardest.
 *
 * Disabled goes the other way — grey fill, soft border — so "off" reads as
 * recessed rather than as merely faint.
 */
export const fieldClasses =
  'h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-ink ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'placeholder:text-ink-muted ' +
  'hover:border-brand-600 ' +
  // A full-strength, offset ring — the same indicator every other control in the
  // app uses. The faded ring this replaced composited to 1.66:1 on white, and
  // the border alone only moves line-strong -> brand-600, a 1.50:1 change: a
  // keyboard user tabbing the contact and booking forms had no reliable idea
  // where they were.
  'focus-visible:border-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-ink-muted'

export const invalidFieldClasses =
  'border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger'

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
