import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Tells the boot fallback in index.html that the bundle actually ran.
const w = window as unknown as { __aaMounted?: boolean }
w.__aaMounted = true
document.getElementById('boot')?.remove()
