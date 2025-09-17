import React from 'react'
import ReactDOM from 'react-dom/client'
import { NewTab } from './NewTab'
import { ErrorBoundary } from '@/sidepanel/components/ErrorBoundary'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

root.render(
  <React.StrictMode>
    <ErrorBoundary onError={(error) => console.error('NewTab Error:', error)}>
      <NewTab />
    </ErrorBoundary>
  </React.StrictMode>
)