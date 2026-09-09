import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { consumeCallback, initializeSession } from './auth/bootstrap'

// Consume and remove the code before rendering; share one exchange across StrictMode mounts.
const session = initializeSession(
  consumeCallback(window.location, window.history),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider session={session}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
