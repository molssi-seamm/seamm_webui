import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { AuthGate } from './AuthGate.tsx'
import { Layout } from './Layout.tsx'
import { JobsPage } from './pages/JobsPage.tsx'
import { JobDetailPage } from './pages/JobDetailPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { SubmitJobPage } from './pages/SubmitJobPage.tsx'
import { ProjectsPage } from './pages/ProjectsPage.tsx'
import { NewProjectPage } from './pages/NewProjectPage.tsx'
import { ProjectDetailPage } from './pages/ProjectDetailPage.tsx'
import { AdminPage } from './pages/AdminPage.tsx'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>
          <Layout>
            <Routes>
              <Route path="/" element={<JobsPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/submit" element={<SubmitJobPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/new" element={<NewProjectPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </Layout>
        </AuthGate>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
