import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { DashboardEntry } from './DashboardEntry'
import { BuyerChat } from './modules/chat/BuyerChat'
import { LoginPage } from './modules/login/LoginPage'
import './index.css'

function AppRoutes() {
  const [workspace, setWorkspace] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('dukan-setu-workspace') || 'null')
    } catch {
      return null
    }
  })
  const navigate = useNavigate()

  function login(nextWorkspace) {
    setWorkspace(nextWorkspace)
    sessionStorage.setItem('dukan-setu-workspace', JSON.stringify(nextWorkspace))
    navigate(nextWorkspace.role === 'buyer' ? '/buyer/chat' : '/dashboard', { replace: true })
  }

  function signOut() {
    sessionStorage.removeItem('dukan-setu-workspace')
    setWorkspace(null)
    navigate('/', { replace: true })
  }

  const hasActiveWorkspace = Boolean(workspace)

  return (
    <Routes>
      <Route
        path="/"
        element={
          hasActiveWorkspace ? (
            <Navigate to={workspace.role === 'buyer' ? '/buyer/chat' : '/dashboard'} replace />
          ) : (
            <LoginPage onLogin={login} />
          )
        }
      />
      <Route
        path="/buyer/chat"
        element={
          hasActiveWorkspace && workspace?.role === 'buyer' ? (
            <BuyerChat buyer={workspace} onSignOut={signOut} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/dashboard/*"
        element={
          hasActiveWorkspace && workspace?.role === 'shopkeeper' ? (
            <DashboardEntry session={workspace} onSignOut={signOut} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
