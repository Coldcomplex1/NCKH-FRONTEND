import type { ReactNode } from 'react'

/**
 * Overlay button (≥ 54px). Narrow panels show the icon only (the label stays as the accessible
 * name and tooltip), so it never collides with the demo's room chips in the bottom-left corner.
 */
export function StageButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pointer-events-auto inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl border-2 border-line-strong bg-surface/90 px-3 font-semibold text-ink shadow-soft backdrop-blur-sm transition-colors duration-150 select-none hover:bg-surface-2 @xl:px-4"
    >
      <span aria-hidden="true" className="inline-flex shrink-0">
        {icon}
      </span>
      <span aria-hidden="true" className="hidden @xl:inline">
        {label}
      </span>
    </button>
  )
}
