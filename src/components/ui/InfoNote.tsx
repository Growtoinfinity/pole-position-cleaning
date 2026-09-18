import { memo } from 'react'
import { Info, CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type InfoNoteVariant = 'default' | 'warning' | 'success'

interface InfoNoteProps {
  children: React.ReactNode
  variant?: InfoNoteVariant
  className?: string
}

const variantStyles: Record<InfoNoteVariant, { box: string; icon: string; Icon: typeof Info }> = {
  // A pale wash with dark copy on it. The 4px left edge is the variant's loudest
  // signal, so it uses a colour that clears 3:1 against BOTH the white page and
  // its own soft fill — an edge that only contrasts with one of the two is half
  // a border.
  default: {
    box: 'border-brand-600 bg-brand-50 text-ink',
    icon: 'text-brand-700',
    Icon: Info,
  },
  warning: {
    box: 'border-warn-border bg-warn-soft text-warn',
    icon: 'text-warn',
    Icon: CircleAlert,
  },
  success: {
    box: 'border-brand-700 bg-brand-50 text-ink',
    icon: 'text-brand-700',
    Icon: CircleCheck,
  },
}

const InfoNote = memo(function InfoNote({
  children,
  variant = 'default',
  className,
}: InfoNoteProps) {
  const { box, icon, Icon } = variantStyles[variant]

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border border-l-4 p-4 text-sm', box, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  )
})

export default InfoNote
