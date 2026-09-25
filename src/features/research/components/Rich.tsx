/**
 * Renders copy with `**bold**` and `{{Vietnamese fragment}}` markup — the only markup the research
 * copy uses. `{{…}}` wraps a Vietnamese word/phrase quoted inside otherwise-English copy, so screen
 * readers get it in `<span lang="vi">` instead of reading it with English phonetics.
 */
export function Rich({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\{\{[^}]+\}\})/g).filter((t) => t !== '')
  return (
    <>
      {tokens.map((t, i) => {
        if (t.startsWith('**') && t.endsWith('**')) {
          return (
            <strong key={i} className="font-bold text-ink">
              {t.slice(2, -2)}
            </strong>
          )
        }
        if (t.startsWith('{{') && t.endsWith('}}')) {
          return (
            <span key={i} lang="vi">
              {t.slice(2, -2)}
            </span>
          )
        }
        return t
      })}
    </>
  )
}
