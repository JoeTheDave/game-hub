declare global {
  namespace Express {
    interface User {
      id: number
      email: string
      name: string | null
    }
  }
}
