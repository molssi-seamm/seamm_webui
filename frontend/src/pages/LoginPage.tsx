import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { login } from '../api'

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
      queryClient.setQueryData(['auth-me'], { auth_mode: 'local', username: data.username })
      navigate('/')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div style={{ maxWidth: '20em', margin: '4em auto' }}>
      <h2>seamm_webui</h2>
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
