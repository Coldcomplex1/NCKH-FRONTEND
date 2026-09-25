import { Table2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useDict } from '@/i18n'
import { cn } from '@/lib/cn'
import { chartsDict } from './dict'

export interface TableSpec {
  /** Column headers. The first column is the row header (`<th scope="row">`). */
  columns: ReactNode[]
  rows: ReactNode[][]
  /** Right-align numeric columns (by index). Defaults to every column but the first. */
  numeric?: number[]
}

/**
 * The frame every chart sits in: a <figure> whose <figcaption> holds the h3 title and a one-sentence
 * takeaway, the chart itself, an optional footnote, and a "view as table" toggle that reveals a real
 * <table> of the same data (the WCAG-clean twin of the picture).
 */
export function ChartFigure({
  title,
  takeaway,
  table,
  children,
  footnote,
  className,
}: {
  title: ReactNode
  takeaway: ReactNode
  table?: TableSpec
  children: ReactNode
  footnote?: ReactNode
  className?: string
}) {
  const t = useDict(chartsDict)
  const [open, setOpen] = useState(false)
  const tableId = useId()

  return (
    <figure
      className={cn('m-0 rounded-lg border-2 border-line bg-surface p-5 shadow-soft sm:p-6', className)}
    >
      <figcaption className="mb-5">
        <h3 className="m-0 font-display text-xl font-extrabold">{title}</h3>
        <p className="mt-1 mb-0 text-muted">{takeaway}</p>
      </figcaption>

      {children}

      {footnote ? <div className="mt-4 text-sm text-muted">{footnote}</div> : null}

      {table ? (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={tableId}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 font-semibold text-primary underline-offset-4 hover:underline"
          >
            <Table2 aria-hidden="true" className="size-5" />
            {open ? t.hideTable : t.showTable}
          </button>
          <div id={tableId} hidden={!open} className="mt-2 overflow-x-auto">
            {open ? <DataTable spec={table} caption={title} /> : null}
          </div>
        </div>
      ) : null}
    </figure>
  )
}

/** A plain, accessible data table (also used directly by the dataset section). */
export function DataTable({
  spec,
  caption,
  captionHidden = true,
  footer,
  className,
}: {
  spec: TableSpec
  caption: ReactNode
  captionHidden?: boolean
  /** Optional <tfoot> row (e.g. totals); its first cell is a row header. */
  footer?: ReactNode[]
  className?: string
}) {
  const numeric = new Set(spec.numeric ?? spec.columns.map((_, i) => i).slice(1))
  const cellClass = (i: number) =>
    cn('border-b border-line px-3 py-2 align-top', numeric.has(i) ? 'text-right tabular-nums' : 'text-left')
  return (
    <table className={cn('w-full border-collapse text-base', className)}>
      <caption className={captionHidden ? 'sr-only' : 'mb-2 text-left font-semibold'}>{caption}</caption>
      <thead>
        <tr>
          {spec.columns.map((c, i) => (
            <th key={i} scope="col" className={cn(cellClass(i), 'border-b-2 border-line-strong font-bold')}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {spec.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) =>
              i === 0 ? (
                <th key={i} scope="row" className={cn(cellClass(i), 'font-semibold')}>
                  {cell}
                </th>
              ) : (
                <td key={i} className={cellClass(i)}>
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
      {footer ? (
        <tfoot>
          <tr>
            {footer.map((cell, i) =>
              i === 0 ? (
                <th
                  key={i}
                  scope="row"
                  className={cn(cellClass(i), 'border-t-2 border-line-strong font-bold')}
                >
                  {cell}
                </th>
              ) : (
                <td key={i} className={cn(cellClass(i), 'border-t-2 border-line-strong font-bold')}>
                  {cell}
                </td>
              ),
            )}
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}
