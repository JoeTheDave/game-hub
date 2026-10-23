import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { MasterLayout } from './components/MasterLayout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { CreateGamePage } from './pages/CreateGamePage'
import { JoinGamePage } from './pages/JoinGamePage'
import { HostLobbyPage } from './pages/HostLobbyPage'
import { TablePage } from './pages/TablePage'
import { PlayPage } from './pages/PlayPage'
import { ErrorPage } from './pages/ErrorPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="py-12 text-center text-slate-400">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Phone: no header, full-screen (joined via QR) — shared lobby, then the game's PhoneView */}
          <Route path="/play/:gameSlug/:id" element={<PlayPage />} />

          {/* Table (TV): no header, full-screen — the game's TableView */}
          <Route path="/game/:gameSlug/:id" element={<TablePage />} />

          {/* Join page: no header, landscape viewport fit (e.g. QR scan on mobile) */}
          <Route path="/join/:joinCode" element={<JoinGamePage />} />

          {/* All other routes use MasterLayout */}
          <Route element={<MasterLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/create-game" element={<RequireAuth><CreateGamePage /></RequireAuth>} />
            <Route path="/lobby/:gameSlug/:id" element={<RequireAuth><HostLobbyPage /></RequireAuth>} />
          </Route>

          {/* Error page */}
          <Route path="/error" element={<ErrorPage />} />
          <Route path="*" element={<ErrorPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
