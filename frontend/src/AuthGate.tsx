import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchCurrentUser } from './api'

// Wraps the whole route tree in main.tsx. In "none" mode (or once logged
// in, in "local" mode) just renders it normally. In "local" mode while
// logged out, forces every path except /login itself to redirect there --
// LoginPage's own route (defined in main.tsx) is what actually renders,
// this just makes sure nothing else does first.
export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { data, isLoading } = useQuery({ queryKey: ['auth-me'], queryFn: fetchCurrentUser })

  if (isLoading) return <p style={{ margin: '2em' }}>Loading…</p>

  const needsLogin = data?.auth_mode === 'local' && !data.username

  if (needsLogin && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
