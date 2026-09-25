import { ENV } from '@/lib/env'

/** Longest clip the robot listens to (Whisper's 30 s window). */
export const MAX_AUDIO_SECONDS = 30
/** Shorter recordings are rejected as accidental taps. */
export const MIN_AUDIO_SECONDS = 0.5

/** Extensions offered by the file picker (also shown in the hint text). */
export const ALLOWED_EXTENSIONS = ['wav', 'mp3', 'm4a', 'webm', 'ogg'] as const
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number]

/**
 * MIME types browsers/OSes report for the allowed extensions. An EMPTY type is accepted too:
 * some platforms (Windows without codecs, Android file pickers) report nothing for audio files,
 * so the extension is then the only signal.
 */
const ALLOWED_MIME = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mpeg3',
  'audio/x-mpeg-3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/webm',
  'video/webm',
  'audio/ogg',
  'application/ogg',
  'audio/opus',
])

/** `accept` attribute for the file input. */
export const FILE_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.webm,.ogg'

export type FileProblem = 'empty' | 'type' | 'size'

export type FileCheck =
  { ok: true; ext: AllowedExtension } | { ok: false; problem: FileProblem; maxMB: number }

/** The lowercase extension of a file name, without the dot ('' when there is none). */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Check a user-chosen audio file BEFORE decoding it: extension and MIME against the whitelist,
 * then size ≤ `maxMB` (VITE_ASR_MAX_UPLOAD_MB). Duration is checked after decoding.
 */
export function validateFile(
  file: { name: string; type: string; size: number },
  maxMB: number = ENV.asr.maxUploadMB,
): FileCheck {
  const ext = fileExtension(file.name)
  const mime = file.type.split(';')[0]?.trim().toLowerCase() ?? ''
  const extOk = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext)
  const mimeOk = mime === '' || ALLOWED_MIME.has(mime)
  if (!extOk || !mimeOk) return { ok: false, problem: 'type', maxMB }
  if (file.size <= 0) return { ok: false, problem: 'empty', maxMB }
  if (file.size > maxMB * 1024 * 1024) return { ok: false, problem: 'size', maxMB }
  return { ok: true, ext: ext as AllowedExtension }
}
