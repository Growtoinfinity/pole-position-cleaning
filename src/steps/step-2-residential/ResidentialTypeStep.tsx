import SelectableCard from '@/components/SelectableCard'
import { useState, useEffect } from 'react'

import {
  BungalowIcon,
  DetachedIcon,
  FlatIcon,
  LargeUnusualIcon,
  SemiDetachedIcon,
  TerracedIcon,
  TownhouseIcon,
} from '@/components/icons/PropertyIcons'

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
  initialValue,
}: {
  onSelect: (value: ResidentialType) => void
  initialValue?: ResidentialType | null
}) {
  const [selected, setSelected] = useState<ResidentialType | null>(initialValue ?? null)

  // Update selected state when initialValue changes (e.g., from URL restoration)
  useEffect(() => {
    if (initialValue !== undefined) {
      setSelected(initialValue)
    }
  }, [initialValue])

  return (
    <div className="gm-step-column">
      {/* "property", not "house": flats are quotable now, and one of these cards is one. */}
      <h2
        id="residential-type-heading"
        className="text-xl md:text-2xl font-semibold text-brand-800"
      >
        What type of property do you live in?*
      </h2>
      <p className="mt-2 text-left text-sm text-ink-muted">
        If you live in a home that isn't an average size, please select 'Large or Unusual'
      </p>

      {/*
        Seven cards divide by neither 2 nor 3, so the middle 3-column step is
        skipped: 2 columns gives 2,2,2,1 and 4 columns gives a clean 4,3. Every
        card is now a quotable property, so the lone card on the last narrow row
        is simply "Large or Unusual" — the one option that is an enquiry rather
        than an instant quote, and the natural one to sit apart.

        role="radiogroup" ties the seven radios together as one set; without it
        a screen reader announces them as unrelated buttons.
      */}
      <div
        role="radiogroup"
        aria-labelledby="residential-type-heading"
        className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        <SelectableCard
          label="Terraced"
          icon={<TerracedIcon />}
          selected={selected === 'terraced'}
          onClick={() => {
            setSelected('terraced');
            onSelect('terraced')
          }}
        />
        <SelectableCard
          label="Semi-Detached"
          icon={<SemiDetachedIcon />}
          selected={selected === 'semi_detached'}
          onClick={() => {
            setSelected('semi_detached');
            onSelect('semi_detached')
          }}
        />
        <SelectableCard
          label="Detached"
          icon={<DetachedIcon />}
          selected={selected === 'detached'}
          onClick={() => {
            setSelected('detached');
            onSelect('detached')
          }}
        />
        <SelectableCard
          label="Townhouse"
          icon={<TownhouseIcon />}
          selected={selected === 'townhouse'}
          onClick={() => {
            setSelected('townhouse');
            onSelect('townhouse')
          }}
        />
        <SelectableCard
          label="Bungalow"
          icon={<BungalowIcon />}
          selected={selected === 'bungalow'}
          onClick={() => {
            setSelected('bungalow');
            onSelect('bungalow')
          }}
        />
        <SelectableCard
          label="Flat / Maisonette"
          icon={<FlatIcon />}
          selected={selected === 'flat'}
          onClick={() => {
            setSelected('flat');
            onSelect('flat')
          }}
        />
        <SelectableCard
          label="Large or Unusual"
          icon={<LargeUnusualIcon />}
          selected={selected === 'large_unusual'}
          onClick={() => {
            setSelected('large_unusual');
            onSelect('large_unusual')
          }}
        />
      </div>
    </div>
  )
}
