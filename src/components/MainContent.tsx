type MainContentProps = {
  children: React.ReactNode
}

export default function MainContent({ children }: MainContentProps) {
  return (
    <main className="w-full max-w-[1280px] mx-auto px-6 overflow-x-hidden">
      <div className="kq-step-in">
        {children}
      </div>
    </main>
  )
}