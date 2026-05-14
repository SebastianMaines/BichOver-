import { useState, useEffect } from 'react'
import { ref, onValue, push, update, remove, set } from 'firebase/database'
import { db } from '../firebase.js'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function TierBadge({ tier }) {
  const map = {
    1: { cls: 'tier-1', label: '🏊 Exc. Piscinas' },
    2: { cls: 'tier-2', label: '🔧 Ferretería' },
    3: { cls: 'tier-3', label: '📦 Distribuidor' },
  }
  const t = map[tier] || map[1]
  return <span className={`tier-badge ${t.cls}`}>{t.label}</span>
}

async function geocodificar(localidad) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(localidad + ', Argentina')}&key=${MAPS_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.results && data.results.length > 0) {
    const loc = data.results[0].geometry.location
    const jitter = () => Math.random() * 0.01 - 0.005
    return { lat: loc.lat + jitter(), lng: loc.lng + jitter() }
  }
  return null
}

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export default function Clientes({ usuario }) {
  const [clientes, setClientes]     = useState({})
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState(null)
  const [busqueda, setBusqueda]     = useState('')
  const [filtroLoc, setFiltroLoc]   = useState('')
  const [filtroTier, setFiltroTier] = useState([])
  const [geocoding, setGeocoding]   = useState(false)
  const [loading, setLoading]       = useState(false)

  const [form, setForm] = useState({
    razonSocial: '', localidad: '', direccion: '', telefono: '', tier: 1
  })

  useEffect(() => {
    return onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
  }, [])

  function openNew() {
    setEditId(null)
    setForm({ razonSocial: '', localidad: '', direccion: '', telefono: '', tier: 1 })
    setShowForm(true)
  }

  function openEdit(id, c) {
    setEditId(id)
    setForm({ razonSocial: c.razonSocial, localidad: c.localidad, direccion: c.direccion, telefono: c.telefono, tier: c.tier || 1 })
    setShowForm(true)
  }

  async function handleGuardar(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (editId) {
        await update(ref(db, `clientes/${editId}`), {
          razonSocial: form.razonSocial,
          localidad: form.localidad,
          direccion: form.direccion,
          telefono: form.telefono,
          tier: Number(form.tier),
        })
      } else {
        let coords = null
        if (MAPS_KEY) coords = await geocodificar(form.localidad)
        await push(ref(db, 'clientes'), {
          razonSocial: form.razonSocial,
          localidad: form.localidad,
          direccion: form.direccion,
          telefono: form.telefono,
          tier: Number(form.tier),
          cantidadFrascos: 0,
          fechaUltimaCompra: null,
          usuario,
          timestamp: Date.now(),
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        })
      }
      setShowForm(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleEliminar(id) {
    const c = clientes[id]
    await set(ref(db, `clientesEliminados/${id}`), c)
    await remove(ref(db, `clientes/${id}`))
  }

  async function geocodificarTodos() {
    if (!MAPS_KEY) return alert('Configurá la VITE_GOOGLE_MAPS_API_KEY')
    setGeocoding(true)
    const sinUbic = Object.entries(clientes).filter(([, c]) => !c.lat && !c.lng)
    for (const [id, c] of sinUbic) {
      const coords = await geocodificar(c.localidad)
      if (coords) await update(ref(db, `clientes/${id}`), coords)
      await new Promise(r => setTimeout(r, 300))
    }
    setGeocoding(false)
  }

  function toggleTier(t) {
    setFiltroTier(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const localidades = [...new Set(Object.values(clientes).map(c => c.localidad).filter(Boolean))].sort()

  const lista = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c, tier: c.tier || 1 }))
    .filter(c => {
      if (busqueda && !c.razonSocial?.toLowerCase().includes(busqueda.toLowerCase()) &&
          !c.localidad?.toLowerCase().includes(busqueda.toLowerCase())) return false
      if (filtroLoc && c.localidad !== filtroLoc) return false
      if (filtroTier.length > 0 && !filtroTier.includes(c.tier)) return false
      return true
    })
    .sort((a, b) => b.timestamp - a.timestamp)

  const sinUbicacion = Object.entries(clientes).filter(([, c]) => !c.lat && !c.lng)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">👥 Clientes <span className="text-muted fw-600" style={{ fontSize: 16 }}>({Object.keys(clientes).length})</span></h1>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo Cliente</button>
      </div>

      {showForm && (
        <div className="card mb-16">
          <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>
            {editId ? '✏️ Editar cliente' : '➕ Nuevo cliente'}
          </h3>
          <form onSubmit={handleGuardar}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Razón Social</label>
                <input className="form-input" value={form.razonSocial}
                  onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Localidad</label>
                <input className="form-input" value={form.localidad}
                  onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input className="form-input" value={form.direccion}
                  onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de cliente</label>
              <select className="form-select" value={form.tier}
                onChange={e => setForm(f => ({ ...f, tier: Number(e.target.value) }))}>
                <option value={1}>🏊 Exclusivo Piscinas</option>
                <option value={2}>🔧 Ferretería / Limpieza</option>
                <option value={3}>📦 Distribuidor</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Guardando...' : '💾 Guardar'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="card mb-16">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="form-input" style={{ paddingLeft: 36 }}
            placeholder="Buscar por nombre o localidad..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <select className="form-select mb-8" value={filtroLoc}
          onChange={e => setFiltroLoc(e.target.value)}>
          <option value="">Todas las localidades</option>
          {localidades.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="tier-pills">
          {[
            { tier: 1, label: '🏊 Exc. Piscinas', active: 'active-1' },
            { tier: 2, label: '🔧 Ferretería', active: 'active-2' },
            { tier: 3, label: '📦 Distribuidor', active: 'active-3' },
          ].map(({ tier, label, active }) => {
            const count = Object.values(clientes).filter(c => (c.tier || 1) === tier).length
            return (
              <button key={tier}
                className={`tier-pill ${filtroTier.includes(tier) ? active : ''}`}
                onClick={() => toggleTier(tier)}>
                {label} · {count}
              </button>
            )
          })}
        </div>
        {sinUbicacion.length > 0 && (
          <button className="btn btn-ghost btn-sm mt-8" onClick={geocodificarTodos} disabled={geocoding}>
            {geocoding ? '⏳ Geocodificando...' : `📍 Geocodificar ${sinUbicacion.length} sin ubicación`}
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">👥</div>
          <p>No hay clientes que coincidan</p>
        </div>
      ) : (
        <div className="clients-grid">
          {lista.map(c => (
            <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div className="fw-800" style={{ fontSize: 15, lineHeight: 1.3 }}>{c.razonSocial}</div>
                <TierBadge tier={c.tier} />
              </div>
              <div className="text-muted" style={{ fontSize: 13 }}>
                📍 {c.localidad}{c.telefono ? ` · 📞 ${c.telefono}` : ''}
              </div>
              <div style={{ fontSize: 12, color: c.lat ? 'var(--green)' : 'var(--light)' }}>
                {c.lat ? '🗺 En el mapa' : '⚪ Sin ubicación'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1, background: '#e8f1ff', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue)' }}>{c.cantidadFrascos || 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>frascos totales</div>
                </div>
                <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{c.fechaUltimaCompra || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--light)' }}>última compra</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openEdit(c.id, c)}>✏️ Editar</button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleEliminar(c.id)}>🗑 Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
