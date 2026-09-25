import type { ReactNode } from 'react'

export function VisuallyHidden({
  children,
  as: Tag = 'span',
}: {
  children: ReactNode
  as?: 'span' | 'div' | 'h1' | 'h2'
}) {
  return <Tag className="sr-only">{children}</Tag>
}
