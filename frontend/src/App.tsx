import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchHealth } from './api'
import { JobsPage } from './pages/JobsPage'
import './App.css'

function App() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: fetchHealth })

  return (
    <>
      <h1>seamm_webui</h1>
      <p>Backend: {health ? health.status : 'checking…'}</p>
      <p>
        <Link to="/submit">+ Submit a job</Link>
      </p>
      <JobsPage />
    </>
  )
}

export default App
