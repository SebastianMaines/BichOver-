import { useState, useEffect, useRef } from 'react'
import { ref, onValue, update, push as fbPush, remove, set } from 'firebase/database'
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

function waUrl(tel) {
  if (!tel) return null
  const d = tel.replace(/\D/g, '')
  if (!d) return null
  const num = d.startsWith('54') ? d : d.startsWith('0') ? '54' + d.slice(1) : '54' + d
  return `https://wa.me/${num}`
}

function mapsDir(lat, lng, addr) {
  if (lat && lng) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  if (addr)       return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`
  return null
}

function ContactoBtns({ tel, lat, lng, addr, small }) {
  const wa  = waUrl(tel)
  const dir = mapsDir(lat, lng, addr)
  if (!wa && !dir) return null
  const sz = small ? 11 : 13
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {wa  && <a href={wa}  target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#25d366', color: '#fff', borderRadius: 6, padding: small ? '4px 8px' : '6px 12px', fontSize: sz, fontWeight: 700, textDecoration: 'none' }}>
        💬 WhatsApp
      </a>}
      {dir && <a href={dir} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#4285f4', color: '#fff', borderRadius: 6, padding: small ? '4px 8px' : '6px 12px', fontSize: sz, fontWeight: 700, textDecoration: 'none' }}>
        🗺 Cómo llegar
      </a>}
    </div>
  )
}

const ESTADOS_PROSPECTO = [
  { value: 'interesado',    label: '⭐ Le interesó',          color: '#f59e0b' },
  { value: 'info',          label: '📧 Pidió información',    color: '#06b6d4' },
  { value: 'no_interesado', label: '😐 No le interesó',      color: '#f97316' },
  { value: 'rechazado',     label: '❌ Rechazó',             color: '#ef4444' },
]

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
function AgregarClienteModal({ onClose }) {
  const [query, setQuery]       = useState('')
  const [sugerencias, setSugs]  = useState([])
  const [seleccionado, setSel]  = useState(null)
  const [localidad, setLocalidad] = useState('')
  const [tier, setTier]         = useState(1)
  const [loading, setLoading]   = useState(false)
  const debRef = useRef(null)

  async function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    setSel(null)
    if (debRef.current) clearTimeout(debRef.current)
    if (val.length < 2) { setSugs([]); return }
    debRef.current = setTimeout(async () => {
      if (!MAPS_KEY) return
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': MAPS_KEY },
          body: JSON.stringify({ input: val, includedRegionCodes: ['ar'] }),
        })
        const data = await res.json()
        setSugs((data.suggestions || []).map(s => s.placePrediction).filter(Boolean))
      } catch { /* ignore */ }
    }, 300)
  }

  async function seleccionar(pred) {
    setSugs([])
    const nombre = pred.structuredFormat?.mainText?.text || pred.text?.text || ''
    setQuery(nombre)
    try {
      const resourceName = pred.place || `places/${pred.placeId}`
      const res = await fetch(`https://places.googleapis.com/v1/${resourceName}`, {
        headers: { 'X-Goog-Api-Key': MAPS_KEY, 'X-Goog-FieldMask': 'displayName,formattedAddress,location,nationalPhoneNumber,addressComponents' },
      })
      const data = await res.json()
      const loc = data.addressComponents?.find(c => c.types?.includes('locality'))?.longText || ''
      setLocalidad(loc)
      setSel(data)
    } catch { /* ignore */ }
  }

  async function guardar(e) {
    e.preventDefault()
    if (!seleccionado) return
    setLoading(true)
    await fbPush(ref(db, 'clientes'), {
      razonSocial: seleccionado.displayName?.text || query,
      localidad,
      direccion: seleccionado.formattedAddress || '',
      telefono: seleccionado.nationalPhoneNumber || '',
      tier: Number(tier),
      cantidadFrascos: 0,
      fechaUltimaCompra: null,
      timestamp: Date.now(),
      lat: seleccionado.location?.latitude ?? null,
      lng: seleccionado.location?.longitude ?? null,
    })
    setLoading(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">➕ Agregar cliente</div>
        <form onSubmit={guardar}>
          <div className="form-group">
            <label className="form-label">Buscar negocio</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" autoComplete="off"
                placeholder="Nombre del negocio..."
                value={query} onChange={handleQueryChange} />
              {sugerencias.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.14)', marginTop: 2, maxHeight: 220, overflowY: 'auto' }}>
                  {sugerencias.map(s => (
                    <div key={s.placeId} onMouseDown={() => seleccionar(s)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{s.structuredFormat?.mainText?.text || s.text?.text}</div>
                      {s.structuredFormat?.secondaryText?.text && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.structuredFormat.secondaryText.text}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {seleccionado && (
            <>
              <div className="form-group">
                <label className="form-label">Localidad</label>
                <input className="form-input" value={localidad}
                  onChange={e => setLocalidad(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de cliente</label>
                <select className="form-select" value={tier} onChange={e => setTier(Number(e.target.value))}>
                  <option value={1}>🏊 Exclusivo Piscinas</option>
                  <option value={2}>🔧 Ferretería / Limpieza</option>
                  <option value={3}>📦 Distribuidor</option>
                </select>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
                {seleccionado.formattedAddress && <div>📍 {seleccionado.formattedAddress}</div>}
                {seleccionado.nationalPhoneNumber && <div>📞 {seleccionado.nationalPhoneNumber}</div>}
                {seleccionado.location && <div>🗺 GPS: sí</div>}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" type="submit" disabled={loading || !seleccionado} style={{ flex: 1 }}>
              {loading ? 'Guardando...' : '💾 Agregar cliente'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MisClientes() {
  const [clientes, setClientes]         = useState({})
  const [selected, setSelected]         = useState(null)
  const [filtroLoc, setFiltroLoc]       = useState('')
  const [filtroTier, setFiltroTier]     = useState([])
  const [geocoding, setGeocoding]       = useState(false)
  const [showAgregar, setShowAgregar]   = useState(false)

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
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
          onClick={() => setShowAgregar(true)}>
          ➕ Agregar cliente
        </button>
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
                  <ContactoBtns tel={selected.telefono} lat={selected.lat} lng={selected.lng} addr={selected.direccion} small />
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

      {showAgregar && <AgregarClienteModal onClose={() => setShowAgregar(false)} />}

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
    'mayorista artículos de piscina cloro {loc} Argentina',
    'distribuidora productos de limpieza {loc} Argentina',
    'mayorista forraje alimento animal {loc} Argentina',
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
  const [acInput, setAcInput]         = useState('')
  const [lugarSelec, setLugarSelec]   = useState(null)
  const [sugerencias, setSugerencias] = useState([])
  const [mostrarDrop, setMostrarDrop] = useState(false)
  const [tiersAct, setTiersAct]       = useState([1, 2, 3])
  const [resultados, setResultados]   = useState([])
  const [buscando, setBuscando]       = useState(false)
  const [error, setError]             = useState('')
  const [ruta, setRuta]               = useState([])
  const [selectedRes, setSelectedRes]   = useState(null)
  const [modalCliente, setModalCliente] = useState(null)
  const [modalVincular, setModalVincular] = useState(null)
  const [nombreRuta, setNombreRuta]   = useState('')
  const [guardandoRuta, setGuardandoRuta] = useState(false)
  const [rutaGuardadaMsg, setRutaGuardadaMsg] = useState('')
  const [prospectos, setProspectos]     = useState({})
  const [modalVisita, setModalVisita]   = useState(null)
  const [filtroPin, setFiltroPin]       = useState('todos')
  const debounceRef = useRef(null)
  const dropRef     = useRef(null)

  useEffect(() => {
    return onValue(ref(db, 'prospectos'), s => setProspectos(s.exists() ? s.val() : {}))
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setMostrarDrop(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleAcChange(e) {
    const val = e.target.value
    setAcInput(val)
    setLugarSelec(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 2) { setSugerencias([]); setMostrarDrop(false); return }
    debounceRef.current = setTimeout(async () => {
      if (!MAPS_KEY) return
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': MAPS_KEY },
          body: JSON.stringify({
            input: val,
            includedRegionCodes: ['ar'],
            includedPrimaryTypes: ['locality', 'sublocality', 'neighborhood', 'administrative_area_level_2', 'administrative_area_level_3'],
          }),
        })
        const data = await res.json()
        const preds = (data.suggestions || []).map(s => s.placePrediction).filter(Boolean)
        setSugerencias(preds)
        setMostrarDrop(preds.length > 0)
      } catch { /* ignore */ }
    }, 300)
  }

  async function seleccionarLugar(pred) {
    setMostrarDrop(false)
    const nombre = pred.structuredFormat?.mainText?.text || pred.text?.text || ''
    setAcInput(nombre)
    try {
      const resourceName = pred.place || `places/${pred.placeId}`
      const res = await fetch(`https://places.googleapis.com/v1/${resourceName}`, {
        headers: { 'X-Goog-Api-Key': MAPS_KEY, 'X-Goog-FieldMask': 'location,types' },
      })
      const data = await res.json()
      const tipos = data.types || []
      const esBarrio = tipos.some(t => ['neighborhood', 'sublocality', 'sublocality_level_1', 'sublocality_level_2'].includes(t))
      const lat = data.location?.latitude
      const lng = data.location?.longitude
      if (lat && lng) {
        setLugarSelec({ nombre, lat, lng, radio: esBarrio ? 5000 : 25000 })
      } else {
        // fallback: geocode the name
        const geoRes  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(nombre + ', Argentina')}&key=${MAPS_KEY}`)
        const geoData = await geoRes.json()
        if (geoData.results?.length > 0) {
          const loc = geoData.results[0].geometry.location
          setLugarSelec({ nombre, lat: loc.lat, lng: loc.lng, radio: 8000 })
        }
      }
    } catch { /* ignore */ }
  }

  function toggleTierAct(t) {
    setTiersAct(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])
  }

  async function buscar(e) {
    e.preventDefault()
    if (!lugarSelec?.lat) { setError('Seleccioná una zona del listado de sugerencias'); return }
    if (!MAPS_KEY) { setError('Configurá la VITE_GOOGLE_MAPS_API_KEY'); return }
    setBuscando(true)
    setResultados([])
    setError('')

    const locationBias = {
      circle: { center: { latitude: lugarSelec.lat, longitude: lugarSelec.lng }, radius: lugarSelec.radio },
    }

    const seen = new Set()
    const resultadosTodos = []
    const coordsClientes = Object.values(clientes).filter(c => c.lat && c.lng).map(c => ({ lat: c.lat, lng: c.lng }))
    const nombresClientes = Object.values(clientes).map(c => (c.razonSocial || '').toLowerCase().trim()).filter(n => n.length >= 12)

    function esClienteCoincidente(place) {
      const nombre = (place.displayName?.text || '').toLowerCase().trim()
      // Coincidencia por nombre: uno contiene al otro (solo si el nombre del cliente tiene ≥12 chars)
      if (nombresClientes.some(nc => nombre.includes(nc) || nc.includes(nombre))) return true
      // Coincidencia por coordenadas GPS (menos de 100m de distancia)
      if (place.location) {
        const { latitude: pLat, longitude: pLng } = place.location
        if (coordsClientes.some(c => Math.abs(c.lat - pLat) < 0.001 && Math.abs(c.lng - pLng) < 0.001)) return true
      }
      return false
    }

    for (const tier of tiersAct) {
      for (const queryTpl of QUERIES_POR_TIER[tier]) {
        const query = queryTpl.replace('{loc}', lugarSelec.nombre)
        try {
          const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': MAPS_KEY,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.businessStatus',
            },
            body: JSON.stringify({ textQuery: query, locationBias }),
          })
          const data = await res.json()
          const places = data.places || []
          for (const p of places) {
            if (p.businessStatus !== 'OPERATIONAL') continue
            if (seen.has(p.id)) continue
            const esCliente = esClienteCoincidente(p)
            seen.add(p.id)
            resultadosTodos.push({ ...p, tier, esCliente })
          }
        } catch { /* ignorar errores por query */ }
      }
    }

    if (resultadosTodos.length === 0) {
      setError(`No encontramos negocios de esos tipos en ${lugarSelec.nombre}. Probá con otra zona o municipio cercano.`)
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

  const centroMapa = lugarSelec?.lat
    ? { lat: lugarSelec.lat, lng: lugarSelec.lng }
    : ROSARIO
  const zoomMapa = lugarSelec?.radio ? (lugarSelec.radio <= 5000 ? 14 : 12) : 11

  const FILTROS_PIN = [
    { value: 'todos',       label: 'Todos',          color: '#64748b', bg: 'var(--bg)' },
    { value: 'clientes',    label: '🟢 Clientes',    color: '#10b981', bg: '#ecfdf5' },
    { value: 'visitados',   label: '🔴 Visitados',   color: '#ef4444', bg: '#fef2f2' },
    { value: 'sin_visitar', label: '⚪ Sin visitar', color: '#94a3b8', bg: '#f8fafc' },
  ]

  function matchFiltro(r) {
    if (filtroPin === 'todos')       return true
    if (filtroPin === 'clientes')    return r.esCliente
    if (filtroPin === 'visitados')   return !r.esCliente && !!prospectos[r.id]
    if (filtroPin === 'sin_visitar') return !r.esCliente && !prospectos[r.id]
    return true
  }

  const resultadosFiltrados = resultados.filter(matchFiltro)

  return (
    <div>
      {/* Panel de búsqueda */}
      <div className="card mb-16">
        <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>🔍 Buscar negocios potenciales</h3>
        <form onSubmit={buscar}>
          <div className="form-group">
            <label className="form-label">Localidad o barrio</label>
            <div style={{ position: 'relative' }} ref={dropRef}>
              {lugarSelec ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e8f1ff', border: '1.5px solid var(--blue)', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', flex: 1 }}>📍 {lugarSelec.nombre}</span>
                  <button type="button"
                    onClick={() => { setLugarSelec(null); setAcInput(''); setSugerencias([]) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 900, fontSize: 16, padding: '0 2px', lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              ) : (
                <input className="form-input"
                  placeholder="Ej: Fisherton, Villa Gobernador Gálvez..."
                  value={acInput}
                  onChange={handleAcChange}
                  onFocus={() => sugerencias.length > 0 && setMostrarDrop(true)}
                  autoComplete="off"
                />
              )}
              {mostrarDrop && sugerencias.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,.14)', marginTop: 2, maxHeight: 240, overflowY: 'auto',
                }}>
                  {sugerencias.map(s => (
                    <div key={s.placeId}
                      onMouseDown={() => seleccionarLugar(s)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {s.structuredFormat?.mainText?.text || s.text?.text}
                      </div>
                      {s.structuredFormat?.secondaryText?.text && (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.structuredFormat.secondaryText.text}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Tipos de negocio</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { tier: 1, label: '🏊 Exclusivo Piscinas / Cloro' },
                { tier: 2, label: '🔧 Ferreterías / Limpieza' },
                { tier: 3, label: '📦 Distribuidores / Mayoristas (piscina, cloro, limpieza, forraje)' },
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
          <button className="btn btn-primary" type="submit" disabled={buscando || !lugarSelec}>
            {buscando ? '⏳ Buscando...' : '🔍 Buscar negocios'}
          </button>
        </form>
      </div>

      {/* Mapa de resultados */}
      <div style={{ borderRadius: 14, overflow: 'hidden', height: 400, border: '1px solid var(--border)', marginBottom: 16 }}>
        {MAPS_KEY ? (
          <Map defaultCenter={centroMapa} defaultZoom={zoomMapa} mapId="bichover-prospectar" key={lugarSelec?.nombre || ''}>
            {resultadosFiltrados.map((r, i) => {
              if (!r.location) return null
              const cfg      = TIER_CONFIG[r.tier]
              const enRuta   = ruta.find(p => p.id === r.id)
              const orden    = enRuta ? ruta.indexOf(enRuta) + 1 : null
              const prospecto = prospectos[r.id]
              const estConfig = prospecto ? ESTADOS_PROSPECTO.find(e => e.value === prospecto.estado) : null
              let pinBg = '#94a3b8', pinBorder = '#64748b', pinGlyph = cfg.glyph
              if (enRuta)       { pinBg = cfg.color; pinBorder = cfg.color }
              if (r.esCliente)  { pinBg = '#10b981'; pinBorder = '#059669'; pinGlyph = '✓' }
              if (estConfig)    { pinBg = estConfig.color; pinBorder = estConfig.color }
              return (
                <AdvancedMarker
                  key={r.id}
                  position={{ lat: r.location.latitude, lng: r.location.longitude }}
                  onClick={() => setSelectedRes(r)}
                >
                  <Pin background={pinBg} glyphColor="#fff" borderColor={pinBorder}>
                    {orden
                      ? <span style={{ fontSize: 11, fontWeight: 900 }}>{orden}</span>
                      : <span style={{ fontSize: 11 }}>{pinGlyph}</span>}
                  </Pin>
                </AdvancedMarker>
              )
            })}
            {selectedRes && selectedRes.location && (
              <InfoWindow
                position={{ lat: selectedRes.location.latitude, lng: selectedRes.location.longitude }}
                onCloseClick={() => setSelectedRes(null)}
              >
                <div style={{ fontFamily: 'Outfit, sans-serif', minWidth: 190, padding: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
                    {selectedRes.displayName?.text}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <TierBadge tier={selectedRes.tier} />
                    {selectedRes.esCliente && (
                      <span style={{ background: '#10b981', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>✓ Cliente</span>
                    )}
                    {(() => { const p = prospectos[selectedRes.id]; const e = p && ESTADOS_PROSPECTO.find(x => x.value === p.estado); return e ? <span style={{ background: e.color, color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{e.label}</span> : null })()}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedRes.formattedAddress}</div>
                  {selectedRes.nationalPhoneNumber && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>📞 {selectedRes.nationalPhoneNumber}</div>
                  )}
                  {prospectos[selectedRes.id]?.notas && (
                    <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>{prospectos[selectedRes.id].notas}</div>
                  )}
                  <ContactoBtns
                    tel={selectedRes.nationalPhoneNumber}
                    lat={selectedRes.location?.latitude} lng={selectedRes.location?.longitude}
                    addr={selectedRes.formattedAddress} small />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { agregarARuta(selectedRes); setSelectedRes(null) }}>➕ Ruta</button>
                    <button style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { setModalVisita(selectedRes); setSelectedRes(null) }}>📝 Visita</button>
                    {!selectedRes.esCliente && (
                      <button style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => { setModalCliente(selectedRes); setSelectedRes(null) }}>💾 Nuevo</button>
                    )}
                    <button style={{ background: 'var(--purple)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => { setModalVincular(selectedRes); setSelectedRes(null) }}>🔗 Vincular</button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div className="fw-800" style={{ fontSize: 15 }}>
              {resultadosFiltrados.length} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 13 }}>de {resultados.length} negocios</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTROS_PIN.map(f => (
                <button key={f.value}
                  onClick={() => setFiltroPin(f.value)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${filtroPin === f.value ? f.color : 'var(--border)'}`,
                    background: filtroPin === f.value ? f.bg : 'var(--white)',
                    color: filtroPin === f.value ? f.color : 'var(--muted)',
                    transition: 'all .15s',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {resultadosFiltrados.map(r => {
            const cfg       = TIER_CONFIG[r.tier]
            const enRuta    = !!ruta.find(p => p.id === r.id)
            const prospecto = prospectos[r.id]
            const estConfig = prospecto ? ESTADOS_PROSPECTO.find(e => e.value === prospecto.estado) : null
            const borderLeft = r.esCliente ? '4px solid #10b981' : estConfig ? `4px solid ${estConfig.color}` : '4px solid transparent'
            return (
              <div key={r.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', borderLeft, borderRadius: 10, paddingLeft: 10 }}>
                <div style={{ fontSize: 20 }}>{r.esCliente ? '✅' : cfg.glyph}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span className="fw-700" style={{ fontSize: 14 }}>{r.displayName?.text}</span>
                    {r.esCliente && (
                      <span style={{ background: '#10b981', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>✓ Cliente</span>
                    )}
                    {estConfig && (
                      <span style={{ background: estConfig.color, color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{estConfig.label}</span>
                    )}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{r.formattedAddress}</div>
                  {r.nationalPhoneNumber && (
                    <div className="text-muted" style={{ fontSize: 12 }}>📞 {r.nationalPhoneNumber}</div>
                  )}
                  {prospecto?.notas && (
                    <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>"{prospecto.notas}"</div>
                  )}
                  {prospecto?.fecha && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Visitado: {prospecto.fecha}</div>
                  )}
                  <div style={{ marginTop: 4 }}><TierBadge tier={r.tier} /></div>
                  <ContactoBtns
                    tel={r.nationalPhoneNumber}
                    lat={r.location?.latitude} lng={r.location?.longitude}
                    addr={r.formattedAddress} small />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className={`btn btn-sm ${enRuta ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => enRuta ? quitarDeRuta(r.id) : agregarARuta(r)}>
                    {enRuta ? '✓ En ruta' : '➕ Ruta'}
                  </button>
                  <button className="btn btn-sm"
                    style={{ background: estConfig ? estConfig.color + '22' : '#fef9e7', color: estConfig ? estConfig.color : '#92400e', border: `1px solid ${estConfig ? estConfig.color : '#fcd34d'}`, fontWeight: 700 }}
                    onClick={() => setModalVisita(r)}>
                    {prospecto ? '📝 Actualizar' : '📝 Visita'}
                  </button>
                  {!r.esCliente && (
                    <button className="btn btn-success btn-sm" onClick={() => setModalCliente(r)}>
                      💾 Nuevo
                    </button>
                  )}
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

          {/* Guardar ruta con nombre */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 4 }}>
            <input
              style={{ flex: 1, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}
              placeholder="Nombre de la ruta..."
              value={nombreRuta}
              onChange={e => setNombreRuta(e.target.value)}
            />
            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', border: 'none' }}
              disabled={!nombreRuta.trim() || guardandoRuta}
              onClick={async () => {
                setGuardandoRuta(true)
                const hoyStr = new Date().toLocaleDateString('es-AR')
                await fbPush(ref(db, 'rutas'), { nombre: nombreRuta.trim(), paradas: ruta, timestamp: Date.now(), fechaGuardado: hoyStr })
                setNombreRuta('')
                setRutaGuardadaMsg('✅ Ruta guardada')
                setTimeout(() => setRutaGuardadaMsg(''), 3000)
                setGuardandoRuta(false)
              }}>
              {guardandoRuta ? '...' : '💾 Guardar'}
            </button>
          </div>
          {rutaGuardadaMsg && <div style={{ color: '#6ee7b7', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{rutaGuardadaMsg}</div>}

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

      {modalVisita && (
        <MarcarVisitaModal negocio={modalVisita} existente={prospectos[modalVisita.id] || null} onClose={() => setModalVisita(null)} />
      )}
      {modalCliente && (
        <GuardarClienteModal negocio={modalCliente} onClose={() => setModalCliente(null)} />
      )}
      {modalVincular && (
        <VincularClienteModal negocio={modalVincular} clientes={clientes} onClose={() => setModalVincular(null)} />
      )}
    </div>
  )
}

function MarcarVisitaModal({ negocio, existente, onClose }) {
  const [estado, setEstado] = useState(existente?.estado || '')
  const [notas, setNotas]   = useState(existente?.notas  || '')
  const [loading, setLoading] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (!estado) return
    setLoading(true)
    const hoyStr = new Date().toLocaleDateString('es-AR')
    await set(ref(db, `prospectos/${negocio.id}`), {
      nombre:    negocio.displayName?.text || '',
      direccion: negocio.formattedAddress  || '',
      lat:       negocio.location?.latitude  ?? null,
      lng:       negocio.location?.longitude ?? null,
      estado, notas,
      fecha:     existente?.fecha || hoyStr,
      fechaActualizacion: hoyStr,
      timestamp: Date.now(),
    })
    setLoading(false)
    onClose()
  }

  async function quitar() {
    await remove(ref(db, `prospectos/${negocio.id}`))
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">📝 {existente ? 'Actualizar visita' : 'Marcar visita'}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 14 }}>
          {negocio.displayName?.text}
        </div>
        <form onSubmit={guardar}>
          <div className="form-group">
            <label className="form-label">Resultado de la visita</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ESTADOS_PROSPECTO.map(est => (
                <label key={est.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 8,
                  border: `2px solid ${estado === est.value ? est.color : 'var(--border)'}`,
                  background: estado === est.value ? est.color + '18' : 'var(--bg)',
                  transition: 'all .15s',
                }}>
                  <input type="radio" name="estado" value={est.value}
                    checked={estado === est.value} onChange={() => setEstado(est.value)}
                    style={{ accentColor: est.color, width: 16, height: 16 }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{est.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notas (opcional)</label>
            <textarea className="form-input" rows={3} style={{ resize: 'vertical', fontFamily: 'Outfit, sans-serif' }}
              placeholder="Ej: Hablar con el dueño la semana que viene..."
              value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={loading || !estado} style={{ flex: 1 }}>
              {loading ? 'Guardando...' : '💾 Guardar'}
            </button>
            {existente && (
              <button className="btn btn-danger btn-sm" type="button" onClick={quitar}>
                🗑 Quitar
              </button>
            )}
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
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
  const [actualizarNombre, setActualizarNombre] = useState(true)
  const [loading, setLoading] = useState(false)

  const nombreGoogle = negocio.displayName?.text || ''

  const lista = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => a.razonSocial?.localeCompare(b.razonSocial))

  async function vincular(e) {
    e.preventDefault()
    if (!clienteSelec) return
    setLoading(true)
    try {
      const datos = {}
      if (actualizarNombre && nombreGoogle) datos.razonSocial = nombreGoogle
      if (negocio.formattedAddress)         datos.direccion   = negocio.formattedAddress
      if (negocio.nationalPhoneNumber)      datos.telefono    = negocio.nationalPhoneNumber
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
          Actualizá los datos del cliente con la info de <strong>{nombreGoogle}</strong>.
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
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Se actualizará:</div>
            {nombreGoogle && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={actualizarNombre}
                  onChange={e => setActualizarNombre(e.target.checked)}
                  style={{ accentColor: 'var(--blue)', width: 15, height: 15 }} />
                <span>✏️ Nombre: <strong>{nombreGoogle}</strong></span>
              </label>
            )}
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

// ── Rutas Guardadas ───────────────────────────────────────────────────────────
function RutasGuardadas() {
  const [rutas, setRutas]         = useState({})
  const [confirm, setConfirm]     = useState(null)
  const [modoRutaData, setModoRutaData] = useState(null) // { nombre, paradas }
  const [modoIdx, setModoIdx]     = useState(0)

  useEffect(() => {
    return onValue(ref(db, 'rutas'), s => setRutas(s.exists() ? s.val() : {}))
  }, [])

  // Wake Lock for route mode
  useEffect(() => {
    if (!modoRutaData) return
    let wl = null
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(l => { wl = l }).catch(() => {})
    }
    return () => { if (wl) wl.release() }
  }, [!!modoRutaData])

  async function eliminar(id) {
    await remove(ref(db, `rutas/${id}`))
    setConfirm(null)
  }

  function abrirEnMaps(paradas) {
    const stops = paradas.map(p => encodeURIComponent(p.formattedAddress || `${p.location?.latitude},${p.location?.longitude}`))
    window.open(`https://www.google.com/maps/dir/${stops.join('/')}`, '_blank')
  }

  function entrarModoRuta(r) {
    setModoIdx(0)
    setModoRutaData({ nombre: r.nombre, paradas: r.paradas || [] })
  }

  const lista = Object.entries(rutas)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => b.timestamp - a.timestamp)

  // ── Modo Ruta overlay ──
  if (modoRutaData) {
    const paradas = modoRutaData.paradas
    const p = paradas[modoIdx]
    const nombre = p?.displayName?.text || p?.nombre || ''
    const lat = p?.location?.latitude
    const lng = p?.location?.longitude
    const tel = p?.nationalPhoneNumber
    const addr = p?.formattedAddress
    const wa  = waUrl(tel)
    const dir = mapsDir(lat, lng, addr)
    const cfg = TIER_CONFIG[p?.tier] || TIER_CONFIG[1]

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: '#0b1f3a', display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, fontWeight: 700 }}>
            🚗 {modoRutaData.nombre} · {modoIdx + 1}/{paradas.length}
          </div>
          <button onClick={() => setModoRutaData(null)}
            style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 700 }}>
            ✕ Salir
          </button>
        </div>

        {/* Parada info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', textAlign: 'center' }}>
          <div style={{ background: cfg.color + '22', border: `1px solid ${cfg.color}44`, borderRadius: 10, padding: '4px 12px', marginBottom: 16, fontSize: 12, fontWeight: 700, color: cfg.color }}>
            {cfg.label}
          </div>
          <div style={{ color: '#fff', fontSize: 34, fontWeight: 900, lineHeight: 1.2, marginBottom: 10 }}>
            {nombre}
          </div>
          {addr && (
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, marginBottom: 28 }}>
              📍 {addr}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#25d366', color: '#fff', borderRadius: 14, padding: '14px 24px', fontSize: 18, fontWeight: 800, textDecoration: 'none' }}>
                💬 WhatsApp
              </a>
            )}
            {dir && (
              <a href={dir} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#4285f4', color: '#fff', borderRadius: 14, padding: '14px 24px', fontSize: 18, fontWeight: 800, textDecoration: 'none' }}>
                🗺 Cómo llegar
              </a>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 12, padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <button onClick={() => setModoIdx(i => Math.max(0, i - 1))} disabled={modoIdx === 0}
            style={{ flex: 1, background: 'rgba(255,255,255,.1)', border: 'none', color: modoIdx === 0 ? 'rgba(255,255,255,.25)' : '#fff', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700 }}>
            ← Anterior
          </button>
          <button onClick={() => setModoIdx(i => Math.min(paradas.length - 1, i + 1))} disabled={modoIdx === paradas.length - 1}
            style={{ flex: 1, background: 'rgba(255,255,255,.1)', border: 'none', color: modoIdx === paradas.length - 1 ? 'rgba(255,255,255,.25)' : '#fff', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700 }}>
            Siguiente →
          </button>
        </div>
      </div>
    )
  }

  if (lista.length === 0) {
    return (
      <div className="empty-state card">
        <div className="empty-icon">🗺️</div>
        <p>No hay rutas guardadas todavía</p>
        <p style={{ fontSize: 13, marginTop: 6 }}>Armá una ruta en "Prospectar Zona" y guardala con un nombre</p>
      </div>
    )
  }

  return (
    <div>
      {lista.map(r => (
        <div key={r.id} className="card mb-16">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <div>
              <div className="fw-800" style={{ fontSize: 17 }}>🗺️ {r.nombre}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {Array.isArray(r.paradas) ? r.paradas.length : 0} paradas · {r.fechaGuardado || ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-amber btn-sm" onClick={() => entrarModoRuta(r)}>
                🚗 Modo en Ruta
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => abrirEnMaps(r.paradas || [])}>
                📱 Abrir en Maps
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>🗑</button>
            </div>
          </div>

          {Array.isArray(r.paradas) && r.paradas.map((p, i) => {
            const cfg = TIER_CONFIG[p.tier] || TIER_CONFIG[1]
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: cfg.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fw-600" style={{ fontSize: 13 }}>{p.displayName?.text || p.nombre}</div>
                  <div className="text-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.formattedAddress}</div>
                </div>
                <span className={`tier-badge tier-${p.tier || 1}`} style={{ fontSize: 10 }}>{cfg.label}</span>
              </div>
            )
          })}
        </div>
      ))}

      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ fontSize: 16 }}>⚠️ Eliminar ruta</div>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>¿Eliminás esta ruta guardada?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => eliminar(confirm)}>Eliminar</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modo en Ruta (pantalla conductor) ────────────────────────────────────────
function hoyMapa() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function ModoRuta({ lista, clientes, usuarios, usuario, onClose }) {
  const [idx, setIdx]           = useState(0)
  const [entregando, setEntregando] = useState(false)
  const [precio, setPrecio]     = useState('')
  const [loading, setLoading]   = useState(false)

  const actual = lista[idx] || null

  // Keep screen awake while in route mode
  useEffect(() => {
    let wl = null
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(l => { wl = l }).catch(() => {})
    }
    return () => { if (wl) wl.release() }
  }, [])

  // Pre-fill price from precioHabitual
  useEffect(() => {
    if (!actual) return
    const ph = clientes[actual.clienteKey]?.precioHabitual
    setPrecio(ph ? String(ph) : '')
    setEntregando(false)
  }, [idx, actual?.id])

  async function confirmarEntrega() {
    if (!actual || !parseFloat(precio)) return
    setLoading(true)
    const precioNum = parseFloat(precio)
    const vendedor  = actual.usuario || usuario
    const clienteData = clientes[actual.clienteKey] || {}
    const stockActual = usuarios[vendedor]?.stock ?? 0
    try {
      await fbPush(ref(db, 'ventas'), {
        clienteKey: actual.clienteKey, cliente: actual.cliente,
        cantidadFrascos: actual.cantidadFrascos, precioVenta: precioNum,
        fechaVenta: hoyMapa(), timestamp: Date.now(),
        usuario: vendedor, repartido: false, canal: 'Presencial',
      })
      const upd = {}
      upd[`clientes/${actual.clienteKey}/cantidadFrascos`] = (clienteData.cantidadFrascos || 0) + actual.cantidadFrascos
      upd[`clientes/${actual.clienteKey}/fechaUltimaCompra`] = hoyMapa()
      upd[`clientes/${actual.clienteKey}/precioHabitual`]   = precioNum
      upd[`usuarios/${vendedor}/stock`]                     = Math.max(0, stockActual - actual.cantidadFrascos)
      upd[`pedidos/${actual.id}/estado`]                    = 'entregado'
      upd[`pedidos/${actual.id}/fechaEntrega`]              = hoyMapa()
      upd[`pedidos/${actual.id}/precioVenta`]               = precioNum
      await update(ref(db), upd)
      setEntregando(false)
      if (lista.length <= 1) { onClose(); return }
      setIdx(i => Math.min(i, lista.length - 2))
    } finally { setLoading(false) }
  }

  if (!actual || lista.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: '#0b1f3a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>✅</div>
        <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, marginBottom: 8 }}>¡Todo entregado!</div>
        <button onClick={onClose} style={{ marginTop: 24, background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 14, padding: '14px 32px', fontSize: 16, fontWeight: 700 }}>
          Salir
        </button>
      </div>
    )
  }

  const wa  = waUrl(actual.telefono)
  const dir = mapsDir(actual.lat, actual.lng, actual.direccion)
  const precioNum = parseFloat(precio) || 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: '#0b1f3a', display: 'flex', flexDirection: 'column', fontFamily: 'Outfit, sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, fontWeight: 700 }}>
          🚗 Entrega {idx + 1} de {lista.length}
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 700 }}>
          ✕ Salir
        </button>
      </div>

      {/* Cliente info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ color: '#fff', fontSize: 36, fontWeight: 900, lineHeight: 1.2, marginBottom: 12 }}>
          {actual.cliente}
        </div>
        <div style={{ color: '#fbbf24', fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
          {actual.cantidadFrascos} frascos
        </div>
        {actual.notas && (
          <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 16, fontStyle: 'italic', marginBottom: 8 }}>
            "{actual.notas}"
          </div>
        )}
        {actual.direccion && (
          <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, marginBottom: 24 }}>
            📍 {actual.direccion}
          </div>
        )}

        {/* Contact buttons */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#25d366', color: '#fff', borderRadius: 14, padding: '14px 24px', fontSize: 18, fontWeight: 800, textDecoration: 'none' }}>
              💬 WhatsApp
            </a>
          )}
          {dir && (
            <a href={dir} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#4285f4', color: '#fff', borderRadius: 14, padding: '14px 24px', fontSize: 18, fontWeight: 800, textDecoration: 'none' }}>
              🗺 Cómo llegar
            </a>
          )}
        </div>

        {/* Entregar panel */}
        {entregando ? (
          <div style={{ background: 'rgba(255,255,255,.08)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 }}>
            <div style={{ color: '#fff', fontWeight: 700, marginBottom: 10 }}>Precio por frasco ($)</div>
            <input
              type="number" inputMode="decimal" placeholder="0"
              value={precio} onChange={e => setPrecio(e.target.value)}
              autoFocus
              style={{ width: '100%', background: 'rgba(255,255,255,.15)', border: '1.5px solid rgba(255,255,255,.3)', borderRadius: 10, color: '#fff', fontSize: 20, fontWeight: 800, padding: '12px 14px', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
            />
            {precioNum > 0 && (
              <div style={{ color: '#34d399', fontSize: 18, fontWeight: 900, marginBottom: 14 }}>
                Total: ${Math.round(actual.cantidadFrascos * precioNum).toLocaleString('es-AR')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button disabled={!precioNum || loading} onClick={confirmarEntrega}
                style={{ flex: 1, background: '#10b981', border: 'none', color: '#fff', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 800 }}>
                {loading ? 'Guardando...' : '✅ Confirmar'}
              </button>
              <button onClick={() => setEntregando(false)}
                style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 12, padding: '14px 18px', fontSize: 15, fontWeight: 700 }}>
                Volver
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEntregando(true)}
            style={{ background: '#10b981', border: 'none', color: '#fff', borderRadius: 16, padding: '18px 40px', fontSize: 20, fontWeight: 900 }}>
            ✅ Entregar
          </button>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 12, padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,.1)' }}>
        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
          style={{ flex: 1, background: 'rgba(255,255,255,.1)', border: 'none', color: idx === 0 ? 'rgba(255,255,255,.25)' : '#fff', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700 }}>
          ← Anterior
        </button>
        <button onClick={() => setIdx(i => Math.min(lista.length - 1, i + 1))} disabled={idx === lista.length - 1}
          style={{ flex: 1, background: 'rgba(255,255,255,.1)', border: 'none', color: idx === lista.length - 1 ? 'rgba(255,255,255,.25)' : '#fff', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700 }}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}

// ── Ruta de Entrega (Pedidos pendientes en el mapa) ──────────────────────────
function DeliveryPolyline({ puntos }) {
  const map = useMap()
  const polyRef = useRef(null)

  useEffect(() => {
    if (!map) return
    if (polyRef.current) polyRef.current.setMap(null)
    if (puntos.length < 2) return
    polyRef.current = new window.google.maps.Polyline({
      path: puntos,
      geodesic: true,
      strokeColor: '#f59e0b',
      strokeOpacity: 0.85,
      strokeWeight: 3,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '20px' }],
    })
    polyRef.current.setMap(map)
    return () => { if (polyRef.current) polyRef.current.setMap(null) }
  }, [map, puntos])

  return null
}

function RutaEntrega({ usuario }) {
  const [pedidos, setPedidos]   = useState({})
  const [clientes, setClientes] = useState({})
  const [usuarios, setUsuarios] = useState({})
  const [selected, setSelected] = useState(null)
  const [modoRuta, setModoRuta] = useState(false)

  useEffect(() => {
    const unP = onValue(ref(db, 'pedidos'),  s => setPedidos(s.exists()  ? s.val() : {}))
    const unC = onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
    const unU = onValue(ref(db, 'usuarios'), s => setUsuarios(s.exists() ? s.val() : {}))
    return () => { unP(); unC(); unU() }
  }, [])

  const pendientes = Object.entries(pedidos)
    .filter(([, p]) => p.estado === 'pendiente')
    .map(([id, p]) => {
      const c = clientes[p.clienteKey] || {}
      return { id, ...p, lat: c.lat, lng: c.lng, telefono: c.telefono, direccion: c.direccion }
    })
    .sort((a, b) => a.timestamp - b.timestamp)

  const conUbic  = pendientes.filter(p => p.lat && p.lng)
  const sinUbic  = pendientes.filter(p => !p.lat || !p.lng)
  const puntos   = conUbic.map(p => ({ lat: p.lat, lng: p.lng }))

  function abrirRutaEnMaps() {
    if (conUbic.length === 0) return
    const stops = conUbic.map(p => encodeURIComponent(p.direccion || `${p.lat},${p.lng}`))
    window.open(`https://www.google.com/maps/dir/${stops.join('/')}`, '_blank')
  }

  const centroMapa = conUbic.length > 0
    ? { lat: conUbic[0].lat, lng: conUbic[0].lng }
    : ROSARIO_POS

  if (pendientes.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div className="fw-700" style={{ fontSize: 16 }}>Sin pedidos pendientes</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Registrá encargos en la sección Pedidos</div>
      </div>
    )
  }

  return (
    <div>
      {modoRuta && (
        <ModoRuta
          lista={pendientes}
          clientes={clientes}
          usuarios={usuarios}
          usuario={usuario}
          onClose={() => setModoRuta(false)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span className="fw-800" style={{ fontSize: 15 }}>
            {pendientes.length} entrega{pendientes.length !== 1 ? 's' : ''} pendiente{pendientes.length !== 1 ? 's' : ''}
          </span>
          {sinUbic.length > 0 && (
            <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>
              ({sinUbic.length} sin GPS)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-amber btn-sm" onClick={() => setModoRuta(true)}>
            🚗 Modo en Ruta
          </button>
          {conUbic.length > 1 && (
            <button className="btn btn-primary btn-sm" onClick={abrirRutaEnMaps}>
              📱 Abrir en Maps
            </button>
          )}
        </div>
      </div>

      {/* Mapa */}
      {conUbic.length > 0 && (
        <div style={{ height: 320, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          <Map
            defaultCenter={centroMapa}
            defaultZoom={12}
            mapId="ruta-entrega"
            style={{ width: '100%', height: '100%' }}
            gestureHandling="greedy"
          >
            {conUbic.map((p, i) => (
              <AdvancedMarker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                onClick={() => setSelected(selected?.id === p.id ? null : p)}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#f59e0b', border: '2px solid #d97706',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 900, fontFamily: 'Outfit, sans-serif',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}>
                  {i + 1}
                </div>
              </AdvancedMarker>
            ))}
            {selected && selected.lat && (
              <InfoWindow
                position={{ lat: selected.lat, lng: selected.lng }}
                onCloseClick={() => setSelected(null)}
              >
                <div style={{ fontFamily: 'Outfit, sans-serif', minWidth: 180, padding: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{selected.cliente}</div>
                  <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 15, marginBottom: 4 }}>
                    {selected.cantidadFrascos} frascos
                  </div>
                  {selected.notas && (
                    <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginBottom: 4 }}>"{selected.notas}"</div>
                  )}
                  <ContactoBtns tel={selected.telefono} lat={selected.lat} lng={selected.lng} addr={selected.direccion} small />
                </div>
              </InfoWindow>
            )}
            <DeliveryPolyline puntos={puntos} />
          </Map>
        </div>
      )}

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {conUbic.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fw-700" style={{ fontSize: 14 }}>{p.cliente}</div>
              <div style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 700 }}>{p.cantidadFrascos} frascos</div>
              {p.notas && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>📝 {p.notas}</div>}
              <ContactoBtns tel={p.telefono} lat={p.lat} lng={p.lng} addr={p.direccion} small />
            </div>
          </div>
        ))}
        {sinUbic.map(p => (
          <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', background: '#fff', borderRadius: 12, border: '1px solid var(--border)', opacity: 0.65 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#94a3b8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0 }}>?</div>
            <div style={{ flex: 1 }}>
              <div className="fw-700" style={{ fontSize: 14 }}>{p.cliente}</div>
              <div style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 700 }}>{p.cantidadFrascos} frascos</div>
              <div style={{ fontSize: 12, color: 'var(--red)' }}>Sin GPS — agregá coordenadas desde Mapa → Mis Clientes</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Optimizador de Ruta ───────────────────────────────────────────────────────
function haversine(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function OptimizadorRuta({ clientes }) {
  const [seleccionados, setSeleccionados] = useState([])
  const [busqueda, setBusqueda]           = useState('')
  const [rutaOptima, setRutaOptima]       = useState(null)
  const [nombreRuta, setNombreRuta]       = useState('')
  const [guardando, setGuardando]         = useState(false)
  const [guardado, setGuardado]           = useState(false)

  const listaConGPS = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c }))
    .filter(c => c.lat && c.lng)
    .filter(c => !busqueda || c.razonSocial?.toLowerCase().includes(busqueda.toLowerCase()) || c.localidad?.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => (a.razonSocial || '').localeCompare(b.razonSocial || ''))

  const sinGPS = Object.values(clientes).filter(c => !c.lat || !c.lng).length

  function toggleCliente(id) {
    setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setRutaOptima(null)
    setGuardado(false)
  }

  function toggleTodos() {
    if (seleccionados.length === listaConGPS.length && listaConGPS.length > 0) {
      setSeleccionados([])
    } else {
      setSeleccionados(listaConGPS.map(c => c.id))
    }
    setRutaOptima(null)
  }

  function optimizar() {
    const puntos = seleccionados
      .map(id => ({ id, ...clientes[id] }))
      .filter(c => c.lat && c.lng)
    if (puntos.length < 2) return

    // Start from the point closest to Rosario center
    const inicio = puntos.reduce((best, p) =>
      haversine(p, ROSARIO_POS) < haversine(best, ROSARIO_POS) ? p : best
    )

    // Nearest neighbor greedy TSP
    const visitados = new Set()
    const ruta = []
    let actual = inicio
    while (ruta.length < puntos.length) {
      visitados.add(actual.id)
      ruta.push(actual)
      const siguientes = puntos.filter(p => !visitados.has(p.id))
      if (!siguientes.length) break
      actual = siguientes.reduce((best, p) => haversine(actual, p) < haversine(actual, best) ? p : best)
    }

    let totalKm = 0
    for (let i = 0; i < ruta.length - 1; i++) totalKm += haversine(ruta[i], ruta[i + 1])

    setRutaOptima({ paradas: ruta, totalKm: Math.round(totalKm * 10) / 10 })
    setGuardado(false)
  }

  async function guardarRuta() {
    if (!rutaOptima || !nombreRuta.trim()) return
    setGuardando(true)
    const paradas = rutaOptima.paradas.map(p => ({
      displayName:         { text: p.razonSocial || '' },
      formattedAddress:    p.direccion || '',
      location:            { latitude: p.lat, longitude: p.lng },
      nationalPhoneNumber: p.telefono || '',
      tier:                p.tier || 1,
    }))
    await fbPush(ref(db, 'rutas'), {
      nombre:        nombreRuta.trim(),
      paradas,
      fechaGuardado: hoyMapa(),
      timestamp:     Date.now(),
    })
    setGuardando(false)
    setGuardado(true)
    setNombreRuta('')
  }

  function abrirEnMaps() {
    if (!rutaOptima) return
    const stops = rutaOptima.paradas.map(p => encodeURIComponent(p.direccion || `${p.lat},${p.lng}`))
    window.open(`https://www.google.com/maps/dir/${stops.join('/')}`, '_blank')
  }

  return (
    <div>
      {/* Selector de clientes */}
      <div className="card mb-16">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="fw-800" style={{ fontSize: 15 }}>Clientes a visitar</span>
          <span className="text-muted" style={{ fontSize: 12 }}>{seleccionados.length} seleccionados</span>
        </div>
        <input className="form-input" placeholder="Buscar cliente..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)} style={{ marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={toggleTodos}>
            {seleccionados.length === listaConGPS.length && listaConGPS.length > 0 ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
          {sinGPS > 0 && <span className="text-muted" style={{ fontSize: 12 }}>({sinGPS} sin GPS)</span>}
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {listaConGPS.map(c => {
            const sel = seleccionados.includes(c.id)
            const cfg = TIER_CONFIG[c.tier || 1]
            return (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: sel ? '#e8f1ff' : 'transparent', cursor: 'pointer', transition: 'background .1s' }}>
                <input type="checkbox" checked={sel} onChange={() => toggleCliente(c.id)}
                  style={{ accentColor: 'var(--blue)', width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.razonSocial}</div>
                  {c.localidad && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.localidad}</div>}
                </div>
                <span style={{ fontSize: 10, color: cfg.color, fontWeight: 700, flexShrink: 0 }}>{cfg.glyph}</span>
              </label>
            )
          })}
          {listaConGPS.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>
              No hay clientes con GPS que coincidan
            </div>
          )}
        </div>
      </div>

      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 16, fontSize: 15 }}
        disabled={seleccionados.length < 2} onClick={optimizar}>
        ⚡ Optimizar ruta ({seleccionados.length} clientes)
      </button>

      {/* Resultado */}
      {rutaOptima && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="fw-800" style={{ fontSize: 16 }}>Orden óptimo</div>
              <div className="text-muted" style={{ fontSize: 13 }}>
                ~{rutaOptima.totalKm} km en total · {rutaOptima.paradas.length} paradas
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={abrirEnMaps}>📱 Abrir en Maps</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {rutaOptima.paradas.map((p, i) => {
              const cfg = TIER_CONFIG[p.tier || 1]
              const kmSig = i < rutaOptima.paradas.length - 1
                ? Math.round(haversine(p, rutaOptima.paradas[i + 1]) * 10) / 10
                : null
              return (
                <div key={p.id}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.razonSocial}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.localidad}{p.direccion ? ` · ${p.direccion}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, color: cfg.color, fontWeight: 700, flexShrink: 0 }}>{cfg.glyph}</span>
                  </div>
                  {kmSig != null && (
                    <div style={{ paddingLeft: 38, fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                      ↓ {kmSig} km
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 14 }}>
            <div className="fw-700 mb-8" style={{ fontSize: 13 }}>Guardar en Rutas Guardadas</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Nombre de la ruta..." value={nombreRuta}
                onChange={e => setNombreRuta(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-success" disabled={!nombreRuta.trim() || guardando} onClick={guardarRuta}>
                {guardando ? '...' : '💾'}
              </button>
            </div>
            {guardado && (
              <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                ✅ Guardada — disponible en Rutas Guardadas con Modo en Ruta
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Detector de Piscinas (OpenStreetMap Overpass API) ────────────────────────
const LOCALIDADES_PRESET = [
  'Funes', 'Fisherton', 'Roldán', 'Pérez', 'Granadero Baigorria',
  'Capitán Bermúdez', 'Fray Luis Beltrán', 'Villa Gobernador Gálvez',
  'San Lorenzo', 'Puerto General San Martín',
]

async function geocodificarLocalidad(nombre) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nombre + ', Santa Fe, Argentina')}&format=json&limit=1`,
    { headers: { 'Accept-Language': 'es' } }
  )
  const d = await r.json()
  if (!d.length) return null
  return { bbox: d[0].boundingbox, nombre: d[0].display_name.split(',')[0] }
}

async function buscarPiscinasEnBbox(bbox) {
  const [south, north, west, east] = bbox
  const query = `[out:json][timeout:30];(way["leisure"="swimming_pool"](${south},${west},${north},${east});relation["leisure"="swimming_pool"](${south},${west},${north},${east}););out center;`
  const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
  const d = await r.json()
  return d.elements
    .map(el => ({ lat: el.center?.lat ?? el.lat, lng: el.center?.lon ?? el.lon }))
    .filter(p => p.lat && p.lng)
}

function DetectorPiscinas() {
  const [zonas, setZonas]         = useState([])
  const [busqueda, setBusqueda]   = useState('')
  const [cargando, setCargando]   = useState(null)
  const [error, setError]         = useState('')
  const [selZona, setSelZona]     = useState(null)

  async function analizar(nombre) {
    if (zonas.find(z => z.nombre.toLowerCase() === nombre.toLowerCase())) return
    setCargando(nombre)
    setError('')
    try {
      const geo = await geocodificarLocalidad(nombre)
      if (!geo) { setError(`No se encontró "${nombre}"`); return }
      const piscinas = await buscarPiscinasEnBbox(geo.bbox)
      setZonas(prev => [...prev, { nombre: geo.nombre, piscinas, bbox: geo.bbox }]
        .sort((a, b) => b.piscinas.length - a.piscinas.length))
    } catch {
      setError('Error al consultar. Intentá de nuevo.')
    } finally { setCargando(null) }
  }

  function quitarZona(nombre) {
    setZonas(prev => prev.filter(z => z.nombre !== nombre))
    if (selZona?.nombre === nombre) setSelZona(null)
  }

  const max = zonas.length ? Math.max(...zonas.map(z => z.piscinas.length)) : 1

  function nivelDemanda(n) {
    if (n >= 200) return { label: '🔥 Muy alta', color: '#ef4444' }
    if (n >= 100) return { label: '🟠 Alta',     color: '#f97316' }
    if (n >=  50) return { label: '🟡 Media',    color: '#f59e0b' }
    if (n >=  10) return { label: '🟢 Baja',     color: '#10b981' }
    return                { label: '⚪ Muy baja', color: '#94a3b8' }
  }

  return (
    <div>
      {/* Buscador */}
      <div className="card mb-16">
        <div className="fw-800 mb-8" style={{ fontSize: 15 }}>🏊 Detectar piscinas por localidad</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Usa datos de OpenStreetMap para estimar la cantidad de piscinas en cada zona.
          Más piscinas = más demanda potencial de tu producto.
        </p>

        {/* Búsqueda libre */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="form-input"
            placeholder="Ej: Funes, Fisherton, Roldán..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && busqueda.trim()) { analizar(busqueda.trim()); setBusqueda('') } }}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            disabled={!busqueda.trim() || !!cargando}
            onClick={() => { analizar(busqueda.trim()); setBusqueda('') }}
          >
            {cargando ? '⏳' : '🔍 Analizar'}
          </button>
        </div>

        {/* Presets rápidos */}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 700 }}>Zonas frecuentes:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LOCALIDADES_PRESET.map(loc => (
            <button
              key={loc}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
              disabled={!!cargando || !!zonas.find(z => z.nombre.toLowerCase().includes(loc.toLowerCase()))}
              onClick={() => analizar(loc)}
            >
              {cargando === loc ? '⏳' : loc}
            </button>
          ))}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10, fontWeight: 600 }}>{error}</div>}
      </div>

      {/* Ranking */}
      {zonas.length > 0 && (
        <div className="card mb-16">
          <div className="fw-800 mb-12" style={{ fontSize: 15 }}>📊 Ranking de demanda</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {zonas.map((z, i) => {
              const demanda = nivelDemanda(z.piscinas.length)
              const pct = Math.round((z.piscinas.length / max) * 100)
              return (
                <div key={z.nombre}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 900, color: 'var(--muted)', fontSize: 12, minWidth: 18 }}>#{i + 1}</span>
                      <button
                        onClick={() => setSelZona(selZona?.nombre === z.nombre ? null : z)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'var(--navy)', textAlign: 'left' }}
                      >
                        {z.nombre}
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: demanda.color }}>{demanda.label}</span>
                      <span style={{ fontWeight: 900, fontSize: 15, color: 'var(--navy)' }}>{z.piscinas.length}</span>
                      <button onClick={() => quitarZona(z.nombre)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: '0 2px' }}>✕</button>
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: demanda.color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                  </div>
                  {selZona?.nombre === z.nombre && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>
                      📍 {z.piscinas.length} piscinas detectadas en {z.nombre}.
                      {' '}La demanda potencial es <strong style={{ color: demanda.color }}>{demanda.label.replace(/^.+ /, '')}</strong>.
                      {z.piscinas.length < 20 && ' Puede que la zona no esté bien mapeada en OpenStreetMap — probá localidades más grandes.'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {zonas.length >= 2 && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: '#eff6ff', borderRadius: 10, fontSize: 13 }}>
              <strong>💡 Conclusión:</strong>{' '}
              <strong>{zonas[0].nombre}</strong> tiene la mayor densidad de piscinas ({zonas[0].piscinas.length}) —
              es la zona con más demanda potencial entre las analizadas.
            </div>
          )}
        </div>
      )}

      {/* Mapa de piscinas */}
      {selZona && MAPS_KEY && (
        <div className="card">
          <div className="fw-800 mb-12" style={{ fontSize: 15 }}>📍 Piscinas en {selZona.nombre}</div>
          <APIProvider apiKey={MAPS_KEY}>
            <Map
              style={{ width: '100%', height: 380, borderRadius: 10 }}
              defaultCenter={{
                lat: (parseFloat(selZona.bbox[0]) + parseFloat(selZona.bbox[1])) / 2,
                lng: (parseFloat(selZona.bbox[2]) + parseFloat(selZona.bbox[3])) / 2,
              }}
              defaultZoom={13}
              mapId="piscinas-map"
              disableDefaultUI
              zoomControl
            >
              {selZona.piscinas.map((p, idx) => (
                <AdvancedMarker key={idx} position={{ lat: p.lat, lng: p.lng }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#1a6bff', border: '2px solid #fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }} />
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
            Cada punto azul es una piscina detectada. Datos de OpenStreetMap — cobertura parcial, orientativa.
          </div>
        </div>
      )}

      {selZona && !MAPS_KEY && (
        <div className="card">
          <div className="fw-700" style={{ fontSize: 14 }}>📍 Piscinas en {selZona.nombre}: {selZona.piscinas.length} detectadas</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Configurá la API key de Google Maps para ver el mapa visual.</div>
        </div>
      )}

      {zonas.length === 0 && !cargando && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏊</div>
          <div className="fw-700" style={{ fontSize: 16 }}>Analizá una localidad</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Buscá o elegí una zona para ver cuántas piscinas tiene y si vale la pena visitarla
          </div>
        </div>
      )}

      {cargando && (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 14 }}>Buscando piscinas en {cargando}...</div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal Mapa ─────────────────────────────────────────────────
export default function Mapa({ usuario }) {
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
          onClick={() => setTab('clientes')}>👥 Mis Clientes</button>
        <button className={`tab-btn ${tab === 'prospectar' ? 'active' : ''}`}
          onClick={() => setTab('prospectar')}>🔍 Prospectar Zona</button>
        <button className={`tab-btn ${tab === 'entrega' ? 'active' : ''}`}
          onClick={() => setTab('entrega')}>📦 Ruta Entrega</button>
        <button className={`tab-btn ${tab === 'rutas' ? 'active' : ''}`}
          onClick={() => setTab('rutas')}>📋 Rutas Guardadas</button>
        <button className={`tab-btn ${tab === 'optimizar' ? 'active' : ''}`}
          onClick={() => setTab('optimizar')}>⚡ Optimizar</button>
        <button className={`tab-btn ${tab === 'piscinas' ? 'active' : ''}`}
          onClick={() => setTab('piscinas')}>🏊 Piscinas</button>
      </div>

      {tab === 'piscinas' ? (
        <DetectorPiscinas />
      ) : tab === 'optimizar' ? (
        <OptimizadorRuta clientes={clientes} />
      ) : tab === 'rutas' ? (
        <RutasGuardadas />
      ) : tab === 'entrega' ? (
        MAPS_KEY ? (
          <APIProvider apiKey={MAPS_KEY}><RutaEntrega usuario={usuario} /></APIProvider>
        ) : (
          <RutaEntrega usuario={usuario} />
        )
      ) : MAPS_KEY ? (
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
