import { type ReactNode, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from './api'
import { Sidebar } from './Sidebar'

const FALLBACK_NAME = 'SEAMM Dashboard'

// Wraps every route (main.tsx) with the persistent sidebar + top bar,
// except /login -- that page is deliberately chrome-free (nothing to
// navigate to while logged out, and AuthGate already forces every other
// path there in "local" auth mode while unauthenticated).
//
// Polls the same /api/health App.tsx already fetched on load; now also
// carries the per-instance `name` (seamm-webui's --name, defaulting to
// --jobserver-name/hostname) so multiple open dashboards are distinguishable
// by browser tab title and an on-page header, not just by URL/port.
export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  })

  const name = health.data?.name || FALLBACK_NAME

  useEffect(() => {
    document.title = name
  }, [name])

  if (location.pathname === '/login') return <>{children}</>

  return (
    <div className="app-shell">
      <Sidebar backendUp={health.data?.status === 'ok'} />
      <div className="app-main">
        <header className="app-topbar">
          <span className="app-topbar-name">{name}</span>
        </header>
        <div className="app-content">{children}</div>
      </div>
    </div>
  )
}
