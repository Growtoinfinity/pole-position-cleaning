import type { FormEventHandler, PropsWithChildren } from 'react'

export default function StepForm({ onSubmit, children, className }: PropsWithChildren<{ onSubmit: FormEventHandler<HTMLFormElement>; className?: string }>) {
  return (
    <form onSubmit={onSubmit} className={className ?? 'mx-auto w-full max-w-4xl space-y-8 px-6'} noValidate>
      {children}
    </form>
  )
}


