import { useState, useEffect } from 'react'
import { ref, onValue, push, update, remove, set } from 'firebase/database'
import { db } from '../firebase.js'
import {
  APIProvider, Map, AdvancedMarker, useMap,
} from '@vis.gl/react-google-maps'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function waUrl(tel) {
  if (!tel) return null
  const d = tel.replace(/\D/g, '')
  if (!d) return null
  const num = d.startsWith('54') ? d : d.startsWith('0') ? '54' + d.slice(1) : '54' + d
  return `https://wa.me/${num}`
}

function mapsUrlCliente(c) {
  if (c.lat && c.lng) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
  if (c.direccion)    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.direccion + ', Argentina')}`
  if (c.localidad)    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.localidad + ', Argentina')}`
  return null
}

function TierBadge({ tier }) {
  const map = {
    1: { cls: 'tier-1', label: '🏊 Exc. Piscinas' },
    2: { cls: 'tier-2', label: '🔧 Ferretería' },
    3: { cls: 'tier-3', label: '📦 Distribuidor' },
  }
  const t = map[tier] || map[1]
  return <span className={`tier-badge ${t.cls}`}>{t.label}</span>
}

async function nominatimSearch(q, limit = 5) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Argentina')}&format=json&limit=${limit}&countrycodes=ar&addressdetails=1`
  const res = await fetch(url, { headers: { 'Accept-Language': 'es' } })
  return res.json()
}

async function geocodificar(localidad) {
  const data = await nominatimSearch(localidad, 1)
  if (data.length > 0) {
    const j = () => Math.random() * 0.01 - 0.005
    return { lat: parseFloat(data[0].lat) + j(), lng: parseFloat(data[0].lon) + j() }
  }
  return null
}

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function parseFecha(fecha) {
  if (!fecha) return null
  const [d, m, y] = fecha.split('/')
  return new Date(y, m - 1, d)
}

