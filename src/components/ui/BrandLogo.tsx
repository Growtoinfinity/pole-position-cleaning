import logo from '@/assets/greenmaster-services-logo.webp'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The single place the logo file is referenced. Swap the import above and every
 * screen picks it up.
 *
 * The mark is a wide lockup (514x107, ~4.8:1), so it is always sized by height and
 * left to find its own width. width/height are declared so the browser reserves the
 * right box before the image decodes — without them the header jumps on first paint.
 */
export default function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt={BRAND.name}
      width={514}
      height={107}
      className={cn('w-auto object-contain', className)}
      // Above the fold on every screen it appears on — never lazy-load it
      decoding="async"
    />
  )
}
