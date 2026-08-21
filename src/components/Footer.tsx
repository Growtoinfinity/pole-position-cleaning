import VirpaLogo from '@/assets/virpa.png'
import { ShieldCheck } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="w-full pb-10 pt-16">
      <div className="flex flex-col items-center gap-3">
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />
          Your details are encrypted and never sold on.
        </p>

        <a
          href="https://virpa.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-opacity hover:opacity-70"
        >
          <span>Securely powered by</span>
          {/* The supplied mark is white artwork — flatten it to ink so it reads on white */}
          <img
            src={VirpaLogo}
            alt="Virpa"
            className="h-4 w-auto opacity-60 [filter:brightness(0)]"
          />
        </a>
      </div>
    </footer>
  )
}
