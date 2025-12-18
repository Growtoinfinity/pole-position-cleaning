import SelectableCard from '@/components/SelectableCard'
import semiImg from '@/assets/semi-detached.png'
import terracedImg from '@/assets/terraced.png'
import detachedImg from '@/assets/detached.png'

export type BungalowKind = 'semi_detached' | 'terraced' | 'detached'

export default function BungalowTypeStep({ onSelect }: { onSelect: (v: BungalowKind) => void }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-16">
      <h2 className="text-left text-2xl font-semibold text-[#BF8639]">What type of bungalow do you live in?</h2>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SelectableCard label="Terraced" imageSrc={terracedImg} onClick={() => onSelect('terraced')} />
        <SelectableCard label="Semi-Detached" imageSrc={semiImg} onClick={() => onSelect('semi_detached')} />
        <SelectableCard label="Detached" imageSrc={detachedImg} onClick={() => onSelect('detached')} />
      </div>
      {/* Back button removed per requirements */}
    </div>
  )
}


