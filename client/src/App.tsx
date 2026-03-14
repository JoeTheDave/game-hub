import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { MasterLayout } from './components/MasterLayout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { CreateGamePage } from './pages/CreateGamePage'
import { JoinGamePage } from './pages/JoinGamePage'
import { GameLobbyRoute } from './pages/GameLobbyRoute'
import { GameViewRoute } from './pages/GameViewRoute'
import { GameControllerRoute } from './pages/GameControllerRoute'
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
          {/* Controller view: no header, full-screen (e.g. when joining via QR on mobile) */}
          <Route path="/play/:gameSlug/:id" element={<GameControllerRoute />} />

          {/* Join page: no header, landscape viewport fit (e.g. QR scan on mobile) */}
          <Route path="/join/:joinCode" element={<JoinGamePage />} />

          {/* All other routes use MasterLayout */}
          <Route element={<MasterLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/create-game" element={<RequireAuth><CreateGamePage /></RequireAuth>} />
            <Route path="/lobby/:gameSlug/:id" element={<RequireAuth><GameLobbyRoute /></RequireAuth>} />
            <Route path="/game/:gameSlug/:id" element={<RequireAuth><GameViewRoute /></RequireAuth>} />
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