function diasDesde(fecha) {
  const f = parseFecha(fecha)
  if (!f) return null
  const diff = Date.now() - f.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

const ROSARIO = { lat: -32.9468, lng: -60.6393 }

function MapPanner({ target }) {
  const map = useMap()
  useEffect(() => {
    if (map && target) { map.panTo(target); map.setZoom(17) }
  }, [map, target])
  return null
}

function VincularMapaModal({ cliente, clienteId, onClose }) {
  const inicial = [cliente.razonSocial, cliente.direccion, cliente.localidad].filter(Boolean).join(', ')
  const [busqueda, setBusqueda] = useState(inicial)
  const [pin, setPin]           = useState(cliente.lat ? { lat: cliente.lat, lng: cliente.lng } : null)
  const [panTarget, setPanTarget] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError]       = useState('')
  const [guardando, setGuardando] = useState(false)
  const [placeInfo, setPlaceInfo] = useState(null)

  async function buscar() {
    if (!busqueda.trim()) return
    setBuscando(true)
    setError('')
    setPlaceInfo(null)
    try {
      // Google Places API v1 (soporta CORS desde browser)
      if (MAPS_KEY) {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': MAPS_KEY,
            'X-Goog-FieldMask': 'places.location,places.displayName,places.formattedAddress',
          },
          body: JSON.stringify({ textQuery: busqueda.trim() + ', Argentina' }),
        })
        const data = await res.json()
        if (data.places?.length > 0) {
          const place = data.places[0]
          const loc = place.location
          const found = { lat: loc.latitude, lng: loc.longitude }
          setPin(found); setPanTarget(found)
          setPlaceInfo({ nombre: place.displayName?.text, direccion: place.formattedAddress })
          return
        }
      }
      // Fallback gratuito para direcciones/ciudades
      const nom = await nominatimSearch(busqueda.trim())
      if (nom.length > 0) {
        const found = { lat: parseFloat(nom[0].lat), lng: parseFloat(nom[0].lon) }
        setPin(found); setPanTarget(found)
        setPlaceInfo({ nombre: nom[0].display_name?.split(',').slice(0,2).join(','), direccion: nom[0].display_name })
      } else {
        setError('No se encontró. Probá con la dirección exacta o hacé click en el mapa.')
      }
    } catch { setError('Error al buscar.') }
    finally { setBuscando(false) }
  }

  async function confirmar() {
    if (!pin) return
    setGuardando(true)
    await update(ref(db, `clientes/${clienteId}`), { lat: pin.lat, lng: pin.lng })
    onClose()
  }

  function handleMapClick(e) {
    const { lat, lng } = e.detail.latLng
    setPin({ lat, lng })
  }

  const defaultCenter = cliente.lat ? { lat: cliente.lat, lng: cliente.lng } : ROSARIO

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">📍 Vincular al mapa — {cliente.razonSocial}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            className="form-input"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Nombre, dirección, localidad..."
            style={{ flex: 1 }}
            autoFocus
          />
          <button className="btn btn-primary" onClick={buscar} disabled={buscando}>
            {buscando ? '⏳' : '🔍'}
          </button>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8, fontWeight: 600 }}>{error}</div>}

        {placeInfo && (
          <div style={{ background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#065f46' }}>📍 {placeInfo.nombre}</div>
            {placeInfo.direccion && (
              <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>{placeInfo.direccion}</div>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          {pin ? 'Pin colocado — podés hacer click en el mapa para moverlo si no es exacto.' : 'Buscá o hacé click en el mapa para colocar el pin.'}
        </div>

        {MAPS_KEY ? (
          <APIProvider apiKey={MAPS_KEY}>
            <Map
              style={{ width: '100%', height: 320, borderRadius: 12, marginBottom: 14 }}
              defaultCenter={defaultCenter}
              defaultZoom={cliente.lat ? 16 : 13}
              mapId="vincular-map"
              disableDefaultUI
              zoomControl
              onClick={handleMapClick}
            >
              <MapPanner target={panTarget} />
              {pin && (
                <AdvancedMarker position={pin}>
                  <div style={{ fontSize: 32, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>📍</div>
                </AdvancedMarker>
              )}
            </Map>
          </APIProvider>
        ) : (
          <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 14, color: 'var(--muted)', fontSize: 13 }}>
            Sin API key de Maps — ingresá las coordenadas manualmente buscando la dirección.
            {pin && <div style={{ marginTop: 8, fontWeight: 700, color: 'var(--green)', fontSize: 12 }}>📍 {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmar} disabled={!pin || guardando}>
            {guardando ? 'Guardando...' : '✅ Confirmar ubicación'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function Clientes({ usuario }) {
  const [clientes, setClientes]     = useState({})
  const [ventas, setVentas]         = useState({})
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState(null)
  const [busqueda, setBusqueda]     = useState('')
  const [filtroLoc, setFiltroLoc]   = useState('')
  const [filtroTier, setFiltroTier] = useState([])
  const [filtroInactivos, setFiltroInactivos] = useState(0)
  const [geocoding, setGeocoding]   = useState(false)
  const [loading, setLoading]       = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(null)
  const [vincularId, setVincularId] = useState(null)

  const [form, setForm] = useState({
    razonSocial: '', localidad: '', direccion: '', telefono: '', tier: 1, precioHabitual: ''
  })

  useEffect(() => {
    const unClientes = onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
    const unVentas   = onValue(ref(db, 'ventas'),   s => setVentas(s.exists()   ? s.val() : {}))
    return () => { unClientes(); unVentas() }
  }, [])

  function openNew() {
    setEditId(null)
    setForm({ razonSocial: '', localidad: '', direccion: '', telefono: '', tier: 1, precioHabitual: '' })
    setShowForm(true)
  }

  function openEdit(id, c) {
    setEditId(id)
    setForm({
      razonSocial: c.razonSocial,
      localidad: c.localidad,
      direccion: c.direccion,
      telefono: c.telefono,
      tier: c.tier || 1,
      precioHabitual: c.precioHabitual != null ? c.precioHabitual : '',
    })
    setShowForm(true)
  }

  async function handleGuardar(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const precioHabitual = form.precioHabitual !== '' ? Number(form.precioHabitual) : null
      if (editId) {
        const upd = {
          razonSocial: form.razonSocial,
          localidad: form.localidad,
          direccion: form.direccion,
          telefono: form.telefono,
          tier: Number(form.tier),
        }
        if (precioHabitual !== null) upd.precioHabitual = precioHabitual
        await update(ref(db, `clientes/${editId}`), upd)
      } else {
        let coords = null
        if (MAPS_KEY) coords = await geocodificar(form.localidad)
        const newCliente = {
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
        }
        if (precioHabitual !== null) newCliente.precioHabitual = precioHabitual
        await push(ref(db, 'clientes'), newCliente)
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

  function estaInactivo(c) {
    if (filtroInactivos === 0) return false
    if (!c.fechaUltimaCompra) return true
    const dias = diasDesde(c.fechaUltimaCompra)
    return dias !== null && dias >= filtroInactivos
  }

  const lista = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c, tier: c.tier || 1 }))
    .filter(c => {
      if (busqueda && !c.razonSocial?.toLowerCase().includes(busqueda.toLowerCase()) &&
          !c.localidad?.toLowerCase().includes(busqueda.toLowerCase())) return false
      if (filtroLoc && c.localidad !== filtroLoc) return false
      if (filtroTier.length > 0 && !filtroTier.includes(c.tier)) return false
      if (filtroInactivos > 0 && !estaInactivo(c)) return false
      return true
    })
    .sort((a, b) => b.timestamp - a.timestamp)

  const sinUbicacion = Object.entries(clientes).filter(([, c]) => !c.lat && !c.lng)

  // historial modal
  const historialCliente = historialAbierto ? clientes[historialAbierto] : null
  const historialVentas = historialAbierto
    ? Object.entries(ventas)
        .map(([id, v]) => ({ id, ...v }))
        .filter(v => v.clienteKey === historialAbierto)
        .sort((a, b) => b.timestamp - a.timestamp)
    : []

  function countVentasCliente(id) {
    return Object.values(ventas).filter(v => v.clienteKey === id).length
  }

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
              <div className="form-group">
                <label className="form-label">Precio habitual ($/frasco)</label>
                <input className="form-input" type="number" min="0" step="0.01" placeholder="Opcional"
                  value={form.precioHabitual}
                  onChange={e => setForm(f => ({ ...f, precioHabitual: e.target.value }))} />
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

        {/* Filtro inactivos */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {[
            { val: 0, label: 'Todos' },
            { val: 30, label: '+30 días' },
            { val: 60, label: '+60 días' },
            { val: 90, label: '+90 días' },
          ].map(({ val, label }) => (
            <button key={val}
              onClick={() => setFiltroInactivos(val)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: filtroInactivos === val ? 'var(--amber)' : 'var(--bg)',
                color: filtroInactivos === val ? '#fff' : 'var(--muted)',
              }}>
              {label}
            </button>
          ))}
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
          {lista.map(c => {
            const dias = c.fechaUltimaCompra ? diasDesde(c.fechaUltimaCompra) : null
            const inactivo = estaInactivo(c)
            const nVentas = countVentasCliente(c.id)
            return (
              <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div className="fw-800" style={{ fontSize: 15, lineHeight: 1.3 }}>{c.razonSocial}</div>
                  <TierBadge tier={c.tier} />
                </div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  📍 {c.localidad}{c.telefono ? ` · 📞 ${c.telefono}` : ''}
                </div>
                {c.precioHabitual != null && (
                  <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
                    💲 Precio habitual: ${Number(c.precioHabitual).toLocaleString('es-AR')}/frasco
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, color: c.lat ? 'var(--green)' : 'var(--light)' }}>
                    {c.lat ? '🗺 En el mapa' : '⚪ Sin ubicación en mapa'}
                  </div>
                  {!c.lat && (
                    <button
                      onClick={() => setVincularId(c.id)}
                      style={{ background: 'none', border: '1px solid var(--blue)', color: 'var(--blue)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      📍 Vincular
                    </button>
                  )}
                  {c.lat && (
                    <button
                      onClick={() => setVincularId(c.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', padding: '2px 4px' }}>
                      ✏️ Mover
                    </button>
                  )}
                </div>
                {inactivo && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: '#92400e', fontWeight: 700 }}>
                    ⚠️ {dias !== null ? `${dias} días sin comprar` : 'Sin compras registradas'}
                  </div>
                )}
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
                {(waUrl(c.telefono) || mapsUrlCliente(c)) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {waUrl(c.telefono) && (
                      <a href={waUrl(c.telefono)} target="_blank" rel="noopener noreferrer"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#25d366', color: '#fff', borderRadius: 8, padding: '7px 0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                        💬 WhatsApp
                      </a>
                    )}
                    {mapsUrlCliente(c) && (
                      <a href={mapsUrlCliente(c)} target="_blank" rel="noopener noreferrer"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#4285f4', color: '#fff', borderRadius: 8, padding: '7px 0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                        🗺 Cómo llegar
                      </a>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openEdit(c.id, c)}>✏️ Editar</button>
                  <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => handleEliminar(c.id)}>🗑 Eliminar</button>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setHistorialAbierto(c.id)}
                  style={{ marginTop: 2 }}>
                  📋 Ver historial ({nVentas})
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal vincular al mapa */}
      {vincularId && clientes[vincularId] && (
        <VincularMapaModal
          cliente={clientes[vincularId]}
          clienteId={vincularId}
          onClose={() => setVincularId(null)}
        />
      )}

      {/* Modal historial */}
      {historialAbierto && historialCliente && (
        <div className="modal-overlay" onClick={() => setHistorialAbierto(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ fontSize: 16 }}>
              📋 Historial — {historialCliente.razonSocial}
            </div>
            {historialVentas.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin compras registradas.</p>
            ) : (
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historialVentas.map(v => (
                  <div key={v.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{v.fechaVenta}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {v.cantidadFrascos} frascos · ${Number(v.precioVenta).toLocaleString('es-AR')}/u · {v.usuario}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 14, whiteSpace: 'nowrap' }}>
                      ${Math.round(v.cantidadFrascos * v.precioVenta).toLocaleString('es-AR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost" style={{ marginTop: 14, width: '100%' }} onClick={() => setHistorialAbierto(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
