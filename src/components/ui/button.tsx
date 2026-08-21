import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * brand   — the one primary action on a screen (solid green)
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
 * Disabled never dims with opacity. Fading white-on-green lands near 2:1, and
 * the primary button starts life disabled on both the quote and booking steps —
 * so it swaps fill and text colour instead and every word stays readable.
 * (ink-muted on surface is 5.8:1.)
 */
const disabledClasses =
  'disabled:border disabled:border-line-strong disabled:bg-surface ' +
  'disabled:text-ink-muted disabled:shadow-none'

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  brand:
    'bg-brand-700 text-white shadow-brand hover:bg-brand-800 active:bg-brand-900 ' +
    disabledClasses,
  outline:
    'border border-line-strong bg-white text-brand-800 hover:border-brand-600 ' +
    'hover:bg-brand-50 active:bg-brand-100 ' +
    disabledClasses,
  // hover:bg-white, not bg-surface: the only ghost button lives on a bg-surface bar
  ghost: 'bg-transparent text-ink-muted hover:bg-white hover:shadow-card hover:text-brand-800 disabled:text-ink-subtle',
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
