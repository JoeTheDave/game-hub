import { useEffect } from 'react'
import { getSocket } from './useSocket'
import { checkForNewBuild } from '../lib/buildVersion'

/**
 * Game pages only (TV table, phone play, host lobby): when the socket reconnects after a drop
 * (a deploy restarts the server) or the tab becomes visible again, reload once if a new build is
 * live.
 */
export function useAutoReloadOnDeploy() {
  useEffect(() => {
    const socket = getSocket()
    let dropped = false
    const onDisconnect = () => {
      dropped = true
    }
    const onConnect = () => {
      if (!dropped) return
      dropped = false
      void checkForNewBuild()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForNewBuild()
    }
    socket?.on('disconnect', onDisconnect)
    socket?.on('connect', onConnect)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      socket?.off('disconnect', onDisconnect)
      socket?.off('connect', onConnect)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
