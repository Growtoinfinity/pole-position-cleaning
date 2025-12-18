import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'brand' | 'ghost'
  size?: 'md' | 'lg' | 'sm'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'brand', size = 'lg', ...props },
  ref,
) {
  const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
  const sizeCls =
    size === 'lg'
      ? 'h-12 px-8 text-base'
      : size === 'md'
        ? 'h-10 px-6 text-sm'
        : 'h-8 px-4 text-sm'
  const variantCls =
    variant === 'brand'
      ? '!bg-[#BF8639] text-white hover:!bg-[#d59b54] shadow'
      : 'bg-transparent text-white/90 hover:text-white'

  return (
    <button ref={ref} className={cn(base, sizeCls, variantCls, className)} {...props} />
  )
})

export default Button


