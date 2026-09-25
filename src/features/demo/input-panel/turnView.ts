import { FileAudio, Keyboard, Mic, MousePointerClick, type LucideIcon } from 'lucide-react'
import type { StageState, Turn, TurnSource } from '@/store/demoStore'
import type { TranscriptStatus } from '../dict'

export const SOURCE_ICONS: Record<TurnSource, LucideIcon> = {
  text: Keyboard,
  chip: MousePointerClick,
  mic: Mic,
  file: FileAudio,
}

/** Combine the turn's lifecycle with the parser's verdict into one status pill. */
export function transcriptStatus(turn: Turn, asrStage: StageState): TranscriptStatus {
  if (turn.status === 'error') return 'error'
  if (turn.status === 'interrupted') return 'interrupted'
  if (!turn.parse) {
    if (turn.status === 'processing') {
      return (turn.source === 'mic' || turn.source === 'file') && asrStage === 'active'
        ? 'hearing'
        : 'thinking'
    }
    return 'unknown'
  }
  return turn.parse.status
}
