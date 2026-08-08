import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchCurrentUser, fetchHealth, logout } from './api'
import { JobsPage } from './pages/JobsPage'

function App() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: fetchHealth })
  const { data: currentUser } = useQuery({ queryKey: ['auth-me'], queryFn: fetchCurrentUser })
  const queryClient = useQueryClient()

  // AuthGate (wrapping this whole tree, see main.tsx) shares the same
  // ['auth-me'] query -- setting it here (not just invalidating, which
  // would only trigger a background refetch and leave the stale
  // logged-in data displayed until it resolves) is what makes AuthGate
  // notice on its very next render and redirect to /login, no separate
  // navigate() needed.
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['auth-me'], (old: { auth_mode: string } | undefined) => ({
        auth_mode: old?.auth_mode ?? 'local',
        username: null,
      }))
    },
  })

  return (
    <>
      <h1>seamm_webui</h1>
      <p>Backend: {health ? health.status : 'checking…'}</p>
      <p>
        <Link to="/submit">+ Submit a job</Link> · <Link to="/projects">Projects</Link>
        {currentUser?.auth_mode === 'local' && currentUser.username && (
          <>
            {' '}
            · Logged in as {currentUser.username} ·{' '}
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault()
                logoutMutation.mutate()
              }}
            >
              Log out
            </a>
          </>
        )}
      </p>
      <JobsPage />
    </>
  )
}

export default App
