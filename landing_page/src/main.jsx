import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './wordmark.css'
import './hero-clean.css'
import LandingPage from './LandingPage'
import AboutPage from './AboutPage'
import PrivacyPage from './PrivacyPage'
import { Analytics } from '@vercel/analytics/react'

function AppRouter() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  if (path === '/about') return <AboutPage />
  if (path === '/privacy') return <PrivacyPage />
  return <LandingPage />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
    <Analytics />
  </React.StrictMode>,
)
