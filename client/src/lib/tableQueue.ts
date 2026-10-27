/**
 * Whether the TV should move past the update it is showing. It advances when something newer
 * is queued AND the current update either has nothing to animate or has already reported its
 * animation finished (possibly before the newer update arrived).
 */
export function shouldAdvance(
  current: { seq: number; events: unknown[] } | null,
  queueLength: number,
  finishedSeq: number
): boolean {
  if (!current || queueLength < 2) return false
  return current.events.length === 0 || finishedSeq === current.seq
}

/**
 * A rematch (a finished game becoming a fresh one) is a brand-new table, not a move: the TV
 * renders it without animating from the old table.
 */
export function isFreshStart(prevPhase: string | null | undefined, nextPhase: string): boolean {
  return prevPhase === 'finished' && nextPhase !== 'finished'
}
