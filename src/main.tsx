import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/caveat/600.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/700.css'
import './ui/styles.css'
import { App, ErrorBoundary } from './ui/App'
import { initTelegram } from './telegram'

initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
