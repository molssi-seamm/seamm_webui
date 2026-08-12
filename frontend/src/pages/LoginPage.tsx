import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchHealth, login } from '../api'

// Layout skips its usual sidebar/top-bar chrome on this route (nothing to
// navigate to while logged out), so this is the one page that still shows
// its own name -- matters most here, since it's the first thing telling
// apart several dashboards open in different tabs before login even
// happens.
export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth })

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login(username, password),
    onSuccess: (data) => {
      // Set the cache directly rather than invalidateQueries -- that only
      // marks it stale and kicks off a refetch in the background, so
      // AuthGate's very next render (right after navigate('/') below)
      // would still see the old logged-out data and bounce straight back
      // to /login before the refetch resolved. This makes the "logged in"
      // state visible on the next render, synchronously.
      queryClient.setQueryData(['auth-me'], {
        auth_mode: 'local',
        username: data.username,
        is_admin: data.is_admin,
      })
      navigate('/')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div style={{ maxWidth: '20em', margin: '4em auto' }}>
      <h2>{health.data?.name || 'SEAMM Dashboard'}</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Username{' '}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>
        </div>
        <div style={{ marginTop: '0.5em' }}>
          <label>
            Password{' '}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={!username || !password || mutation.isPending}
          style={{ marginTop: '0.75em' }}
        >
          {mutation.isPending ? 'Logging in…' : 'Log in'}
        </button>
        {mutation.isError && <p>Error: {(mutation.error as Error).message}</p>}
      </form>
    </div>
  )
}
