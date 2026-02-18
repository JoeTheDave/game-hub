import { useState, useEffect } from 'react'

interface ApiResponse {
  status: string
  database?: string
}

interface User {
  id: number
  email: string
  name: string | null
  createdAt: string
}

function App() {
  const [apiData, setApiData] = useState<ApiResponse | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const baseUrl = import.meta.env.DEV ? 'http://localhost:3001' : ''

        // Fetch health status
        const healthResponse = await fetch(`${baseUrl}/api/health`)
        if (!healthResponse.ok) {
          throw new Error(`Health check failed: ${healthResponse.status}`)
        }
        const healthData = await healthResponse.json()
        setApiData(healthData)

        // Fetch users
        const usersResponse = await fetch(`${baseUrl}/api/users`)
        if (!usersResponse.ok) {
          throw new Error(`Users fetch failed: ${usersResponse.status}`)
        }
        const usersData = await usersResponse.json()
        setUsers(usersData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">game-hub</h1>
        </header>

        <main className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              API Status: {apiData?.status} | Database: {apiData?.database}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Users from Database</h2>

            {users.length === 0 ? (
              <p className="text-gray-600 text-center py-8">No users found in database</p>
            ) : (
              <div className="space-y-4">
                {users.map(user => (
                  <div
                    key={user.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{user.name || 'Unnamed User'}</h3>
                        <p className="text-gray-600">{user.email}</p>
                        <p className="text-sm text-gray-400">
                          ID: {user.id} | Created: {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-medium">
                          {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
