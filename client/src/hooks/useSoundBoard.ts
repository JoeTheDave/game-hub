import { useSyncExternalStore } from 'react'
import { soundBoard } from '../lib/soundBoard'

/** Re-renders when mute/unlock state changes. */
export function useSoundBoard() {
  const snapshot = useSyncExternalStore(
    (fn) => soundBoard.subscribe(fn),
    () => `${soundBoard.muted ? 1 : 0}${soundBoard.unlocked ? 1 : 0}`
  )
  return {
    soundBoard,
    muted: snapshot[0] === '1',
    unlocked: snapshot[1] === '1',
    toggleMute: () => soundBoard.setMuted(!soundBoard.muted),
  }
}
