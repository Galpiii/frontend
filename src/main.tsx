import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './app/App.tsx'
import { AuthProvider } from './features/auth/AuthProvider'
import { consumeCallback, initializeSession } from './features/auth/bootstrap'
import { queryClient } from './app/queryClient'
import { connectFeatureReviewCache } from './features/feature-review/queries'

const session = initializeSession(
  consumeCallback(window.location, window.history),
)
connectFeatureReviewCache(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider session={session}>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
