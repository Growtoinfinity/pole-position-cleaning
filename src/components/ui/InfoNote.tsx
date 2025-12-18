import { memo } from 'react'
import { cn } from '@/lib/utils'

type InfoNoteVariant = 'default' | 'warning' | 'success'

interface InfoNoteProps {
  children: React.ReactNode
  variant?: InfoNoteVariant
  className?: string
}

const variantStyles: Record<InfoNoteVariant, string> = {
  default: 'border-white/20 bg-white/5 text-white/90',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  success: 'border-green-500/40 bg-green-500/10 text-green-100'
}

const InfoNote = memo(function InfoNote({
  children,
  variant = 'default',
  className
}: InfoNoteProps) {
  return (
    <div className={cn(
      "rounded-md border p-4 text-sm md:text-base",
      variantStyles[variant],
      className
    )}>
      {children}
    </div>
  )
})

export default InfoNote