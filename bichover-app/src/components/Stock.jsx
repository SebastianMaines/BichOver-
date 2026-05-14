import { useState, useEffect } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase.js'

export default function Stock({ usuario }) {
  const [usuarios, setUsuarios] = useState({})
  const [accion, setAccion]     = useState('agregar')
  const [cantidad, setCantidad] = useState('')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    return onValue(ref(db, 'usuarios'), s => setUsuarios(s.exists() ? s.val() : {}))
  }, [])

  const stockSeba  = usuarios.Seba?.stock ?? 0
  const stockJuan  = usuarios.Juan?.stock ?? 0
  const stockTotal = stockSeba + stockJuan
  const stockPropio = usuarios[usuario]?.stock ?? 0
  const cantNum    = parseInt(cantidad) || 0
  const stockPost  = accion === 'agregar' ? stockPropio + cantNum : stockPropio - cantNum

  async function handleAjuste(e) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      const nuevo = accion === 'agregar' ? stockPropio + cantNum : stockPropio - cantNum
      await update(ref(db, `usuarios/${usuario}`), { stock: nuevo })
      setMsg(`✅ Stock actualizado a ${nuevo} frascos`)
      setCantidad('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📦 Stock</h1>
      </div>

      {/* Tres cards visuales */}
      <div className="stock-grid">
        <div style={{
          background: usuario === 'Seba'
            ? 'linear-gradient(135deg, #0b1f3a, #1a3a6b)'
            : 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '24px 20px',
          textAlign: 'center',
          boxShadow: '0 1px 8px rgba(0,0,0,.06)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6,
            color: usuario === 'Seba' ? 'rgba(255,255,255,.7)' : 'var(--muted)' }}>
            🔵 Seba
          </div>
          <div style={{ fontSize: 48, fontWeight: 900,
            color: usuario === 'Seba' ? '#60a5fa' : 'var(--blue)' }}>
            {stockSeba}
          </div>
          <div style={{ fontSize: 13,
            color: usuario === 'Seba' ? 'rgba(255,255,255,.5)' : 'var(--light)' }}>
            frascos
          </div>
        </div>

        <div style={{
          background: usuario === 'Juan'
            ? 'linear-gradient(135deg, #2e1065, #4c1d95)'
            : 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '24px 20px',
          textAlign: 'center',
          boxShadow: '0 1px 8px rgba(0,0,0,.06)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6,
            color: usuario === 'Juan' ? 'rgba(255,255,255,.7)' : 'var(--muted)' }}>
            🟣 Juan
          </div>
          <div style={{ fontSize: 48, fontWeight: 900,
            color: usuario === 'Juan' ? '#c4b5fd' : 'var(--purple)' }}>
            {stockJuan}
          </div>
          <div style={{ fontSize: 13,
            color: usuario === 'Juan' ? 'rgba(255,255,255,.5)' : 'var(--light)' }}>
            frascos
          </div>
        </div>

        <div style={{
          background: '#fffbeb',
          border: '2px solid var(--amber)',
          borderRadius: 14,
          padding: '24px 20px',
          textAlign: 'center',
          boxShadow: '0 1px 8px rgba(0,0,0,.06)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#92400e' }}>
            📦 Total
          </div>
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--amber)' }}>
            {stockTotal}
          </div>
          <div style={{ fontSize: 13, color: '#b45309' }}>frascos</div>
        </div>
      </div>

      {/* Ajuste manual */}
      <div className="card mt-20">
        <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>
          Ajuste manual — {usuario}
        </h3>
        <form onSubmit={handleAjuste}>
          <div className="form-group">
            <label className="form-label">Acción</label>
            <select className="form-select" value={accion} onChange={e => setAccion(e.target.value)}>
              <option value="agregar">➕ Agregar frascos</option>
              <option value="descontar">➖ Descontar frascos</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Cantidad</label>
            <input className="form-input" type="number" min="1" step="1"
              placeholder="0" value={cantidad}
              onChange={e => setCantidad(e.target.value)} required />
          </div>

          {cantNum > 0 && (
            <div style={{
              background: 'var(--bg)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span className="text-muted fw-600" style={{ fontSize: 13 }}>Post-ajuste:</span>
              <span className={`fw-800 ${accion === 'agregar' ? 'text-green' : 'text-red'}`} style={{ fontSize: 18 }}>
                {stockPost} frascos
              </span>
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Actualizando...' : '✅ Actualizar'}
          </button>
        </form>

        {msg && (
          <div style={{
            marginTop: 12,
            background: '#ecfdf5',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--green)',
          }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}
