import logo from '@/assets/we-wash-everything-logo.webp'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The single place the logo file is referenced. Swap the import above and every
 * screen picks it up.
 *
 * The mark is nearly square (240x171, ~1.4:1) — a stacked lockup, not a wide
 * one — so it needs roughly two and a half times the *height* of a banner logo
 * to give the wordmark the same reading width. Call sites size it accordingly;
 * the old h-10/h-12 belonged to a 4.8:1 lockup and would render this one about
 * 60px wide with the words unreadable.
 *
 * The artwork's wordmark is WHITE, so it only exists on a dark ground. Never
 * place this component on a light surface.
 *
 * width/height are declared so the browser reserves the right box before the
 * image decodes — without them the header jumps on first paint.
 */
export default function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt={BRAND.name}
      width={240}
      height={171}
      className={cn('w-auto object-contain', className)}
      // Above the fold on every screen it appears on — never lazy-load it
      decoding="async"
    />
  )
}
