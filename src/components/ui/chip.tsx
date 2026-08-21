import { memo } from 'react'
import { cn } from '@/lib/utils'

export type ChipProps = {
  label: string
  selected: boolean
  onClick: () => void
  /** Adds a soft halo around the selected chip — used where chips are the only answer control */
  withRing?: boolean
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  /**
   * Single-choice groups should pass 'radio' so assistive tech announces the
   * options as one set rather than as unrelated toggle buttons.
   */
  role?: 'radio' | 'button'
}

const sizeClasses = {
  sm: 'min-w-[2.25rem] px-3 py-1.5 text-xs',
  // py-2.5 + border-2 lands at 44px, the minimum comfortable tap target
  md: 'min-w-[2.75rem] px-4 py-2.5 text-sm md:px-5 md:py-3 md:text-base',
  lg: 'min-w-[3.25rem] px-5 py-2.5 text-base md:px-7 md:py-3.5 md:text-lg',
}

const Chip = memo(function Chip({
  label,
  selected,
  onClick,
  withRing = false,
  className,
  disabled = false,
  size = 'md',
  role = 'radio',
}: ChipProps) {
  const isRadio = role === 'radio'

  return (
    <button
      type="button"
      onClick={onClick}
      role={isRadio ? 'radio' : undefined}
      aria-checked={isRadio ? selected : undefined}
      aria-pressed={isRadio ? undefined : selected}
      disabled={disabled}
      className={cn(
        'gm-selectable inline-flex items-center justify-center rounded-full font-medium',
        sizeClasses[size],
        // A pill this small reads its selected state far better as a solid fill
        // than as a tint, so it deliberately overrides the shared card treatment.
        selected
          ? cn(
              '!border-brand-700 !bg-brand-700 text-white shadow-brand',
              withRing && 'ring-4 ring-brand-600/15',
            )
          : 'text-ink hover:text-brand-800',
        // Disabled without opacity — see the note beside .gm-selectable
        disabled && 'text-ink-muted',
        className,
      )}
    >
      {label}
    </button>
  )
})

export default Chip
