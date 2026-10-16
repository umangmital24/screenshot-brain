import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './wordmark.css'
import './hero-clean.css'
import './mobile-journey-fix.css'
import './footer-contrast.css'
import './storyboard.css'
import './how-it-works.css'
import './typography.css'
import LandingPage from './LandingPage'
import AboutPage from './AboutPage'
import PrivacyPage from './PrivacyPage'
import LoginPage from './LoginPage'
import DashboardPage from './DashboardPage'
import GetAppPage from './GetAppPage'
import AuthCallbackPage from './AuthCallbackPage'
import './web-portal.css'
import { Analytics } from '@vercel/analytics/react'

function AppRouter() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  if (path === '/about') return <AboutPage />
  if (path === '/privacy') return <PrivacyPage />
  if (path === '/login') return <LoginPage />
  if (path === '/auth/callback') return <AuthCallbackPage />
  if (path === '/dashboard') return <DashboardPage />
  if (path === '/get-app') return <GetAppPage />
  return <LandingPage />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
    <Analytics />
  </React.StrictMode>,
)
