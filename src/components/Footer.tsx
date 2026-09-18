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

        {/*
          Hovers the COLOUR, not the opacity. Fading ink-muted to 70% composites
          to 2.87:1 — the link went sub-threshold at exactly the moment the
          pointer was on it, and dragged its underline down with it.
        */}
        <a
          href="https://virpa.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
        >
          <span>Securely powered by</span>
          {/*
            The supplied mark is dark purple-on-transparent, so it reads as-is
            on this white page and needs no filter. Do NOT reach for
            `brightness(0)` here if the footer ever looks faint — that trick
            only works on pure-white artwork; on this gradient it would flatten
            the mark into a solid black blob.
          */}
          <img src={VirpaLogo} alt="Virpa" className="h-4 w-auto opacity-70" />
        </a>
      </div>
    </footer>
  )
}
