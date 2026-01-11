import VirpaLogo from '@/assets/virpa.png'

export default function Footer() {
  return (
    <footer className="w-full flex justify-center items-center" style={{ paddingTop: '60px', paddingBottom: '40px' }}>
      <a
        href="https://virpa.ai/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
      >
        <span style={{ color: 'white' }}>Securely powered by</span>
        <img
          src={VirpaLogo}
          alt="Virpa"
          className="h-4 w-auto"
        />
      </a>
    </footer>
  )
}
