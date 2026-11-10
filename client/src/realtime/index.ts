/** Real-time play (opt-in per game via GameModule.realtime). Import only from real-time games' modules. */
export { useRealtimeHost, useRealtimeController, type RealtimeHost, type RealtimeController } from './hooks'
export { postAuthorityAction } from './authority'
export type { RtInput, Transport } from './protocol'
export type { SeatStatus } from './session'
