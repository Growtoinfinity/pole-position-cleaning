import { CircleAlert } from 'lucide-react'

/** One place for the look of a validation message, so every field reads the same. */
export default function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null

  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-danger" role="alert">
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  )
}
