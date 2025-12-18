import Label from '@/components/ui/label'
import Chip from '@/components/ui/chip'
import type { InputHTMLAttributes } from 'react'

export default function BedroomsField({
  value,
  onSelect,
  inputId,
  inputProps,
}: {
  value: number | undefined
  onSelect: (value: number) => void
  inputId: string
  inputProps: InputHTMLAttributes<HTMLInputElement>
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-base md:text-lg">Number of Bedrooms</Label>
      <div className="flex flex-wrap gap-4">
        {[1, 2, 3, 4, 5].map((bedroomCount) => (
          <Chip
            key={bedroomCount}
            label={bedroomCount === 5 ? '5+' : String(bedroomCount)}
            selected={value === bedroomCount}
            onClick={() => onSelect(bedroomCount)}
            withRing
          />
        ))}
        <input id={inputId} type="hidden" {...inputProps} />
      </div>
    </div>
  )
}


