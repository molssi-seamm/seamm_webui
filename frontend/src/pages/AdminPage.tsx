import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  fetchCurrentUser,
  setAdminUserPassword,
  type AdminUser,
} from '../api'

// One row's worth of local UI state (set-password/delete confirmation) --
// kept per-row rather than lifted to AdminPage so acting on one user's row
// doesn't reset another's in-progress form.
function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const queryClient = useQueryClient()
  const [settingPassword, setSettingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setPasswordMutation = useMutation({
    mutationFn: () => setAdminUserPassword(user.username, newPassword),
    onSuccess: () => {
      setSettingPassword(false)
      setNewPassword('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminUser(user.username),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  return (
    <tr>
      <td>
        {user.username}
        {isSelf && ' (you)'}
      </td>
      <td>{[user.first_name, user.last_name].filter(Boolean).join(' ')}</td>
      <td>{user.email ?? ''}</td>
      <td>{user.roles.join(', ')}</td>
      <td>
        {!settingPassword && (
          <button onClick={() => setSettingPassword(true)}>Set password&hellip;</button>
        )}
        {settingPassword && (
          <>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              autoFocus
            />{' '}
            <button
              onClick={() => setPasswordMutation.mutate()}
              disabled={!newPassword || setPasswordMutation.isPending}
            >
              {setPasswordMutation.isPending ? 'Saving…' : 'Save'}
            </button>{' '}
            <button
              onClick={() => {
                setSettingPassword(false)
                setNewPassword('')
              }}
            >
              Cancel
            </button>
          </>
        )}
        {setPasswordMutation.isError && (
          <div>Error: {(setPasswordMutation.error as Error).message}</div>
        )}
      </td>
      <td>
        {isSelf && <em>&mdash;</em>}
        {!isSelf && !confirmDelete && (
          <button onClick={() => setConfirmDelete(true)}>Delete&hellip;</button>
        )}
        {!isSelf && confirmDelete && (
          <>
            Delete this account?{' '}
            <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Yes'}
            </button>{' '}
            <button onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        )}
        {deleteMutation.isError && <div>Error: {(deleteMutation.error as Error).message}</div>}
      </td>
    </tr>
  )
}

// Web equivalent of manage.py's seamm-webui-user CLI -- create/list/reset
// password/delete "local"-auth-mode accounts. Only reachable in practice
// for an admin-role user (Sidebar hides the nav entry otherwise, and every
// call here is backend-gated by require_admin regardless of whether
// someone lands here directly).
export function AdminPage() {
  const queryClient = useQueryClient()
  const currentUser = useQuery({ queryKey: ['auth-me'], queryFn: fetchCurrentUser })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers })

  const [creating, setCreating] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminUser({
        username,
        password,
        email: email || undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setCreating(false)
      setUsername('')
      setPassword('')
      setEmail('')
      setFirstName('')
      setLastName('')
    },
  })

  return (
    <div>
      <h2>Admin</h2>
      <h3>Users</h3>

      {users.isLoading && <p>Loading users…</p>}
      {users.error && <p>Error loading users: {(users.error as Error).message}</p>}

      {users.data && (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Password</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => (
              <UserRow key={u.username} user={u} isSelf={u.username === currentUser.data?.username} />
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '1em' }}>
        {!creating && <button onClick={() => setCreating(true)}>+ New user</button>}
      </p>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate()
          }}
          style={{ maxWidth: '24em' }}
        >
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
          <div style={{ marginTop: '0.5em' }}>
            <label>
              Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <div style={{ marginTop: '0.5em' }}>
            <label>
              First name{' '}
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
          </div>
          <div style={{ marginTop: '0.5em' }}>
            <label>
              Last name{' '}
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
          </div>
          <button
            type="submit"
            disabled={!username || !password || createMutation.isPending}
            style={{ marginTop: '0.75em' }}
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </button>{' '}
          <button type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
          {createMutation.isError && <p>Error: {(createMutation.error as Error).message}</p>}
        </form>
      )}
    </div>
  )
}
