import { useState, useEffect } from 'react'
import { ref, onValue, push, set, remove } from 'firebase/database'
import { db } from '../firebase.js'

const TIPOS = ['Frascos', 'Producto', 'Etiquetas', 'Cajas', 'Nafta', 'Peaje', 'Transferencia', 'Otro']

const TIPO_BADGE = {
  Frascos:       'badge-blue',
  Producto:      'badge-cyan',
  Etiquetas:     'badge-purple',
  Cajas:         'badge-amber',
  Nafta:         'badge-red',
  Peaje:         'badge-gray',
  Transferencia: 'badge-green',
  Otro:          'badge-gray',
}

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmt(n) {
  return '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
}

export default function Gastos({ usuario }) {
  const [gastos, setGastos]       = useState({})
  const [showForm, setShowForm]   = useState(false)
  const [filtroUser, setFiltroUser] = useState('Todos')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [loading, setLoading]     = useState(false)

  const [tipo, setTipo]    = useState('Nafta')
  const [monto, setMonto]  = useState('')
  const [razon, setRazon]  = useState('')
  const [dest, setDest]    = useState('')

  useEffect(() => {
    return onValue(ref(db, 'gastos'), s => setGastos(s.exists() ? s.val() : {}))
  }, [])

  const otroSocio = usuario === 'Seba' ? 'Juan' : 'Seba'

  async function handleGuardar(e) {
    e.preventDefault()
    setLoading(true)
    const montoNum = parseFloat(monto)
    const ts = Date.now()
    const base = { tipo, monto: montoNum, razon, fecha: hoy(), timestamp: ts, usuario, repartido: false }
    try {
      if (tipo === 'Transferencia') {
        const d = dest || otroSocio
        await push(ref(db, 'gastos'), { ...base, destinatario: d })
        await push(ref(db, 'gastos'), {
          tipo: 'Transferencia', monto: -montoNum,
          razon: `Recibido de ${usuario}`, fecha: hoy(),
          timestamp: ts + 1, usuario: d, repartido: false, destinatario: usuario,
        })
      } else {
        await push(ref(db, 'gastos'), base)
      }
      setTipo('Nafta'); setMonto(''); setRazon(''); setDest('')
      setShowForm(false)
    } finally { setLoading(false) }
  }

  async function handleEliminar(id, gasto) {
    if (gasto.repartido) return
    await set(ref(db, `gastosEliminados/${id}`), gasto)
    await remove(ref(db, `gastos/${id}`))
  }

  const lista = Object.entries(gastos)
    .map(([id, g]) => ({ id, ...g }))
    .filter(g => filtroUser === 'Todos' || g.usuario === filtroUser)
    .filter(g => filtroTipo === 'Todos' || (g.tipo || '').toLowerCase() === filtroTipo.toLowerCase())
    .sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">💸 Gastos</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Cerrar' : '+ Registrar Gasto'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-16">
          <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>Nuevo gasto</h3>
          <form onSubmit={handleGuardar}>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Monto ($)</label>
              <input className="form-input" type="number" min="0" step="0.01"
                placeholder="0" value={monto} onChange={e => setMonto(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Razón / descripción</label>
              <input className="form-input" type="text"
                placeholder="Detalle del gasto" value={razon} onChange={e => setRazon(e.target.value)} required />
            </div>
            {tipo === 'Transferencia' && (
              <div className="form-group">
                <label className="form-label">Destinatario</label>
                <select className="form-select" value={dest || otroSocio} onChange={e => setDest(e.target.value)}>
                  <option value={otroSocio}>{otroSocio}</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Guardando...' : '💾 Guardar'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {/* Filtro por usuario */}
        <div className="tabs mb-12">
          {['Todos', 'Seba', 'Juan'].map(t => (
            <button key={t} className={`tab-btn ${filtroUser === t ? 'active' : ''}`}
              onClick={() => setFiltroUser(t)}>{t}</button>
          ))}
        </div>

        {/* Filtro por tipo */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="text-muted fw-600" style={{ fontSize: 12 }}>Tipo:</span>
          {['Todos', ...TIPOS].map(t => (
            <button key={t}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                border: `1.5px solid ${filtroTipo === t ? 'var(--blue)' : 'var(--border)'}`,
                background: filtroTipo === t ? 'var(--blue)' : 'var(--white)',
                color: filtroTipo === t ? '#fff' : 'var(--muted)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
              onClick={() => setFiltroTipo(t)}>
              {t}
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💸</div>
            <p>No hay gastos que coincidan</p>
          </div>
        ) : lista.map(g => (
          <div key={g.id} className="list-item" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className={`badge ${TIPO_BADGE[g.tipo] || 'badge-gray'}`}>{g.tipo}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fw-600" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.razon}
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>{g.fecha} · {g.usuario}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`fw-800 ${g.monto > 0 ? 'text-red' : 'text-green'}`} style={{ fontSize: 15 }}>
                {g.monto < 0 ? '+' : ''}{fmt(g.monto)}
              </div>
            </div>
            {g.repartido
              ? <span className="badge badge-rep">✓ rep.</span>
              : <button className="btn btn-icon btn-danger btn-sm"
                  onClick={() => handleEliminar(g.id, g)}>✕</button>
            }
          </div>
        ))}
      </div>
    </div>
  )
}
