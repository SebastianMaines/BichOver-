import { useState, useEffect } from 'react'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import Gastos from './components/Gastos.jsx'
import Clientes from './components/Clientes.jsx'
import Ventas from './components/Ventas.jsx'
import Reparto from './components/Reparto.jsx'
import Stock from './components/Stock.jsx'
import Estadisticas from './components/Estadisticas.jsx'
import Mapa from './components/Mapa.jsx'
import Exportar from './components/Exportar.jsx'

const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Dashboard',     icon: '📊' },
  { key: 'ventas',       label: 'Ventas',        icon: '🛒' },
  { key: 'gastos',       label: 'Gastos',        icon: '💸' },
  { key: 'clientes',     label: 'Clientes',      icon: '👥' },
  { key: 'reparto',      label: 'Reparto',       icon: '🤝' },
  { key: 'stock',        label: 'Stock',         icon: '📦' },
  { key: 'estadisticas', label: 'Estadísticas',  icon: '📈' },
  { key: 'mapa',         label: 'Mapa',          icon: '🗺️' },
  { key: 'exportar',    label: 'Exportar',      icon: '📤' },
]

export default function App() {
  const [usuario, setUsuario] = useState(null)
  const [seccion, setSeccion] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const u = sessionStorage.getItem('bichover_usuario')
    if (u) setUsuario(u)
  }, [])

  function handleLogin(u) {
    sessionStorage.setItem('bichover_usuario', u)
    setUsuario(u)
  }

  function handleLogout() {
    sessionStorage.removeItem('bichover_usuario')
    setUsuario(null)
    setSeccion('dashboard')
  }

  function navTo(key) {
    setSeccion(key)
    setMenuOpen(false)
  }

  if (!usuario) return <Login onLogin={handleLogin} />

  return (
    <div className="app-layout">
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="navbar-brand" onClick={() => navTo('dashboard')}>
            <span className="navbar-logo">🏊</span>
            <span className="navbar-title">BICHOVER!</span>
          </div>

          <div className={`navbar-links ${menuOpen ? 'open' : ''}`}>
            {NAV_ITEMS.map(item => (
              <button
                key={item.key}
                className={`nav-link ${seccion === item.key ? 'active' : ''}`}
                onClick={() => navTo(item.key)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </div>

          <div className="navbar-right">
            <span className="navbar-user">
              {usuario === 'Seba' ? '🔵' : '🟣'} {usuario}
            </span>
            <button className="btn-salir" onClick={handleLogout}>Salir</button>
            <button
              className="hamburger"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menú"
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {seccion === 'dashboard'    && <Dashboard usuario={usuario} />}
        {seccion === 'ventas'       && <Ventas usuario={usuario} />}
        {seccion === 'gastos'       && <Gastos usuario={usuario} />}
        {seccion === 'clientes'     && <Clientes usuario={usuario} />}
        {seccion === 'reparto'      && <Reparto usuario={usuario} />}
        {seccion === 'stock'        && <Stock usuario={usuario} />}
        {seccion === 'estadisticas' && <Estadisticas usuario={usuario} />}
        {seccion === 'mapa'         && <Mapa usuario={usuario} />}
        {seccion === 'exportar'     && <Exportar />}
      </main>
    </div>
  )
}
