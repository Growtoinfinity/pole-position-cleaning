import type { FormEventHandler, PropsWithChildren } from 'react'

export default function StepForm({ onSubmit, children, className }: PropsWithChildren<{ onSubmit: FormEventHandler<HTMLFormElement>; className?: string }>) {
  return (
    <form onSubmit={onSubmit} className={className ?? 'mx-auto w-full max-w-none space-y-8'} noValidate>
      {children}
    </form>
  )
}


