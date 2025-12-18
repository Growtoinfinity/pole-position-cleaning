import { memo } from 'react'
import { cn } from '@/lib/utils'

export type ChipProps = {
  label: string
  selected: boolean
  onClick: () => void
  withRing?: boolean
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm md:px-6 md:py-3 md:text-base',
  lg: 'px-5 py-2.5 text-base md:px-7 md:py-4 md:text-lg'
}

const Chip = memo(function Chip({
  label,
  selected,
  onClick,
  withRing = false,
  className,
  disabled = false,
  size = 'md'
}: ChipProps) {
  const selectedClasses = selected
    ? `border-[#BF8639] bg-[#BF8639] text-[#013252]${withRing ? ' ring-2 ring-[#BF8639]' : ''}`
    : 'border-white/20 bg-[#013252] text-white hover:border-white/50'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-full border transition-colors',
        sizeClasses[size],
        selectedClasses,
        disabled && 'opacity-50 cursor-not-allowed hover:border-white/20',
        className
      )}
    >
      {label}
    </button>
  )
})

export default Chip