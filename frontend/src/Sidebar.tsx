import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCurrentUser, logout } from './api'
import {
  JobsIcon,
  ProjectsIcon,
  SubmitIcon,
  AdminIcon,
  UserIcon,
  LogoutIcon,
  CollapseIcon,
} from './icons'

const COLLAPSE_KEY = 'seamm_webui_sidebar_collapsed'

function navLinkClass({ isActive }: { isActive: boolean }) {
  return 'sidebar-link' + (isActive ? ' active' : '')
}

// Collapsible left nav (icon + label, shrinks to icon-only), matching the
// old seamm_dashboard's sidebar-minimizer idiom. Persists collapsed state
// per-browser -- each open dashboard tab/window keeps its own preference.
// `backendUp` is passed down from Layout (which already polls /api/health
// for the dashboard name) rather than re-fetched here.
export function Sidebar({ backendUp }: { backendUp: boolean | undefined }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const currentUser = useQuery({ queryKey: ['auth-me'], queryFn: fetchCurrentUser })
  const queryClient = useQueryClient()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['auth-me'], (old: { auth_mode: string } | undefined) => ({
        auth_mode: old?.auth_mode ?? 'local',
        username: null,
        is_admin: false,
      }))
    },
  })

  const loggedIn = currentUser.data?.auth_mode === 'local' && currentUser.data.username
  // Admin nav entry only in "local" mode for a real admin -- naturally
  // absent in "none" mode too, since is_admin is already False there (see
  // GET /api/auth/me's docstring: nothing to manage without a login flow).
  const isAdmin = !!currentUser.data?.is_admin

  return (
    <nav className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`} aria-label="Main">
      <ul className="sidebar-nav">
        <li>
          <NavLink to="/" end className={navLinkClass} title="Jobs">
            <JobsIcon className="sidebar-icon" />
            <span className="sidebar-label">Jobs</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/projects" className={navLinkClass} title="Projects">
            <ProjectsIcon className="sidebar-icon" />
            <span className="sidebar-label">Projects</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/submit" className={navLinkClass} title="Submit a job">
            <SubmitIcon className="sidebar-icon" />
            <span className="sidebar-label">Submit a job</span>
          </NavLink>
        </li>
        {isAdmin && (
          <li>
            <NavLink to="/admin" className={navLinkClass} title="Admin">
              <AdminIcon className="sidebar-icon" />
              <span className="sidebar-label">Admin</span>
            </NavLink>
          </li>
        )}
      </ul>

      <div className="sidebar-spacer" />

      <div
        className="sidebar-status"
        title={backendUp ? 'Backend is reachable' : 'Backend unreachable'}
      >
        <span className="status-dot-wrap">
          <span className={`status-dot${backendUp ? ' status-up' : ' status-down'}`} />
        </span>
        <span className="sidebar-label">Backend: {backendUp ? 'ok' : 'down'}</span>
      </div>

      {loggedIn && (
        <>
          <div className="sidebar-account" title={`Logged in as ${currentUser.data!.username}`}>
            <UserIcon className="sidebar-icon" />
            <span className="sidebar-label">{currentUser.data!.username}</span>
          </div>
          <button
            className="sidebar-link sidebar-button"
            title="Log out"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogoutIcon className="sidebar-icon" />
            <span className="sidebar-label">Log out</span>
          </button>
        </>
      )}

      <button
        className="sidebar-link sidebar-button sidebar-collapse-btn"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => setCollapsed((c) => !c)}
      >
        <CollapseIcon className="sidebar-icon" collapsed={collapsed} />
        <span className="sidebar-label">Collapse</span>
      </button>
    </nav>
  )
}
