import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * brand   — the one primary action on a screen (solid brand yellow)
   * outline — a secondary action sitting next to a brand button
   * ghost   — low-emphasis, no chrome until hovered
   */
  variant?: 'brand' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-6 text-sm gap-2',
  lg: 'h-12 px-8 text-base gap-2',
}

/**
 * Disabled never dims with opacity. Opacity compounds with an already-muted
 * ink, and the primary button starts life disabled on both the quote and
 * booking steps — so it swaps fill, border and text colour instead and every
 * word stays readable. (ink-muted on surface is 4.87:1.)
 */
const disabledClasses =
  'disabled:border-2 disabled:border-line-strong disabled:bg-surface ' +
  'disabled:text-ink-muted disabled:shadow-none'

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  /*
   * The brand yellow is 1.07:1 against the white page — the fill is loud but
   * its EDGE is invisible, so this button would float with no boundary at all.
   * The blue border is not decoration: it is the 3:1 WCAG 1.4.11 asks of a
   * control's boundary (brand-700 is 7.18 on white, 6.72 on the yellow).
   *
   * Black ink, never white: #000 on the yellow is 19.66:1, white is 1.07:1.
   */
  brand:
    'border-2 border-brand-700 bg-primary-400 text-on-brand shadow-brand ' +
    'hover:bg-primary-500 hover:border-brand-800 active:bg-primary-600 ' +
    disabledClasses,
  outline:
    'border-2 border-line-strong bg-card text-ink-strong ' +
    'hover:border-brand-600 hover:bg-brand-50 active:bg-brand-100 ' +
    disabledClasses,
  // disabled ink is ink-muted via disabledClasses, never ink-subtle: a disabled
  // label is what tells you WHICH action is unavailable, and ink-subtle is
  // 3.10:1 — the token contract marks it decorative only.
  ghost:
    'border-2 border-transparent bg-transparent text-ink ' +
    'hover:bg-surface hover:text-ink-strong ' +
    disabledClasses,
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'brand', size = 'lg', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-lg font-semibold',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2',
        'disabled:pointer-events-none',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
})

export default Button
