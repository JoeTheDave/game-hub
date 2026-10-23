/** This phone's seat credentials for a game instance (per browser tab). */
export interface SeatCredentials {
  playerOrder: number
  joinToken: string
}

const key = (id: string, field: string) => `game:${id}:${field}`

export function loadSeat(id: string): SeatCredentials | null {
  try {
    const order = sessionStorage.getItem(key(id, 'playerOrder'))
    const token = sessionStorage.getItem(key(id, 'joinToken'))
    if (order == null || !token) return null
    const playerOrder = parseInt(order, 10)
    return Number.isInteger(playerOrder) && playerOrder >= 0 ? { playerOrder, joinToken: token } : null
  } catch {
    return null
  }
}

export function saveSeat(id: string, seat: SeatCredentials) {
  try {
    sessionStorage.setItem(key(id, 'playerOrder'), String(seat.playerOrder))
    sessionStorage.setItem(key(id, 'joinToken'), seat.joinToken)
  } catch {
    // private mode: the seat lasts for this page view only
  }
}
