import { useState, useEffect, useRef } from 'react'
import { ref, onValue, update, push as fbPush } from 'firebase/database'
import { db } from '../firebase.js'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps'

const MAPS_KEY    = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const ROSARIO_POS = { lat: -32.9468, lng: -60.6393 }

const TIER_CONFIG = {
  1: { label: '🏊 Exc. Piscinas', color: '#1a6bff', bg: '#e8f1ff', glyph: '🏊' },
  2: { label: '🔧 Ferretería',    color: '#10b981', bg: '#ecfdf5', glyph: '🔧' },
  3: { label: '📦 Distribuidor',  color: '#f59e0b', bg: '#fffbeb', glyph: '📦' },
}

function TierBadge({ tier }) {
  const t = TIER_CONFIG[tier] || TIER_CONFIG[1]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      background: t.bg, color: t.color,
      fontSize: 11, fontWeight: 700,
    }}>
      {t.label}
    </span>
  )
}

async function geocodificar(localidad) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(localidad + ', Argentina')}&key=${MAPS_KEY}`
  const res  = await fetch(url)
  const data = await res.json()
  if (data.results?.length > 0) {
    const { lat, lng } = data.results[0].geometry.location
    const j = () => Math.random() * 0.01 - 0.005
    return { lat: lat + j(), lng: lng + j() }
  }
  return null
}

// ── Solapa A: Mis Clientes ────────────────────────────────────────────────────
function MisClientes() {
  const [clientes, setClientes]       = useState({})
  const [selected, setSelected]       = useState(null)
  const [filtroLoc, setFiltroLoc]     = useState('')
  const [filtroTier, setFiltroTier]   = useState([])
  const [geocoding, setGeocoding]     = useState(false)

  useEffect(() => {
    return onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
  }, [])

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
    setFiltroTier(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])
  }

  const localidades = [...new Set(Object.values(clientes).map(c => c.localidad).filter(Boolean))].sort()

  const clientesConUbic = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c, tier: c.tier || 1 }))
    .filter(c => c.lat && c.lng)
    .filter(c => !filtroLoc  || c.localidad === filtroLoc)
    .filter(c => filtroTier.length === 0 || filtroTier.includes(c.tier))

  const sinUbicacion = Object.entries(clientes).filter(([, c]) => !c.lat && !c.lng)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" style={{ maxWidth: 200 }} value={filtroLoc}
          onChange={e => setFiltroLoc(e.target.value)}>
          <option value="">Todas las localidades</option>
          {localidades.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="tier-pills" style={{ margin: 0 }}>
          {[1,2,3].map(tier => {
            const cfg = TIER_CONFIG[tier]
            const act = ['active-1','active-2','active-3'][tier-1]
            return (
              <button key={tier} className={`tier-pill ${filtroTier.includes(tier) ? act : ''}`}
                onClick={() => toggleTier(tier)}>
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        {[1,2,3].map(tier => {
          const cfg = TIER_CONFIG[tier]
          return (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: cfg.color }} />
              {cfg.label}
            </div>
          )
        })}
      </div>

      {/* Mapa */}
      <div style={{ borderRadius: 14, overflow: 'hidden', height: 450, border: '1px solid var(--border)' }}>
        {MAPS_KEY ? (
          <Map defaultCenter={ROSARIO_POS} defaultZoom={9} mapId="bichover-clientes">
            {clientesConUbic.map(c => {
              const cfg = TIER_CONFIG[c.tier]
              return (
                <AdvancedMarker
                  key={c.id}
                  position={{ lat: c.lat, lng: c.lng }}
                  onClick={() => setSelected(c)}
                >
                  <Pin background={cfg.color} glyphColor="#fff" borderColor={cfg.color}>
                    <span style={{ fontSize: 12 }}>{cfg.glyph}</span>
                  </Pin>
                </AdvancedMarker>
              )
            })}
            {selected && (
              <InfoWindow
                position={{ lat: selected.lat, lng: selected.lng }}
                onCloseClick={() => setSelected(null)}
              >
                <div style={{ fontFamily: 'Outfit, sans-serif', minWidth: 180, padding: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{selected.razonSocial}</div>
                  <div style={{ marginBottom: 6 }}><TierBadge tier={selected.tier} /></div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>📍 {selected.localidad}</div>
                  {selected.telefono && <div style={{ fontSize: 12, color: '#64748b' }}>📞 {selected.telefono}</div>}
                  <div style={{ fontSize: 12, color: '#1a6bff', fontWeight: 700, marginTop: 4 }}>
                    📦 {selected.cantidadFrascos || 0} frascos
                  </div>
                  {selected.fechaUltimaCompra && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>🗓 {selected.fechaUltimaCompra}</div>
                  )}
                </div>
              </InfoWindow>
            )}
          </Map>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f0f4fa' }}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
              <p style={{ fontWeight: 600 }}>Configurá la Google Maps API Key para ver el mapa</p>
            </div>
          </div>
        )}
      </div>

      {/* Sin ubicación */}
      {sinUbicacion.length > 0 && (
        <div className="card mt-16">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="fw-700" style={{ fontSize: 14 }}>
              ⚪ {sinUbicacion.length} clientes sin ubicación
            </span>
            <button className="btn btn-ghost btn-sm" onClick={geocodificarTodos} disabled={geocoding}>
              {geocoding ? '⏳ Geocodificando...' : '📍 Geocodificar todos'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sinUbicacion.map(([id, c]) => (
              <span key={id} style={{
                background: 'var(--bg)', borderRadius: 8, padding: '4px 10px',
                fontSize: 12, fontWeight: 600, color: 'var(--muted)',
              }}>
                {c.razonSocial} · {c.localidad}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Solapa B: Prospectar Zona ─────────────────────────────────────────────────
const QUERIES_POR_TIER = {
  1: [
    'artículos de piscina {loc} Argentina',
    'piletas y piscinas {loc} Argentina',
    'productos cloro piscina {loc} Argentina',
  ],
  2: [
    'ferretería {loc} Argentina',
    'productos de limpieza {loc} Argentina',
    'casa de limpieza {loc} Argentina',
  ],
  3: [
    'distribuidora {loc} Argentina',
    'mayorista {loc} Argentina',
    'distribuidor productos {loc} Argentina',
  ],
}

function RoutePolyline({ paradas }) {
  const map = useMap()
  const polyRef = useRef(null)

  useEffect(() => {
    if (!map) return
    if (polyRef.current) polyRef.current.setMap(null)
    if (paradas.length < 2) return

    const path = paradas.map(p => ({ lat: p.location.latitude, lng: p.location.longitude }))
    polyRef.current = new window.google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#1a6bff',
      strokeOpacity: 0.8,
      strokeWeight: 3,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '20px' }],
    })
    polyRef.current.setMap(map)

    return () => { if (polyRef.current) polyRef.current.setMap(null) }
  }, [map, paradas])

  return null
}

function ProspectarZona({ clientes }) {
  const [localidad, setLocalidad]   = useState('')
  const [tiersAct, setTiersAct]     = useState([1, 2, 3])
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando]     = useState(false)
  const [error, setError]           = useState('')
  const [ruta, setRuta]             = useState([])
  const [selectedRes, setSelectedRes]   = useState(null)
  const [modalCliente, setModalCliente] = useState(null)
  const [modalVincular, setModalVincular] = useState(null)

  function toggleTierAct(t) {
    setTiersAct(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])
  }

  async function buscar(e) {
    e.preventDefault()
    if (!localidad.trim()) return
    if (!MAPS_KEY) { setError('Configurá la VITE_GOOGLE_MAPS_API_KEY'); return }
    setBuscando(true)
    setResultados([])
    setError('')

    // Geocodificar la localidad primero para restringir búsqueda a Argentina
    let locationBias = null
    try {
      const geoRes  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(localidad + ', Argentina')}&key=${MAPS_KEY}`)
      const geoData = await geoRes.json()
      if (geoData.results?.length > 0) {
        const loc = geoData.results[0].geometry.location
        locationBias = { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 30000 } }
      }
    } catch { /* continuar sin bias */ }

    const seen = new Set()
    const resultadosTodos = []
    const nombresClientes = Object.values(clientes).map(c => c.razonSocial?.toLowerCase())

    for (const tier of tiersAct) {
      for (const queryTpl of QUERIES_POR_TIER[tier]) {
        const query = queryTpl.replace('{loc}', localidad) + ' Argentina'
        try {
          const body = { textQuery: query }
          if (locationBias) body.locationBias = locationBias
          const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': MAPS_KEY,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.businessStatus',
            },
            body: JSON.stringify(body),
          })
          const data = await res.json()
          const places = data.places || []
          for (const p of places) {
            if (p.businessStatus !== 'OPERATIONAL') continue
            if (seen.has(p.id)) continue
            const nombre = p.displayName?.text?.toLowerCase() || ''
            if (nombresClientes.some(n => n && nombre && n.includes(nombre.slice(0, 10)))) continue
            seen.add(p.id)
            resultadosTodos.push({ ...p, tier })
          }
        } catch { /* ignorar errores por query */ }
      }
    }

    if (resultadosTodos.length === 0) {
      setError(`No encontramos negocios de esos tipos en ${localidad}. Probá con el nombre del municipio principal de la zona.`)
    }
    setResultados(resultadosTodos)
    setBuscando(false)
  }

  function agregarARuta(r) {
    if (ruta.find(p => p.id === r.id)) return
    setRuta(prev => [...prev, r])
  }

  function quitarDeRuta(id) {
    setRuta(prev => prev.filter(p => p.id !== id))
  }

  function moverRuta(idx, dir) {
    const nueva = [...ruta]
    const target = idx + dir
    if (target < 0 || target >= nueva.length) return
    ;[nueva[idx], nueva[target]] = [nueva[target], nueva[idx]]
    setRuta(nueva)
  }

  function abrirEnMaps() {
    if (ruta.length < 1) return
    const stops = ruta.map(p => {
      const addr = p.formattedAddress || `${p.location.latitude},${p.location.longitude}`
      return encodeURIComponent(addr)
    })
    const url = `https://www.google.com/maps/dir/${stops.join('/')}`
    window.open(url, '_blank')
  }

  const tieneRuta = ruta.length > 0
  const ROSARIO   = { lat: -32.9468, lng: -60.6393 }

  const centroMapa = resultados.length > 0 && resultados[0].location
    ? { lat: resultados[0].location.latitude, lng: resultados[0].location.longitude }
    : ROSARIO

  return (
    <div>
      {/* Panel de búsqueda */}
      <div className="card mb-16">
        <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>🔍 Buscar negocios potenciales</h3>
        <form onSubmit={buscar}>
          <div className="form-group">
            <label className="form-label">Localidad o ciudad</label>
            <input className="form-input" placeholder="Ej: Rosario, Villa Gobernador Gálvez..."
              value={localidad} onChange={e => setLocalidad(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Tipos de negocio</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { tier: 1, label: '🏊 Exclusivo Piscinas / Cloro' },
                { tier: 2, label: '🔧 Ferreterías / Limpieza' },
                { tier: 3, label: '📦 Distribuidores / Mayoristas' },
              ].map(({ tier, label }) => (
                <label key={tier} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  <input type="checkbox" checked={tiersAct.includes(tier)}
                    onChange={() => toggleTierAct(tier)}
                    style={{ width: 16, height: 16, accentColor: 'var(--blue)' }} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={buscando}>
            {buscando ? '⏳ Buscando...' : '🔍 Buscar negocios'}
          </button>
        </form>
      </div>

      {/* Mapa de resultados */}
      <div style={{ borderRadius: 14, overflow: 'hidden', height: 400, border: '1px solid var(--border)', marginBottom: 16 }}>
        {MAPS_KEY ? (
          <Map defaultCenter={centroMapa} defaultZoom={12} mapId="bichover-prospectar" key={localidad}>
            {resultados.map((r, i) => {
              if (!r.location) return null
              const cfg   = TIER_CONFIG[r.tier]
              const enRuta = ruta.find(p => p.id === r.id)
              const orden  = enRuta ? ruta.indexOf(enRuta) + 1 : null
              return (
                <AdvancedMarker
                  key={r.id}
                  position={{ lat: r.location.latitude, lng: r.location.longitude }}
                  onClick={() => setSelectedRes(r)}
                >
                  <Pin
                    background={enRuta ? cfg.color : '#94a3b8'}
                    glyphColor="#fff"
                    borderColor={enRuta ? cfg.color : '#64748b'}
                  >
                    {orden ? <span style={{ fontSize: 11, fontWeight: 900 }}>{orden}</span>
                           : <span style={{ fontSize: 11 }}>{cfg.glyph}</span>}
                  </Pin>
                </AdvancedMarker>
              )
            })}
            {selectedRes && selectedRes.location && (
              <InfoWindow
                position={{ lat: selectedRes.location.latitude, lng: selectedRes.location.longitude }}
                onCloseClick={() => setSelectedRes(null)}
              >
                <div style={{ fontFamily: 'Outfit, sans-serif', minWidth: 180, padding: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
                    {selectedRes.displayName?.text}
                  </div>
                  <TierBadge tier={selectedRes.tier} />
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{selectedRes.formattedAddress}</div>
                  {selectedRes.nationalPhoneNumber && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>📞 {selectedRes.nationalPhoneNumber}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { agregarARuta(selectedRes); setSelectedRes(null) }}>➕ Ruta</button>
                    <button style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { setModalCliente(selectedRes); setSelectedRes(null) }}>💾 Nuevo cliente</button>
                    <button style={{ background: 'var(--purple)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { setModalVincular(selectedRes); setSelectedRes(null) }}>🔗 Vincular existente</button>
                  </div>
                </div>
              </InfoWindow>
            )}
            <RoutePolyline paradas={ruta} />
          </Map>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f0f4fa' }}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
              <p style={{ fontWeight: 600 }}>Ingresá tu localidad y buscá negocios potenciales</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>Necesitás configurar la Google Maps API Key</p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#991b1b', marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="card mb-16">
          <div className="fw-800 mb-12" style={{ fontSize: 15 }}>
            {resultados.length} negocios encontrados
          </div>
          {resultados.map(r => {
            const cfg    = TIER_CONFIG[r.tier]
            const enRuta = !!ruta.find(p => p.id === r.id)
            return (
              <div key={r.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 20 }}>{cfg.glyph}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fw-700" style={{ fontSize: 14 }}>{r.displayName?.text}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{r.formattedAddress}</div>
                  {r.nationalPhoneNumber && (
                    <div className="text-muted" style={{ fontSize: 12 }}>📞 {r.nationalPhoneNumber}</div>
                  )}
                  <div style={{ marginTop: 4 }}><TierBadge tier={r.tier} /></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className={`btn btn-sm ${enRuta ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => enRuta ? quitarDeRuta(r.id) : agregarARuta(r)}>
                    {enRuta ? '✓ En ruta' : '➕ Ruta'}
                  </button>
                  <button className="btn btn-success btn-sm"
                    onClick={() => setModalCliente(r)}>
                    💾 Nuevo
                  </button>
                  <button className="btn btn-sm" style={{ background: '#f3f0ff', color: 'var(--purple)', border: '1px solid var(--purple)', fontWeight: 700 }}
                    onClick={() => setModalVincular(r)}>
                    🔗 Vincular
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Panel de Ruta */}
      {tieneRuta && (
        <div className="card" style={{ background: 'var(--navy)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div className="fw-800" style={{ color: '#fff', fontSize: 16 }}>
              🗺️ Mi ruta — {ruta.length} parada{ruta.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={abrirEnMaps}>
                📱 Abrir en Google Maps
              </button>
              <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none' }}
                onClick={() => setRuta([])}>
                🗑 Limpiar
              </button>
            </div>
          </div>

          {ruta.map((p, i) => {
            const cfg = TIER_CONFIG[p.tier]
            return (
              <div key={p.id} style={{
                background: 'rgba(255,255,255,.08)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: cfg.color, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 900, flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{p.displayName?.text}</div>
                  <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{p.formattedAddress}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => moverRuta(i, -1)}>↑</button>
                  <button style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => moverRuta(i, 1)}>↓</button>
                  <button style={{ background: 'rgba(239,68,68,.3)', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => quitarDeRuta(p.id)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal guardar como cliente */}
      {modalCliente && (
        <GuardarClienteModal negocio={modalCliente} onClose={() => setModalCliente(null)} />
      )}
      {modalVincular && (
        <VincularClienteModal negocio={modalVincular} clientes={clientes} onClose={() => setModalVincular(null)} />
      )}
    </div>
  )
}

function GuardarClienteModal({ negocio, onClose }) {
  const [form, setForm] = useState({
    razonSocial: negocio.displayName?.text || '',
    localidad:   '',
    direccion:   negocio.formattedAddress || '',
    telefono:    negocio.nationalPhoneNumber || '',
    tier:        negocio.tier || 1,
  })
  const [loading, setLoading] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const coords = negocio.location
        ? { lat: negocio.location.latitude, lng: negocio.location.longitude }
        : { lat: null, lng: null }

      await fbPush(ref(db, 'clientes'), {
        razonSocial: form.razonSocial,
        localidad: form.localidad,
        direccion: form.direccion,
        telefono: form.telefono,
        tier: Number(form.tier),
        cantidadFrascos: 0,
        fechaUltimaCompra: null,
        usuario: 'Seba',
        timestamp: Date.now(),
        ...coords,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">💾 Guardar como cliente</div>
        <form onSubmit={guardar}>
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
            <label className="form-label">Tipo</label>
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
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function VincularClienteModal({ negocio, clientes, onClose }) {
  const [clienteSelec, setClienteSelec] = useState('')
  const [loading, setLoading] = useState(false)

  const lista = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => a.razonSocial?.localeCompare(b.razonSocial))

  async function vincular(e) {
    e.preventDefault()
    if (!clienteSelec) return
    setLoading(true)
    try {
      const datos = {}
      if (negocio.formattedAddress)   datos.direccion = negocio.formattedAddress
      if (negocio.nationalPhoneNumber) datos.telefono  = negocio.nationalPhoneNumber
      if (negocio.location) {
        datos.lat = negocio.location.latitude
        datos.lng = negocio.location.longitude
      }
      await update(ref(db, `clientes/${clienteSelec}`), datos)
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">🔗 Vincular con cliente existente</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          Se van a completar los datos de dirección, teléfono y ubicación GPS del cliente seleccionado con la info de <strong>{negocio.displayName?.text}</strong>.
        </p>
        <form onSubmit={vincular}>
          <div className="form-group">
            <label className="form-label">Seleccionar cliente a actualizar</label>
            <select className="form-select" value={clienteSelec}
              onChange={e => setClienteSelec(e.target.value)} required>
              <option value="">— Seleccionar —</option>
              {lista.map(c => (
                <option key={c.id} value={c.id}>{c.razonSocial} — {c.localidad}</option>
              ))}
            </select>
          </div>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
            <div><strong>Se actualizará:</strong></div>
            {negocio.formattedAddress    && <div>📍 Dirección: {negocio.formattedAddress}</div>}
            {negocio.nationalPhoneNumber && <div>📞 Teléfono: {negocio.nationalPhoneNumber}</div>}
            {negocio.location            && <div>🗺 Coordenadas GPS: sí</div>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Vinculando...' : '🔗 Vincular y actualizar'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Componente principal Mapa ─────────────────────────────────────────────────
export default function Mapa() {
  const [tab, setTab]           = useState('clientes')
  const [clientes, setClientes] = useState({})

  useEffect(() => {
    return onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
  }, [])

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">🗺️ Mapa</h1>
      </div>

      <div className="tabs mb-16">
        <button className={`tab-btn ${tab === 'clientes' ? 'active' : ''}`}
          onClick={() => setTab('clientes')}>
          👥 Mis Clientes
        </button>
        <button className={`tab-btn ${tab === 'prospectar' ? 'active' : ''}`}
          onClick={() => setTab('prospectar')}>
          🔍 Prospectar Zona
        </button>
      </div>

      {MAPS_KEY ? (
        <APIProvider apiKey={MAPS_KEY}>
          {tab === 'clientes'   && <MisClientes />}
          {tab === 'prospectar' && <ProspectarZona clientes={clientes} />}
        </APIProvider>
      ) : (
        <div>
          {tab === 'clientes'   && <MisClientes />}
          {tab === 'prospectar' && <ProspectarZona clientes={clientes} />}
        </div>
      )}
    </div>
  )
}
