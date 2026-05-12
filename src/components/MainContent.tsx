type MainContentProps = {
  children: React.ReactNode
}

export default function MainContent({ children }: MainContentProps) {
  return (
    <main className="w-full min-w-0 flex-1 overflow-x-hidden">
      <div className="kq-page-column kq-step-in pt-8 md:pt-10">{children}</div>
    </main>
  )
}