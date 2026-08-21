import type { FormEventHandler, PropsWithChildren } from 'react'

/**
 * Every question screen sits in the same measured column. Left at full width the
 * inputs stretch past 1000px on a desktop, which is both hard to read and a jarring
 * jump either side of the quote step's narrower layout.
 */
export default function StepForm({ onSubmit, children, className }: PropsWithChildren<{ onSubmit: FormEventHandler<HTMLFormElement>; className?: string }>) {
  return (
    <form onSubmit={onSubmit} className={className ?? 'gm-step-column space-y-8'} noValidate>
      {children}
    </form>
  )
}
