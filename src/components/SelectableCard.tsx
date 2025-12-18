import { memo } from 'react'
import { cn } from '@/lib/utils'

export type SelectableCardProps = {
  label: string
  imageSrc?: string
  selected?: boolean
  onClick?: () => void
  className?: string
  imageAlt?: string
  disabled?: boolean
}

const SelectableCard = memo(function SelectableCard({
  label,
  imageSrc,
  selected = false,
  onClick,
  className,
  imageAlt = '',
  disabled = false,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        'group relative h-full w-full cursor-pointer rounded-md border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BF8639] md:p-3',
        selected ? '!border-[#BF8639] bg-[#BF8639]/10' : 'border-white/20 bg-[#013252] hover:!border-[#BF8639]',
        disabled && 'opacity-50 cursor-not-allowed hover:border-white/20',
        className,
      )}
    >
      <div className={cn(
        'flex items-center justify-center rounded-sm transition-colors'
      )}>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={imageAlt || label}
            className="h-24 w-24 object-fit"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="mt-4 text-center text-base font-semibold text-[#BF8639] md:text-lg">{label}</div>
    </button>
  )
})

export default SelectableCard