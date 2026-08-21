import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldClasses, invalidFieldClasses } from '@/components/ui/input'

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean
  /** Wrapper class — the chevron is positioned against it */
  wrapperClassName?: string
}

/**
 * A native select with the OS arrow swapped for our own, so it matches the
 * height, radius and focus ring of every other field on the form.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, invalid, children, ...props },
  ref,
) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldClasses,
          'cursor-pointer appearance-none pr-10',
          invalid && invalidFieldClasses,
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  )
})

export default Select
