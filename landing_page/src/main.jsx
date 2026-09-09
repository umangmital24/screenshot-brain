import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import LandingPage from './LandingPage'
import { Analytics } from '@vercel/analytics/react'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LandingPage />
    <Analytics />
  </React.StrictMode>,
)
