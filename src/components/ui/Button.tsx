import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary shadow-[0_4px_0_var(--primary-hover)] hover:bg-primary-hover active:translate-y-0.5 active:shadow-[0_2px_0_var(--primary-hover)]',
  secondary: 'border-2 border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'border-2 border-danger bg-surface text-danger hover:bg-danger-soft',
}

const SIZES: Record<Size, string> = {
  // ≥ 48px targets for elderly users (18px root: min-h-12 = 54px, min-h-11 ≈ 50px).
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-13 px-6 text-lg',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[transform,background-color,box-shadow] duration-150 select-none disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  )
}
