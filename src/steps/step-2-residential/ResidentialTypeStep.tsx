import SelectableCard from '@/components/SelectableCard'
import { useState } from 'react'

import largeUnusual from '@/assets/large.png'
import flatImg from '@/assets/flat.png'
import bungalowImg from '@/assets/bungalow.png'
import semiImg from '@/assets/semi-detached.png'
import terracedImg from '@/assets/terraced.png'
import detachedImg from '@/assets/detached.png'
import townhouseImg from '@/assets/townhouse.png'

export type ResidentialType =
  | 'large_unusual'
  | 'flat'
  | 'bungalow'
  | 'semi_detached'
  | 'terraced'
  | 'detached'
  | 'townhouse'

export default function ResidentialTypeStep({
  onSelect,
}: {
  onSelect: (value: ResidentialType) => void
}) {
  const [selected, setSelected] = useState<ResidentialType | null>(null)
  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-16">
      <h2 className="text-left text-2xl font-semibold text-[#BF8639]">What type of house do you live in?*</h2>
      <p className="mt-2 text-left text-sm text-white/80">
        If you live in a house that isn't an average size, please select 'Large or Unusual'
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <SelectableCard
          label="Terraced"
          imageSrc={terracedImg}
          selected={selected === 'terraced'}
          onClick={() => {
            setSelected('terraced');
            onSelect('terraced')
          }}
        />
        <SelectableCard
          label="Semi-Detached"
          imageSrc={semiImg}
          selected={selected === 'semi_detached'}
          onClick={() => {
            setSelected('semi_detached');
            onSelect('semi_detached')
          }}
        />
        <SelectableCard
          label="Detached"
          imageSrc={detachedImg}
          selected={selected === 'detached'}
          onClick={() => {
            setSelected('detached');
            onSelect('detached')
          }}
        />
        <SelectableCard
          label="Townhouse"
          imageSrc={townhouseImg}
          selected={selected === 'townhouse'}
          onClick={() => {
            setSelected('townhouse');
            onSelect('townhouse')
          }}
        />
        <SelectableCard
          label="Large or Unusual"
          imageSrc={largeUnusual}
          selected={selected === 'large_unusual'}
          onClick={() => {
            setSelected('large_unusual');
            onSelect('large_unusual')
          }}
        />
        <SelectableCard
          label="Bungalow"
          imageSrc={bungalowImg}
          selected={selected === 'bungalow'}
          onClick={() => {
            setSelected('bungalow');
            onSelect('bungalow')
          }}
        />
        <SelectableCard
          label="Flat / Maisonette"
          imageSrc={flatImg}
          selected={selected === 'flat'}
          onClick={() => {
            setSelected('flat');
            onSelect('flat')
          }}
        />
      </div>
    </div>
  )
}