import { useState, useEffect, useRef } from 'react'
import { ref, onValue, push, update } from 'firebase/database'
import { db } from './firebase.js'
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
import Pedidos from './components/Pedidos.jsx'
import Kilometros from './components/Kilometros.jsx'

const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Dashboard',     icon: '📊' },
  { key: 'ventas',       label: 'Ventas',        icon: '🛒' },
  { key: 'pedidos',      label: 'Pedidos',       icon: '📋' },
  { key: 'clientes',     label: 'Clientes',      icon: '👥' },
  { key: 'mapa',         label: 'Mapa',          icon: '🗺️' },
  { key: 'gastos',       label: 'Gastos',        icon: '💸' },
  { key: 'reparto',      label: 'Reparto',       icon: '🤝' },
  { key: 'stock',        label: 'Stock',         icon: '📦' },
  { key: 'estadisticas', label: 'Estadísticas',  icon: '📈' },
  { key: 'exportar',     label: 'Exportar',      icon: '📤' },
  { key: 'kilometros',   label: 'Kilómetros',    icon: '🚗' },
]

// Items shown in mobile bottom bar (most used)
const BOTTOM_NAV = ['dashboard', 'ventas', 'pedidos', 'clientes', 'mapa']

function BusquedaGlobal({ clientes, ventas, gastos, onNavTo, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.toLowerCase().trim()

  const resultadosClientes = q
    ? Object.entries(clientes)
        .map(([id, c]) => ({ id, ...c }))
        .filter(c =>
          c.razonSocial?.toLowerCase().includes(q) ||
          c.localidad?.toLowerCase().includes(q)
        )
        .slice(0, 6)
    : []

  const resultadosVentas = q
    ? Object.entries(ventas)
        .map(([id, v]) => ({ id, ...v }))
        .filter(v => v.cliente?.toLowerCase().includes(q))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 6)
    : []

  const resultadosGastos = q
    ? Object.entries(gastos)
        .map(([id, g]) => ({ id, ...g }))
        .filter(g =>
          g.razon?.toLowerCase().includes(q) ||
          g.tipo?.toLowerCase().includes(q)
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 6)
    : []

  const hayResultados = resultadosClientes.length > 0 || resultadosVentas.length > 0 || resultadosGastos.length > 0

  function handleClick(seccion) {
    onNavTo(seccion)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '60px 16px 40px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 600 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar clientes, ventas, gastos..."
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '14px 16px 14px 46px',
              borderRadius: 14, border: 'none',
              fontSize: 16, fontWeight: 500,
              background: '#fff', color: 'var(--navy)',
              outline: 'none',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}
          />
          <button
            onClick={onClose}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--muted)',
            }}
          >✕</button>
        </div>

        {q && !hayResultados && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Sin resultados para "{query}"
          </div>
        )}

        {resultadosClientes.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '12px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, padding: '4px 8px 8px', textTransform: 'uppercase' }}>
              👥 Clientes
            </div>
            {resultadosClientes.map(c => (
              <button
                key={c.id}
                onClick={() => handleClick('clientes')}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 10,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{c.razonSocial}</div>
                {c.localidad && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>📍 {c.localidad}</div>}
              </button>
            ))}
          </div>
        )}

        {resultadosVentas.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '12px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, padding: '4px 8px 8px', textTransform: 'uppercase' }}>
              🛒 Ventas
            </div>
            {resultadosVentas.map(v => (
              <button
                key={v.id}
                onClick={() => handleClick('ventas')}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 10,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{v.cliente}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {v.fechaVenta} · {v.cantidadFrascos} frascos · ${Math.round(v.cantidadFrascos * v.precioVenta).toLocaleString('es-AR')}
                </div>
              </button>
            ))}
          </div>
        )}

        {resultadosGastos.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '12px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, padding: '4px 8px 8px', textTransform: 'uppercase' }}>
              💸 Gastos
            </div>
            {resultadosGastos.map(g => (
              <button
                key={g.id}
                onClick={() => handleClick('gastos')}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 10,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{g.razon || g.tipo}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {g.tipo} · {g.fecha} · ${Math.round(g.monto).toLocaleString('es-AR')}
                </div>
              </button>
            ))}
          </div>
        )}

        {!q && (
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
            Escribí para buscar en clientes, ventas y gastos
          </div>
        )}
      </div>
    </div>
  )
}

function Toast({ notif, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 90, right: 16, zIndex: 99999,
      background: 'var(--navy)', color: '#fff',
      borderRadius: 14, padding: '12px 16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      maxWidth: 300, fontSize: 14, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 10,
      animation: 'slideInRight 0.3s ease',
    }}>
      <span style={{ fontSize: 20 }}>🔔</span>
      <span style={{ flex: 1 }}>{notif.mensaje}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>✕</button>
    </div>
  )
}

