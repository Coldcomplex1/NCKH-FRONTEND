/**
 * Optional comparison numbers (fractions). Leave null until measured — the comparison block and
 * the "+Qwen" bar stay hidden / "coming soon" while a value is null. Never invent numbers here.
 */
export const comparisons = {
  /** Test WER of the original vinai/PhoWhisper-large before fine-tuning (normalized, same test set). */
  zeroShotTestWer: null as number | null,
  /** Test WER after adding the Qwen post-correction module. */
  qwenTestWer: null as number | null,
}
