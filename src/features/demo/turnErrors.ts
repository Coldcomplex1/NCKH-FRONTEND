import type { AsrErrorKind } from '@/audio/asrClient'
import { reply, type ReplyParams, type ReplyRef } from '@/core/replies'

/**
 * `Turn.error` codes written by the pipeline. The TranscriptCard (and the LiveRegion, via
 * `announce`) show them through the shared reply templates, so the wording matches the robot's.
 */
export type AsrReplyKind = ReplyParams['asr.error']['kind']
export type TurnErrorCode = 'generic' | 'asr.empty' | `asr.${AsrReplyKind}`

const ASR_REPLY_KINDS: readonly AsrReplyKind[] = [
  'network',
  'timeout',
  'too_large',
  'unsupported_media',
  'unprocessable',
  'busy',
  'http',
  'bad_response',
]

/** 'aborted' is not an error (the turn is marked interrupted); 'disabled' has no dedicated wording. */
export function asrErrorCode(kind: AsrErrorKind): TurnErrorCode {
  return (ASR_REPLY_KINDS as readonly string[]).includes(kind) ? (`asr.${kind}` as TurnErrorCode) : 'generic'
}

export function errorRef(code: string | undefined): ReplyRef {
  if (code === 'asr.empty') return reply('asr.empty', {})
  if (code?.startsWith('asr.')) {
    const kind = code.slice(4) as AsrReplyKind
    if (ASR_REPLY_KINDS.includes(kind)) return reply('asr.error', { kind })
  }
  return reply('error.generic', {})
}
