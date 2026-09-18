import logo from '@/assets/logo.png'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The single place the logo file is referenced. Swap the import above and every
 * screen picks it up.
 *
 * The mark is a stacked oval lockup (500x295, ~1.7:1), not a wide banner — so
 * it needs roughly twice the *height* of a banner logo to give the wordmark the
 * same reading width. Call sites size it accordingly; the old h-10/h-12
 * belonged to a 4.8:1 lockup and would render this one too small to read.
 *
 * The artwork carries its own white outline, so it sits on either ground.
 *
 * width/height are declared so the browser reserves the right box before the
 * image decodes — without them the header jumps on first paint.
 */
export default function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt={BRAND.name}
      width={500}
      height={295}
      className={cn('w-auto object-contain', className)}
      // Above the fold on every screen it appears on — never lazy-load it
      decoding="async"
    />
  )
}
