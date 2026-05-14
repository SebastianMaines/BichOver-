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
  const [filtroTab, setFiltroTab] = useState('Todos')
  const [loading, setLoading]     = useState(false)

  const [tipo, setTipo]          = useState('Nafta')
  const [monto, setMonto]        = useState('')
  const [razon, setRazon]        = useState('')
  const [destinatario, setDest]  = useState('')

  useEffect(() => {
    return onValue(ref(db, 'gastos'), s => setGastos(s.exists() ? s.val() : {}))
  }, [])

  const otroSocio = usuario === 'Seba' ? 'Juan' : 'Seba'

  async function handleGuardar(e) {
    e.preventDefault()
    setLoading(true)
    const montoNum = parseFloat(monto)
    const ts = Date.now()
    const base = {
      tipo,
      monto: montoNum,
      razon,
      fecha: hoy(),
      timestamp: ts,
      usuario,
      repartido: false,
    }

    try {
      if (tipo === 'Transferencia') {
        const dest = destinatario || otroSocio
        await push(ref(db, 'gastos'), { ...base, destinatario: dest })
        await push(ref(db, 'gastos'), {
          tipo: 'Transferencia',
          monto: -montoNum,
          razon: `Recibido de ${usuario}`,
          fecha: hoy(),
          timestamp: ts + 1,
          usuario: dest,
          repartido: false,
          destinatario: usuario,
        })
      } else {
        await push(ref(db, 'gastos'), base)
      }
      setTipo('Nafta'); setMonto(''); setRazon(''); setDest('')
      setShowForm(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleEliminar(id, gasto) {
    if (gasto.repartido) return
    await set(ref(db, `gastosEliminados/${id}`), gasto)
    await remove(ref(db, `gastos/${id}`))
  }

  const lista = Object.entries(gastos)
    .map(([id, g]) => ({ id, ...g }))
    .filter(g => filtroTab === 'Todos' || g.usuario === filtroTab)
    .sort((a, b) => b.timestamp - a.timestamp)

  const sinRepartir = Object.values(gastos)
    .filter(g => !g.repartido && g.monto > 0)
    .reduce((a, g) => a + g.monto, 0)

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">💸 Gastos</h1>
          <div className="section-sub">Sin repartir: <strong className="text-red">{fmt(sinRepartir)}</strong></div>
        </div>
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
                <select className="form-select" value={destinatario || otroSocio}
                  onChange={e => setDest(e.target.value)}>
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
        <div className="tabs mb-16">
          {['Todos', 'Seba', 'Juan'].map(t => (
            <button key={t} className={`tab-btn ${filtroTab === t ? 'active' : ''}`}
              onClick={() => setFiltroTab(t)}>{t}</button>
          ))}
        </div>

        {lista.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💸</div>
            <p>No hay gastos registrados</p>
          </div>
        ) : lista.map(g => (
          <div key={g.id} className="list-item" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className={`badge ${TIPO_BADGE[g.tipo] || 'badge-gray'}`}>{g.tipo}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fw-600" style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.razon}
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {g.fecha} · {g.usuario}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`fw-800 ${g.monto > 0 ? 'text-red' : 'text-green'}`} style={{ fontSize: 15 }}>
                {g.monto < 0 ? '+' : ''}{fmt(g.monto)}
              </div>
            </div>
            {g.repartido
              ? <span className="badge badge-rep">✓ rep.</span>
              : <button className="btn btn-icon btn-danger btn-sm"
                  onClick={() => handleEliminar(g.id, g)} title="Eliminar">✕</button>
            }
          </div>
        ))}
      </div>
    </div>
  )
}
