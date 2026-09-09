import VirpaLogo from '@/assets/virpa.png'
import { ShieldCheck } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="w-full pb-10 pt-16">
      <div className="flex flex-col items-center gap-3">
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-brand-400" aria-hidden />
          Your details are encrypted and never sold on.
        </p>

        <a
          href="https://virpa.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-opacity hover:opacity-70"
        >
          <span>Securely powered by</span>
          {/*
            The supplied mark is white-on-transparent artwork, so on this dark
            page it is used as-is. The light theme had to flatten it with
            `brightness(0)` to make it readable on white — that filter would
            turn it into a black blob here.
          */}
          <img src={VirpaLogo} alt="Virpa" className="h-4 w-auto opacity-70" />
        </a>
      </div>
    </footer>
  )
}
