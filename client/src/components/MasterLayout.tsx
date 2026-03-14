import { useState, useRef, useEffect } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { Hashicon } from '@emeraldpay/hashicon-react'
import { useAuth } from '../contexts/AuthContext'

export function MasterLayout() {
  const { user, loading, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await logout()
    setMenuOpen(false)
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="font-black text-2xl tracking-tight bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 bg-clip-text text-transparent hover:opacity-90 transition-opacity"
            >
              GameHub
            </Link>
            {user && (
              <Link
                to="/create-game"
                className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Create Game
              </Link>
            )}
          </div>

          <div className="flex items-center gap-4">
            {loading ? (
              <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />
            ) : user ? (
              <div className="relative flex items-center gap-3" ref={menuRef}>
                <span className="text-sm text-slate-300 truncate max-w-[200px] sm:max-w-[280px]" title={user.email}>
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="focus:outline-none focus:ring-2 focus:ring-amber-400"
                  title={user.email}
                >
                  <Hashicon value={user.email} size={40} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 py-1 w-48 rounded-lg bg-slate-800 border border-white/10 shadow-xl">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition-colors"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="px-4">
        <Outlet />
      </main>
    </div>
  )
}
