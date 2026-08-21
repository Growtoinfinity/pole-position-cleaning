import SelectableCard from '@/components/SelectableCard'
import { useState, useEffect } from 'react'
import { DetachedIcon, SemiDetachedIcon, TerracedIcon } from '@/components/icons/PropertyIcons'

export type BungalowKind = 'semi_detached' | 'terraced' | 'detached'

export default function BungalowTypeStep({
  onSelect,
  initialValue
}: {
  onSelect: (v: BungalowKind) => void
  initialValue?: BungalowKind | null
}) {
  const [selected, setSelected] = useState<BungalowKind | null>(initialValue ?? null)

  // Update selected state when initialValue changes (e.g., from URL restoration)
  useEffect(() => {
    if (initialValue !== undefined) {
      setSelected(initialValue)
    }
  }, [initialValue])

  return (
    <div className="gm-step-column">
      <h2
        id="bungalow-type-heading"
        className="text-xl md:text-2xl font-semibold text-brand-800"
      >
        What type of bungalow do you live in?
      </h2>
      <p className="mt-2 text-left text-sm text-ink-muted">
        Terraced bungalows join a neighbour on both sides, semi-detached on one side, detached on
        neither
      </p>

      {/*
        This step follows straight on from ResidentialTypeStep, so it copies that
        screen's rhythm exactly: mt-8 under the heading block and a 2-column grid
        that only widens at md. Dropping to grid-cols-1 here made a 360px customer
        jump from a 2-up grid of compact cards to a stack of full-width cards with
        a marooned icon, and the heading gap shrank at the same moment. The count
        differs (3 here, 7 there) so the wide step is 3 rather than 4 — one clean
        row instead of a 4+3 split.

        role="radiogroup" so the three cards are announced as one set of options
        rather than three unrelated buttons.
      */}
      <div
        role="radiogroup"
        aria-labelledby="bungalow-type-heading"
        className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3"
      >
        <SelectableCard
          label="Terraced"
          icon={<TerracedIcon />}
          selected={selected === 'terraced'}
          onClick={() => {
            setSelected('terraced')
            onSelect('terraced')
          }}
        />
        <SelectableCard
          label="Semi-Detached"
          icon={<SemiDetachedIcon />}
          selected={selected === 'semi_detached'}
          onClick={() => {
            setSelected('semi_detached')
            onSelect('semi_detached')
          }}
        />
        <SelectableCard
          label="Detached"
          icon={<DetachedIcon />}
          selected={selected === 'detached'}
          onClick={() => {
            setSelected('detached')
            onSelect('detached')
          }}
        />
      </div>
      {/* Back button removed per requirements */}
    </div>
  )
}
