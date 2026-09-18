type MainContentProps = {
  children: React.ReactNode
}

export default function MainContent({ children }: MainContentProps) {
  // Deliberately no overflow-x here: it would make <main> the scroll container
  // and silently break `sticky` on the quote sidebar. body already clips.
  return (
    <main className="w-full min-w-0 flex-1">
      <div className="pp-page-column pp-step-in pt-6 md:pt-8">{children}</div>
    </main>
  )
}
