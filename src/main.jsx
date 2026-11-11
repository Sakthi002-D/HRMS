import "./i18n";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './rtl.css'
import App from './App.jsx'
import { sendHrRefreshToDashboard } from './utils/reloadToDashboard'

// Refreshing any HR page opens the HR dashboard (like the employee portal)
sendHrRefreshToDashboard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
