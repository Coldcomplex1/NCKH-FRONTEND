import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border-2 border-line bg-surface p-5 shadow-soft sm:p-6', className)}
      {...rest}
    />
  )
}
