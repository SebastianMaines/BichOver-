import { useState, useEffect } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase.js'

function AjusteForm({ label, valorActual, onGuardar }) {
  const [accion, setAccion]   = useState('agregar')
  const [cantidad, setCantidad] = useState('')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState('')

  const cantNum  = parseInt(cantidad) || 0
  const postVal  = accion === 'agregar' ? valorActual + cantNum : valorActual - cantNum

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    try {
      await onGuardar(postVal)
      setMsg(`✅ Actualizado a ${postVal}`)
      setCantidad('')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <select className="form-select" value={accion} onChange={e => setAccion(e.target.value)}>
          <option value="agregar">➕ Agregar</option>
          <option value="descontar">➖ Descontar</option>
        </select>
        <input className="form-input" type="number" min="1" step="1"
          placeholder="Cantidad" value={cantidad} onChange={e => setCantidad(e.target.value)} required />
      </div>
      {cantNum > 0 && (
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted fw-600" style={{ fontSize: 13 }}>Post-ajuste:</span>
          <span className={`fw-800 ${accion === 'agregar' ? 'text-green' : 'text-red'}`} style={{ fontSize: 18 }}>
            {postVal}
          </span>
        </div>
      )}
      <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>
        {loading ? 'Actualizando...' : '✅ Actualizar'}
      </button>
      {msg && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>{msg}</div>}
    </form>
  )
}

export default function Stock({ usuario }) {
  const [usuarios, setUsuarios]       = useState({})
  const [componentes, setComponentes] = useState({})
  const [expandido, setExpandido]     = useState(null)

  useEffect(() => {
    const unU = onValue(ref(db, 'usuarios'),    s => setUsuarios(s.exists()    ? s.val() : {}))
    const unC = onValue(ref(db, 'componentes'), s => setComponentes(s.exists() ? s.val() : {}))
    return () => { unU(); unC() }
  }, [])

  const stockSeba  = usuarios.Seba?.stock ?? 0
  const stockJuan  = usuarios.Juan?.stock ?? 0
  const stockTotal = stockSeba + stockJuan
  const stockDR    = componentes.DR ?? 0
  const stockAC    = componentes.AC ?? 0

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📦 Stock</h1>
      </div>

      {/* Frascos terminados */}
      <div className="fw-700 mb-8" style={{ fontSize: 14, color: 'var(--muted)' }}>Frascos terminados</div>
      <div className="stock-grid mb-20">
        <div style={{
          background: usuario === 'Seba' ? 'linear-gradient(135deg, #0b1f3a, #1a3a6b)' : 'var(--white)',
          border: '1px solid var(--border)', borderRadius: 14, padding: '20px', textAlign: 'center',
          boxShadow: '0 1px 8px rgba(0,0,0,.06)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: usuario === 'Seba' ? 'rgba(255,255,255,.7)' : 'var(--muted)' }}>🔵 Seba</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: usuario === 'Seba' ? '#60a5fa' : 'var(--blue)' }}>{stockSeba}</div>
          <div style={{ fontSize: 12, color: usuario === 'Seba' ? 'rgba(255,255,255,.5)' : 'var(--light)' }}>frascos</div>
        </div>
        <div style={{
          background: usuario === 'Juan' ? 'linear-gradient(135deg, #2e1065, #4c1d95)' : 'var(--white)',
          border: '1px solid var(--border)', borderRadius: 14, padding: '20px', textAlign: 'center',
          boxShadow: '0 1px 8px rgba(0,0,0,.06)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: usuario === 'Juan' ? 'rgba(255,255,255,.7)' : 'var(--muted)' }}>🟣 Juan</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: usuario === 'Juan' ? '#c4b5fd' : 'var(--purple)' }}>{stockJuan}</div>
          <div style={{ fontSize: 12, color: usuario === 'Juan' ? 'rgba(255,255,255,.5)' : 'var(--light)' }}>frascos</div>
        </div>
        <div style={{ background: '#fffbeb', border: '2px solid var(--amber)', borderRadius: 14, padding: '20px', textAlign: 'center', boxShadow: '0 1px 8px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#92400e' }}>📦 Total</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--amber)' }}>{stockTotal}</div>
          <div style={{ fontSize: 12, color: '#b45309' }}>frascos</div>
        </div>
      </div>

      {/* Ajuste frascos */}
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'frascos' ? null : 'frascos')}>
          <span className="fw-800" style={{ fontSize: 15 }}>Ajustar frascos — {usuario}</span>
          <span style={{ fontSize: 18 }}>{expandido === 'frascos' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'frascos' && (
          <AjusteForm
            label="frascos"
            valorActual={usuarios[usuario]?.stock ?? 0}
            onGuardar={v => update(ref(db, `usuarios/${usuario}`), { stock: v })}
          />
        )}
      </div>

      {/* Componentes: DR y AC */}
      <div className="fw-700 mb-8" style={{ fontSize: 14, color: 'var(--muted)' }}>Componentes</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#ecfdf5', border: '2px solid var(--green)', borderRadius: 14, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#065f46' }}>🧪 DR</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--green)' }}>{stockDR}</div>
          <div style={{ fontSize: 12, color: '#059669' }}>unidades</div>
        </div>
        <div style={{ background: '#f0f9ff', border: '2px solid #0891b2', borderRadius: 14, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#0c4a6e' }}>🧪 AC</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#0891b2' }}>{stockAC}</div>
          <div style={{ fontSize: 12, color: '#0369a1' }}>unidades</div>
        </div>
      </div>

      <div className="card mb-16">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'DR' ? null : 'DR')}>
          <span className="fw-800" style={{ fontSize: 15 }}>Ajustar componente DR</span>
          <span style={{ fontSize: 18 }}>{expandido === 'DR' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'DR' && (
          <AjusteForm
            label="DR"
            valorActual={stockDR}
            onGuardar={v => update(ref(db, 'componentes'), { DR: v })}
          />
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'AC' ? null : 'AC')}>
          <span className="fw-800" style={{ fontSize: 15 }}>Ajustar componente AC</span>
          <span style={{ fontSize: 18 }}>{expandido === 'AC' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'AC' && (
          <AjusteForm
            label="AC"
            valorActual={stockAC}
            onGuardar={v => update(ref(db, 'componentes'), { AC: v })}
          />
        )}
      </div>
    </div>
  )
}
