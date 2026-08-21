import { memo } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SelectableCardProps = {
  label: string
  /** An inline SVG that inherits the card's text colour */
  icon?: React.ReactNode
  selected?: boolean
  onClick?: () => void
  className?: string
  disabled?: boolean
  /**
   * Single-choice groups should pass 'radio' so assistive tech announces the
   * options as one set rather than as unrelated toggle buttons.
   */
  role?: 'radio' | 'button'
}

const SelectableCard = memo(function SelectableCard({
  label,
  icon,
  selected = false,
  onClick,
  className,
  disabled = false,
  role = 'radio',
}: SelectableCardProps) {
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
        // gm-selectable carries the border, radius, hover, selected and focus
        // states shared by every "pick this option" surface in the form
        'gm-selectable group flex h-full w-full flex-col items-center justify-between p-4 text-center',
        !disabled && 'hover:-translate-y-0.5 hover:shadow-card',
        selected && 'shadow-card',
        className,
      )}
    >
      {/* Tick badge — makes the chosen card obvious without relying on colour alone */}
      <span
        className={cn(
          'absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full',
          'transition-[opacity,transform] duration-150',
          selected ? 'scale-100 bg-brand-600 opacity-100' : 'scale-75 opacity-0',
        )}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
      </span>

      {icon ? (
        <span
          className={cn(
            // brand-600 not brand-500: these icons carry the meaning of the
            // option, so they need the 3:1 that WCAG 1.4.11 asks of a graphic
            'flex flex-1 items-center justify-center transition-colors',
            disabled ? 'text-ink-subtle' : 'text-brand-600 group-hover:text-brand-700',
          )}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}

      <span
        className={cn(
          'mt-3 text-sm font-semibold transition-colors md:text-base',
          selected ? 'text-brand-800' : 'text-ink group-hover:text-brand-800',
        )}
      >
        {label}
      </span>
    </button>
  )
})

export default SelectableCard
