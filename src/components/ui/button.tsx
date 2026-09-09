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
 * Disabled never dims with opacity. Fading ink on a dark fill collapses toward
 * the background, and the primary button starts life disabled on both the quote
 * and booking steps — so it swaps fill and text colour instead and every word
 * stays readable. (ink-muted on surface is 8.6:1.)
 */
const disabledClasses =
  'disabled:border disabled:border-line disabled:bg-surface ' +
  'disabled:text-ink-muted disabled:shadow-none'

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  // text-on-brand, never text-white: white on the brand teal is 3.4:1 and fails
  // body text. The deep green reads at 5.5:1 on brand-500 and 8.3:1 on brand-400.
  // Hover goes *lighter* here — on a dark page that is what "more prominent" is.
  brand:
    'bg-brand-500 text-on-brand shadow-brand hover:bg-brand-400 active:bg-brand-300 ' +
    disabledClasses,
  outline:
    'border border-line-strong bg-transparent text-brand-300 hover:border-brand-400 ' +
    'hover:bg-brand-900 hover:text-brand-200 active:bg-brand-800 ' +
    disabledClasses,
  // hover:bg-card, not bg-surface: the only ghost button lives on a bg-surface bar
  ghost: 'bg-transparent text-ink-muted hover:bg-card hover:shadow-card hover:text-ink disabled:text-ink-subtle',
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
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