export default function App() {
  const [usuario, setUsuario] = useState(null)
  const [seccion, setSeccion] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showBusqueda, setShowBusqueda] = useState(false)
  const [clientes, setClientes] = useState({})
  const [ventas, setVentas] = useState({})
  const [gastos, setGastos] = useState({})
  const [pedidosPendientes, setPedidosPendientes] = useState(0)
  const [notifs, setNotifs] = useState([])
  const [toasts, setToasts] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const notifsSeenRef = useRef(new Set())

  useEffect(() => {
    const u = sessionStorage.getItem('bichover_usuario')
    if (u) setUsuario(u)
  }, [])

  useEffect(() => {
    if (!usuario) return
    const unN = onValue(ref(db, `notificaciones/${usuario}`), s => {
      if (!s.exists()) { setNotifs([]); return }
      const todas = Object.entries(s.val())
        .map(([id, n]) => ({ id, ...n }))
        .filter(n => !n.leida)
        .sort((a, b) => b.timestamp - a.timestamp)
      setNotifs(todas)
      // Show toast for new ones
      todas.forEach(n => {
        if (!notifsSeenRef.current.has(n.id)) {
          notifsSeenRef.current.add(n.id)
          setToasts(prev => [...prev, n])
        }
      })
    })
    return () => unN()
  }, [usuario])

  async function marcarLeida(id) {
    await update(ref(db, `notificaciones/${usuario}/${id}`), { leida: true })
  }

  async function marcarTodasLeidas() {
    const updates = {}
    notifs.forEach(n => { updates[`notificaciones/${usuario}/${n.id}/leida`] = true })
    if (Object.keys(updates).length) await update(ref(db), updates)
    setShowNotifs(false)
  }

  function dismissToast(id) {
    marcarLeida(id)
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    if (!usuario) return
    const unC = onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
    const unV = onValue(ref(db, 'ventas'),   s => setVentas(s.exists()   ? s.val() : {}))
    const unG = onValue(ref(db, 'gastos'),   s => setGastos(s.exists()   ? s.val() : {}))
    const unP = onValue(ref(db, 'pedidos'),  s => {
      if (!s.exists()) { setPedidosPendientes(0); return }
      const count = Object.values(s.val()).filter(p => p.estado === 'pendiente').length
      setPedidosPendientes(count)
    })
    return () => { unC(); unV(); unG(); unP() }
  }, [usuario])

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowBusqueda(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  const bottomItems = NAV_ITEMS.filter(i => BOTTOM_NAV.includes(i.key))
  const moreItems   = NAV_ITEMS.filter(i => !BOTTOM_NAV.includes(i.key))

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
                {item.key === 'pedidos' && pedidosPendientes > 0 && (
                  <span style={{ background: 'var(--amber)', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 900, padding: '1px 6px', marginLeft: 2 }}>
                    {pedidosPendientes}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="navbar-right">
            <button
              className="btn-salir"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', marginRight: 4 }}
              onClick={() => setShowBusqueda(true)}
              title="Buscar (Ctrl+K)"
            >
              🔍
            </button>
            <button
              className="btn-salir"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', marginRight: 4, position: 'relative' }}
              onClick={() => setShowNotifs(v => !v)}
              title="Notificaciones"
            >
              🔔
              {notifs.length > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: 'var(--red)', color: '#fff',
                  borderRadius: 99, fontSize: 10, fontWeight: 900,
                  padding: '1px 5px', minWidth: 16, textAlign: 'center',
                }}>
                  {notifs.length}
                </span>
              )}
            </button>
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
        {seccion === 'dashboard'    && <Dashboard usuario={usuario} onNavTo={navTo} />}
        {seccion === 'ventas'       && <Ventas usuario={usuario} />}
        {seccion === 'gastos'       && <Gastos usuario={usuario} />}
        {seccion === 'clientes'     && <Clientes usuario={usuario} />}
        {seccion === 'reparto'      && <Reparto usuario={usuario} />}
        {seccion === 'stock'        && <Stock usuario={usuario} />}
        {seccion === 'estadisticas' && <Estadisticas usuario={usuario} />}
        {seccion === 'mapa'         && <Mapa usuario={usuario} />}
        {seccion === 'exportar'     && <Exportar />}
        {seccion === 'pedidos'      && <Pedidos usuario={usuario} />}
        {seccion === 'kilometros'   && <Kilometros usuario={usuario} />}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav">
        {bottomItems.map(item => (
          <button
            key={item.key}
            className={`bottom-nav-item ${seccion === item.key ? 'active' : ''}`}
            onClick={() => navTo(item.key)}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
            {item.key === 'pedidos' && pedidosPendientes > 0 && (
              <span className="bottom-nav-badge">{pedidosPendientes}</span>
            )}
          </button>
        ))}
        {/* "Más" button opens top hamburger menu */}
        <button
          className={`bottom-nav-item ${moreItems.some(i => i.key === seccion) ? 'active' : ''}`}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span className="bottom-nav-icon">☰</span>
          <span className="bottom-nav-label">Más</span>
        </button>
      </nav>

      {showBusqueda && (
        <BusquedaGlobal
          clientes={clientes}
          ventas={ventas}
          gastos={gastos}
          onNavTo={navTo}
          onClose={() => setShowBusqueda(false)}
        />
      )}

      {/* Notifications panel */}
      {showNotifs && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowNotifs(false)}>
          <div
            style={{
              position: 'absolute', top: 60, right: 16,
              background: '#fff', borderRadius: 14,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              width: 300, maxHeight: 400, overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>🔔 Notificaciones</span>
              {notifs.length > 0 && (
                <button onClick={marcarTodasLeidas} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--blue)', fontWeight: 700 }}>
                  Marcar todas leídas
                </button>
              )}
            </div>
            {notifs.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                Sin notificaciones nuevas
              </div>
            ) : (
              notifs.map(n => (
                <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20 }}>{n.tipo === 'transferencia' ? '🔄' : n.tipo === 'pedido' ? '📋' : '🔔'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{n.mensaje}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {new Date(n.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button onClick={() => marcarLeida(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>✕</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 90, right: 16, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <Toast key={t.id} notif={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </div>
  )
}
