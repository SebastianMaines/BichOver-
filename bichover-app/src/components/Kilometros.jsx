import { useState, useEffect } from 'react'
import { ref, onValue, push, update, set } from 'firebase/database'
import { db } from '../firebase.js'

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function fmtKm(n) {
  return Number(n).toFixed(1) + ' km'
}

function semanaLabel(dateStr) {
  // dateStr: dd/mm/yyyy → return "Semana N"
  if (!dateStr) return ''
  const [d, m, y] = dateStr.split('/')
  const date = new Date(+y, +m - 1, +d)
  const start = new Date(+y, 0, 1)
  const week = Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7)
  return `Sem. ${week} – ${m}/${y}`
}

export default function Kilometros({ usuario }) {
  const [registros, setRegistros] = useState({})
  const [config, setConfig]       = useState({})
  const [tab, setTab]             = useState('registrar')

  // form
  const [fecha, setFecha]         = useState(hoy())
  const [kmInicio, setKmInicio]   = useState('')
  const [kmFin, setKmFin]         = useState('')
  const [motivo, setMotivo]       = useState('Ventas')
  const [notas, setNotas]         = useState('')
  const [crearGasto, setCrearGasto] = useState(false)
  const [loading, setLoading]     = useState(false)

  // config
  const [precioComb, setPrecioComb] = useState('')
  const [consumo, setConsumo]       = useState('')
  const [savingCfg, setSavingCfg]   = useState(false)

  useEffect(() => {
    const unR = onValue(ref(db, 'kilometros'),       s => setRegistros(s.exists() ? s.val() : {}))
    const unC = onValue(ref(db, 'configuracion/km'), s => {
      if (s.exists()) {
        const v = s.val()
        setConfig(v)
        setPrecioComb(v.precioCombustible ? String(v.precioCombustible) : '')
        setConsumo(v.consumoPor100km ? String(v.consumoPor100km) : '')
      }
    })
    return () => { unR(); unC() }
  }, [])

  const precioCombNum = parseFloat(config.precioCombustible) || 0
  const consumoNum    = parseFloat(config.consumoPor100km)   || 0

  function calcCosto(km) {
    if (!precioCombNum || !consumoNum) return null
    return (km / 100) * consumoNum * precioCombNum
  }

  async function guardar(e) {
    e.preventDefault()
    const inicio = parseFloat(kmInicio)
    const fin    = parseFloat(kmFin)
    if (!inicio || !fin || fin <= inicio) return
    const km    = fin - inicio
    const costo = calcCosto(km)
    setLoading(true)
    try {
      const registro = {
        fecha, kmInicio: inicio, kmFin: fin, km,
        motivo, notas: notas.trim() || null,
        costo: costo ? Math.round(costo) : null,
        usuario, timestamp: Date.now(),
      }
      await push(ref(db, 'kilometros'), registro)
      if (crearGasto && costo) {
        await push(ref(db, 'gastos'), {
          tipo:      'Combustible',
          razon:     `Combustible – ${motivo} (${fmtKm(km)})`,
          monto:     Math.round(costo),
          fecha,
          timestamp: Date.now(),
          usuario,
        })
      }
      setKmInicio(''); setKmFin(''); setNotas(''); setCrearGasto(false)
    } finally { setLoading(false) }
  }

  async function guardarConfig(e) {
    e.preventDefault()
    setSavingCfg(true)
    try {
      await set(ref(db, 'configuracion/km'), {
        precioCombustible: parseFloat(precioComb) || 0,
        consumoPor100km:   parseFloat(consumo) || 0,
      })
    } finally { setSavingCfg(false) }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este registro?')) return
    await update(ref(db, `kilometros/${id}`), { deleted: true })
  }

  const lista = Object.entries(registros)
    .filter(([, r]) => !r.deleted)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => b.timestamp - a.timestamp)

  // Group by semana
  const porSemana = {}
  lista.forEach(r => {
    const k = semanaLabel(r.fecha)
    if (!porSemana[k]) porSemana[k] = []
    porSemana[k].push(r)
  })

  const totalKmSemana = lista.filter(r => semanaLabel(r.fecha) === semanaLabel(hoy())).reduce((s, r) => s + (r.km || 0), 0)
  const totalCostoSemana = lista.filter(r => semanaLabel(r.fecha) === semanaLabel(hoy()) && r.costo).reduce((s, r) => s + r.costo, 0)

  const kmEstimadoHoy = lista.filter(r => r.fecha === hoy()).reduce((s, r) => s + (r.km || 0), 0)
  const costoHoy = calcCosto(kmEstimadoHoy)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">🚗 Kilómetros</h1>
      </div>

      {/* Summary cards */}
      {(kmEstimadoHoy > 0 || totalKmSemana > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Hoy</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--navy)', marginTop: 4 }}>{fmtKm(kmEstimadoHoy)}</div>
            {costoHoy != null && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(costoHoy)}</div>}
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Esta semana</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--navy)', marginTop: 4 }}>{fmtKm(totalKmSemana)}</div>
            {totalCostoSemana > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(totalCostoSemana)}</div>}
          </div>
          {precioCombNum > 0 && consumoNum > 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Costo / 100 km</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--navy)', marginTop: 4 }}>{fmt(precioCombNum * consumoNum / 100 * 100)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{consumoNum}L · {fmt(precioCombNum)}/L</div>
            </div>
          )}
        </div>
      )}

      <div className="tabs mb-16">
        <button className={`tab-btn ${tab === 'registrar' ? 'active' : ''}`} onClick={() => setTab('registrar')}>➕ Registrar</button>
        <button className={`tab-btn ${tab === 'historial' ? 'active' : ''}`} onClick={() => setTab('historial')}>📋 Historial</button>
        <button className={`tab-btn ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>⚙️ Config</button>
      </div>

      {tab === 'registrar' && (
        <div className="card">
          <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>Nuevo registro</h3>
          <form onSubmit={guardar}>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-input" type="text" placeholder="dd/mm/yyyy"
                value={fecha} onChange={e => setFecha(e.target.value)} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Km inicio (odómetro)</label>
                <input className="form-input" type="number" min="0" step="0.1" placeholder="50000"
                  value={kmInicio} onChange={e => setKmInicio(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Km fin (odómetro)</label>
                <input className="form-input" type="number" min="0" step="0.1" placeholder="50150"
                  value={kmFin} onChange={e => setKmFin(e.target.value)} required />
              </div>
            </div>

            {kmInicio && kmFin && parseFloat(kmFin) > parseFloat(kmInicio) && (
              <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>Recorrido</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--navy)' }}>{fmtKm(parseFloat(kmFin) - parseFloat(kmInicio))}</div>
                </div>
                {calcCosto(parseFloat(kmFin) - parseFloat(kmInicio)) != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>Costo combustible</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--red)' }}>{fmt(calcCosto(parseFloat(kmFin) - parseFloat(kmInicio)))}</div>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Motivo</label>
              <select className="form-input" value={motivo} onChange={e => setMotivo(e.target.value)}>
                <option>Ventas</option>
                <option>Reparto</option>
                <option>Gestiones</option>
                <option>Otro</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notas (opcional)</label>
              <input className="form-input" type="text" placeholder="Ej: zona norte, clientes Capitán Bermúdez..."
                value={notas} onChange={e => setNotas(e.target.value)} />
            </div>

            {calcCosto(parseFloat(kmFin) - parseFloat(kmInicio)) != null && parseFloat(kmFin) > parseFloat(kmInicio) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={crearGasto} onChange={e => setCrearGasto(e.target.checked)}
                  style={{ width: 18, height: 18 }} />
                Registrar también como gasto de combustible
              </label>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Guardando...' : '💾 Guardar registro'}
            </button>
          </form>
        </div>
      )}

      {tab === 'historial' && (
        <div>
          {lista.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
              <div className="fw-700" style={{ fontSize: 16 }}>Sin registros aún</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Registrá tus recorridos en la pestaña "Registrar"</div>
            </div>
          ) : (
            Object.entries(porSemana).map(([semana, regs]) => (
              <div key={semana} className="card mb-16">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className="fw-800" style={{ fontSize: 14 }}>{semana}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>
                    {fmtKm(regs.reduce((s, r) => s + r.km, 0))}
                    {regs.some(r => r.costo) && ` · ${fmt(regs.reduce((s, r) => s + (r.costo || 0), 0))}`}
                  </span>
                </div>
                {regs.map(r => (
                  <div key={r.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="fw-700" style={{ fontSize: 15 }}>{fmtKm(r.km)}</span>
                        <span style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 20, color: 'var(--muted)', fontWeight: 600 }}>{r.motivo}</span>
                        {r.costo && <span className="text-red fw-600" style={{ fontSize: 12 }}>{fmt(r.costo)}</span>}
                      </div>
                      <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {r.fecha} · {r.kmInicio} → {r.kmFin} km · {r.usuario}
                      </div>
                      {r.notas && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{r.notas}</div>}
                    </div>
                    <button onClick={() => eliminar(r.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '2px 6px' }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'config' && (
        <div className="card">
          <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>⚙️ Configuración de combustible</h3>
          <form onSubmit={guardarConfig}>
            <div className="form-group">
              <label className="form-label">Precio combustible ($ / litro)</label>
              <input className="form-input" type="number" min="0" step="1" placeholder="Ej: 1200"
                value={precioComb} onChange={e => setPrecioComb(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Consumo del auto (litros / 100 km)</label>
              <input className="form-input" type="number" min="0" step="0.1" placeholder="Ej: 8.5"
                value={consumo} onChange={e => setConsumo(e.target.value)} />
            </div>
            {precioComb && consumo && (
              <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#92400e', fontWeight: 700 }}>
                  Costo estimado por 100 km: <strong>{fmt(parseFloat(precioComb) * parseFloat(consumo))}</strong>
                </div>
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={savingCfg}>
              {savingCfg ? 'Guardando...' : '💾 Guardar configuración'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
