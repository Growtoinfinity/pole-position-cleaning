import SelectableCard from '@/components/SelectableCard'
import { useState, useEffect } from 'react'
import semiImg from '@/assets/semi-detached.png'
import terracedImg from '@/assets/terraced.png'
import detachedImg from '@/assets/detached.png'

export type TownhouseKind = 'semi_detached' | 'terraced' | 'detached'

export default function TownhouseTypeStep({ 
  onSelect,
  initialValue 
}: { 
  onSelect: (v: TownhouseKind) => void
  initialValue?: TownhouseKind | null
}) {
  const [selected, setSelected] = useState<TownhouseKind | null>(initialValue ?? null)
  
  // Update selected state when initialValue changes (e.g., from URL restoration)
  useEffect(() => {
    if (initialValue !== undefined) {
      setSelected(initialValue)
    }
  }, [initialValue])
  
  return (
    <div className="mx-auto w-full max-w-7xl px-16">
      <h2 className="text-left text-2xl font-semibold text-[#BF8639]">What type of townhouse do you live in?</h2>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SelectableCard 
          label="Terraced" 
          imageSrc={terracedImg} 
          selected={selected === 'terraced'}
          onClick={() => {
            setSelected('terraced')
            onSelect('terraced')
          }} 
        />
        <SelectableCard 
          label="Semi-Detached" 
          imageSrc={semiImg} 
          selected={selected === 'semi_detached'}
          onClick={() => {
            setSelected('semi_detached')
            onSelect('semi_detached')
          }} 
        />
        <SelectableCard 
          label="Detached" 
          imageSrc={detachedImg} 
          selected={selected === 'detached'}
          onClick={() => {
            setSelected('detached')
            onSelect('detached')
          }} 
        />
      </div>
    </div>
  )
}
