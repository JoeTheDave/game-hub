import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom'

export function ErrorPage() {
  const error = useRouteError()

  let title = 'Oops!'
  let message = "Something went sideways. Even the best games have glitches."

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page Not Found'
      message = "Looks like this page rolled off the table."
    } else if (error.status === 500) {
      title = 'Server Hiccup'
      message = "Our server tripped over a power cable. We're on it!"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="w-full px-4 h-16 flex items-center">
          <Link
            to="/"
            className="font-black text-2xl tracking-tight bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 bg-clip-text text-transparent hover:opacity-90 transition-opacity"
          >
            GameHub
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-8xl mb-6">🎲</div>
          <h1 className="text-4xl font-bold text-white mb-4">{title}</h1>
          <p className="text-lg text-slate-400 mb-8">{message}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/"
              className="px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition-colors"
            >
              Back to Home
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-lg border border-white/20 text-slate-300 hover:bg-white/10 font-semibold transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
