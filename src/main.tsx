import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import './styles.css'
import App from './App'

// proteção contra clickjacking (o GitHub Pages não permite o cabeçalho frame-ancestors)
if (window.top !== window.self) { document.body.innerHTML = '' } else
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
