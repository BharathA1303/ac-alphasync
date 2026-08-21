import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

console.info('%c[AlphaSync] Active Build: 2026-07-06-v2 (Defensive API-Open-Wins Merge Logic Deployed)', 'color: #10b981; font-weight: bold;');

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
