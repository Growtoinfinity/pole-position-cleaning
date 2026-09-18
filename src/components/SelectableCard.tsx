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
        // pp-selectable carries the border, radius, hover, selected and focus
        // states shared by every "pick this option" surface in the form
        'pp-selectable group flex h-full w-full flex-col items-center justify-between p-4 text-center',
        !disabled && 'hover:-translate-y-0.5 hover:shadow-card',
        selected && 'shadow-card',
        className,
      )}
    >
      {/* Tick badge — makes the chosen card obvious without relying on colour alone.
          The blue ring is required, not decorative: a yellow disc on a white or
          pale-blue card has a 1.07:1 edge and would read as a smudge. */}
      <span
        className={cn(
          'absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full',
          'transition-[opacity,transform] duration-150',
          selected ? 'scale-100 bg-primary-400 opacity-100 ring-2 ring-brand-700' : 'scale-75 opacity-0',
        )}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5 text-on-brand" strokeWidth={3} />
      </span>

      {icon ? (
        <span
          className={cn(
            // brand-600 (4.96:1 on white), not the brand blue itself (3.35:1):
            // these icons carry the meaning of the option, so they owe the 3:1
            // WCAG 1.4.11 asks of a graphic — with headroom, since they are thin
            // 2px strokes. The yellow is not an option here at 1.07:1.
            'flex flex-1 items-center justify-center transition-colors',
            disabled ? 'text-ink-muted' : 'text-brand-600 group-hover:text-brand-700',
          )}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}

      <span
        className={cn(
          'mt-3 text-sm font-semibold transition-colors md:text-base',
          // Selected darkens the label to full black as well as changing the
          // border and fill — a third signal that survives a desaturated screen.
          selected ? 'text-ink-strong' : 'text-ink group-hover:text-ink-strong',
        )}
      >
        {label}
      </span>
    </button>
  )
})

export default SelectableCard
