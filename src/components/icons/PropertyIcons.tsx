import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Property-type icons, drawn as inline SVG.
 *
 * The originals were gold-tinted PNG silhouettes baked for the old navy theme.
 * On the white/green brand they read as a foreign colour and they cannot follow
 * a card's selected/hover state. Line art that inherits currentColor solves
 * both, drops ~10 raster requests, and stays crisp on any display.
 *
 * Every icon shares one optical grid so the set reads as a family:
 *   - a common ground line at y=52, buildings drawn open-bottomed onto it
 *   - roof pitch of roughly 0.78 rise-over-run on every gable
 *   - 5x5 windows, filled at low opacity so grids stay legible when the
 *     stroke weight would otherwise close them up
 */

export type PropertyIconProps = { className?: string }

/** The shared baseline — a touch wider than every building so it reads as ground */
const GROUND = 'M6 52h52'

function IconShell({ className, children }: PropertyIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn('h-16 w-16', className)}
    >
      <path d={GROUND} />
      {children}
    </svg>
  )
}

/** Windows are filled rather than stroked — at 5px a stroked box fills itself in */
function Win({ x, y }: { x: number; y: number }) {
  return <rect x={x} y={y} width={5} height={5} rx={0.75} fill="currentColor" stroke="none" opacity={0.3} />
}

/** Doorways are always 5 wide and rise from the ground line to y=43 */
function Door({ x }: { x: number }) {
  return <path d={`M${x} 52V43h5V52`} />
}

export function ResidentialIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* Wide family house, gable apex at 16 */}
      <path d="M14 52V30L32 16L50 30V52" />
      {/* Chimney sits on the left pitch, so its feet follow that slope */}
      <path d="M20 25.3V12H24V22.2" />
      <Win x={19} y={34} />
      <Win x={40} y={34} />
      <Door x={29.5} />
    </IconShell>
  )
}

export function CommercialIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* Two flat-topped blocks; window rows align across both to look like one development */}
      <path d="M8 52V14H30V52" />
      <path d="M34 52V24H56V52" />
      <Win x={12} y={19} />
      <Win x={21} y={19} />
      <Win x={12} y={27} />
      <Win x={21} y={27} />
      <Win x={12} y={35} />
      <Win x={21} y={35} />
      <Win x={12} y={43} />
      <Win x={21} y={43} />
      <Win x={38} y={27} />
      <Win x={47} y={27} />
      <Win x={38} y={35} />
      <Win x={47} y={35} />
      <Win x={38} y={43} />
      <Win x={47} y={43} />
    </IconShell>
  )
}

export function TerracedIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* One unbroken run of three 16-wide units */}
      <path d="M8 52V30L16 24L24 30L32 24L40 30L48 24L56 30V52" />
      {/* Party walls — the giveaway that the row is joined, not just adjacent */}
      <path d="M24 30V52" />
      <path d="M40 30V52" />
      <Win x={13.5} y={33} />
      <Win x={29.5} y={33} />
      <Win x={45.5} y={33} />
      <Door x={13.5} />
      <Door x={29.5} />
      <Door x={45.5} />
    </IconShell>
  )
}

export function SemiDetachedIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* Exactly two units, inset from both edges so the free sides are obvious */}
      <path d="M14 52V30L23 23L32 30L41 23L50 30V52" />
      {/* The single shared wall */}
      <path d="M32 30V52" />
      <Win x={20.5} y={33} />
      <Win x={38.5} y={33} />
      <Door x={20.5} />
      <Door x={38.5} />
    </IconShell>
  )
}

export function DetachedIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* Narrower than the residential house, and centred, so the ground line
          shows clear space on both sides */}
      <path d="M19 52V30L32 20L45 30V52" />
      {/* Chimney mirrored onto the right pitch to separate it from ResidentialIcon */}
      <path d="M38 24.6V15H42V27.7" />
      <Win x={23} y={34} />
      <Win x={36} y={34} />
      <Door x={29.5} />
    </IconShell>
  )
}

export function TownhouseIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* 20 wide by 40 tall — the proportion does the explaining */}
      <path d="M22 52V20L32 12L42 20V52" />
      {/* Floor lines make the three storeys countable */}
      <path d="M22 31H42" />
      <path d="M22 41H42" />
      <Win x={25.5} y={23.5} />
      <Win x={33.5} y={23.5} />
      <Win x={25.5} y={34} />
      <Win x={33.5} y={34} />
      <Door x={29.5} />
    </IconShell>
  )
}

export function BungalowIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* Long shallow ridge on a hipped roof — the low, broad profile is the whole tell */}
      <path d="M10 52V36L20 29H44L54 36V52" />
      <Win x={15} y={40} />
      <Win x={22} y={40} />
      <Win x={37} y={40} />
      <Win x={44} y={40} />
      <Door x={29.5} />
    </IconShell>
  )
}

export function FlatIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* Roof slab overhangs the block — apartment cue that a plain box lacks */}
      <rect x={13} y={12} width={38} height={4} rx={1} />
      <path d="M16 52V16H48V52" />
      <Win x={20.5} y={19} />
      <Win x={29.5} y={19} />
      <Win x={38.5} y={19} />
      <Win x={20.5} y={27} />
      <Win x={29.5} y={27} />
      <Win x={38.5} y={27} />
      <Win x={20.5} y={35} />
      <Win x={29.5} y={35} />
      <Win x={38.5} y={35} />
      {/* Communal entrance — the one thing CommercialIcon deliberately does not have */}
      <Door x={29.5} />
    </IconShell>
  )
}

export function LargeUnusualIcon({ className }: PropertyIconProps) {
  return (
    <IconShell className={className}>
      {/* One continuous silhouette: a tall main wing (apex 16) stepping down into a
          lower side wing (apex 28), spanning the full grid to look grander */}
      <path d="M6 52V28L22 16L38 28V36L48 28L58 36V52" />
      <path d="M11 24.3V11H15V21.3" />
      <Win x={10} y={32} />
      <Win x={19.5} y={32} />
      <Win x={29} y={32} />
      <Win x={10} y={41} />
      <Win x={29} y={41} />
      <Win x={41} y={41} />
      <Win x={50} y={41} />
      <Door x={19.5} />
    </IconShell>
  )
}
