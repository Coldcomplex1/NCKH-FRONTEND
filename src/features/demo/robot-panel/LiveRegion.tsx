import { useState } from 'react'
import type { ReplyRef } from '@/core/replies'
import { useLang } from '@/i18n'
import { renderReply } from '@/replies'
import { useDemo } from '@/store/demoStore'

/**
 * The ONE screen-reader announcer of the demo (the speech bubble itself is aria-hidden).
 * The engine calls `announce(ref, assertive)`; timer alarms are assertive, everything else polite.
 * Each message is a fresh keyed node, so the same reply twice in a row is still announced.
 */
export function LiveRegion() {
  const live = useDemo((s) => s.live)
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live && !live.assertive ? <Announcement key={live.id} message={live.ref} /> : null}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {live?.assertive ? <Announcement key={live.id} message={live.ref} /> : null}
      </div>
    </>
  )
}

/**
 * One message, rendered in the language of the moment it was announced: switching VI/EN later
 * must not change the live node (a screen reader would read the last reply again).
 */
function Announcement({ message }: { message: ReplyRef }) {
  const lang = useLang()
  const [text] = useState(() => renderReply(message, lang).text)
  return <span>{text}</span>
}
