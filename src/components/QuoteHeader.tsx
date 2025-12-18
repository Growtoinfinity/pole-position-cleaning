import Logo from '@/assets/logo.png'

export default function QuoteHeader() {
  return (
    <header className="w-full flex flex-col items-center pt-2 pb-2">
      <img
        src={Logo}
        alt="Kings Window Cleaning"
        className="h-16 w-auto mb-2 md:h-24 md:mb-3"
      />
      <h1 className="text-center font-semibold text-white tracking-wide" style={{ fontSize: 'clamp(1.5rem, 4.5vw, 2rem)' }}>
        Get An Instant Online Quote
      </h1>
    </header>
  )
}