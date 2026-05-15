import { useState, useEffect } from 'react'
import { ref, onValue, update, push, get } from 'firebase/database'
import { db } from '../firebase.js'

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

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
  const [produccion, setProduccion]   = useState({})
  const [transferencias, setTransferencias] = useState({})
  const [tfCantidad, setTfCantidad]   = useState('')
  const [tfLoading, setTfLoading]     = useState(false)
  const [tfMsg, setTfMsg]             = useState('')
  const [stockMinimos, setStockMinimos] = useState({ seba: '', juan: '', DR: '', AC: '', vacios: '' })
  const [savingMinimos, setSavingMinimos] = useState(false)
  const [msgMinimos, setMsgMinimos]   = useState('')

  // Produccion form state
  const [prodForm, setProdForm] = useState({ frascosProducidos: '', drUsado: '', acUsado: '', vaciosUsados: '' })
  const [savingProd, setSavingProd] = useState(false)
  const [msgProd, setMsgProd]     = useState('')

  useEffect(() => {
    const unU = onValue(ref(db, 'usuarios'),       s => setUsuarios(s.exists()       ? s.val() : {}))
    const unC = onValue(ref(db, 'componentes'),    s => setComponentes(s.exists()    ? s.val() : {}))
    const unP = onValue(ref(db, 'produccion'),     s => setProduccion(s.exists()     ? s.val() : {}))
    const unT = onValue(ref(db, 'transferencias'), s => setTransferencias(s.exists() ? s.val() : {}))
    const unM = onValue(ref(db, 'configuracion/stockMinimos'), s => {
      if (s.exists()) {
        const v = s.val()
        setStockMinimos({
          seba:   v.seba   != null ? String(v.seba)   : '',
          juan:   v.juan   != null ? String(v.juan)   : '',
          DR:     v.DR     != null ? String(v.DR)     : '',
          AC:     v.AC     != null ? String(v.AC)     : '',
          vacios: v.vacios != null ? String(v.vacios) : '',
        })
      }
    })
    return () => { unU(); unC(); unP(); unT(); unM() }
  }, [])

  const otroSocio = usuario === 'Seba' ? 'Juan' : 'Seba'

  async function transferir(e) {
    e.preventDefault()
    const cant = parseInt(tfCantidad)
    if (!cant || cant <= 0) return
    const stockMio = usuarios[usuario]?.stock ?? 0
    if (cant > stockMio) { setTfMsg('⚠️ No tenés suficiente stock'); return }
    setTfLoading(true)
    setTfMsg('')
    try {
      const updates = {}
      updates[`usuarios/${usuario}/stock`]    = stockMio - cant
      updates[`usuarios/${otroSocio}/stock`]  = (usuarios[otroSocio]?.stock ?? 0) + cant
      await update(ref(db), updates)
      await push(ref(db, 'transferencias'), {
        de: usuario, para: otroSocio, cantidad: cant, fecha: hoy(), timestamp: Date.now(),
      })
      await push(ref(db, `notificaciones/${otroSocio}`), {
        tipo: 'transferencia', de: usuario,
        mensaje: `${usuario} te transfirió ${cant} frasco${cant !== 1 ? 's' : ''} 🔄`,
        timestamp: Date.now(), leida: false,
      })
      setTfCantidad('')
      setTfMsg(`✅ ${cant} frascos transferidos a ${otroSocio}`)
    } finally { setTfLoading(false) }
  }

  const stockSeba       = usuarios.Seba?.stock ?? 0
  const stockJuan       = usuarios.Juan?.stock ?? 0
  const stockTotal      = stockSeba + stockJuan
  const stockDR         = componentes.DR     ?? 0
  const stockAC         = componentes.AC     ?? 0
  const frascosVacios   = componentes.vacios ?? 0
  const stockActual     = usuarios[usuario]?.stock ?? 0

  // Stock alerts
  const alertas = []
  const minSeba   = stockMinimos.seba   !== '' ? Number(stockMinimos.seba)   : null
  const minJuan   = stockMinimos.juan   !== '' ? Number(stockMinimos.juan)   : null
  const minDR     = stockMinimos.DR     !== '' ? Number(stockMinimos.DR)     : null
  const minAC     = stockMinimos.AC     !== '' ? Number(stockMinimos.AC)     : null
  const minVacios = stockMinimos.vacios !== '' ? Number(stockMinimos.vacios) : null
  if (minSeba   != null && stockSeba   < minSeba)   alertas.push(`Frascos Seba: ${stockSeba} (mín. ${minSeba})`)
  if (minJuan   != null && stockJuan   < minJuan)   alertas.push(`Frascos Juan: ${stockJuan} (mín. ${minJuan})`)
  if (minDR     != null && stockDR     < minDR)     alertas.push(`DR: ${stockDR} (mín. ${minDR})`)
  if (minAC     != null && stockAC     < minAC)     alertas.push(`AC: ${stockAC} (mín. ${minAC})`)
  if (minVacios != null && frascosVacios < minVacios) alertas.push(`Vacíos: ${frascosVacios} (mín. ${minVacios})`)

  // Produccion preview
  const prodFrascos = parseInt(prodForm.frascosProducidos) || 0
  const prodDR      = parseInt(prodForm.drUsado)           || 0
  const prodAC      = parseInt(prodForm.acUsado)           || 0
  const prodVacios  = parseInt(prodForm.vaciosUsados)      || 0

  const postDR      = stockDR     - prodDR
  const postAC      = stockAC     - prodAC
  const postVacios  = frascosVacios - prodVacios
  const postStock   = stockActual + prodFrascos

  async function handleProduccion(e) {
    e.preventDefault()
    if (!prodFrascos) return
    setSavingProd(true)
    setMsgProd('')
    try {
      await push(ref(db, 'produccion'), {
        fecha: hoy(),
        timestamp: Date.now(),
        usuario,
        drUsado: prodDR,
        acUsado: prodAC,
        vaciosUsados: prodVacios,
        frascosProducidos: prodFrascos,
      })
      await update(ref(db, 'componentes'), {
        DR: Math.max(0, postDR),
        AC: Math.max(0, postAC),
        vacios: Math.max(0, postVacios),
      })
      await update(ref(db, `usuarios/${usuario}`), { stock: postStock })
      setProdForm({ frascosProducidos: '', drUsado: '', acUsado: '', vaciosUsados: '' })
      setMsgProd('✅ Producción registrada')
    } finally { setSavingProd(false) }
  }

  async function guardarMinimos(e) {
    e.preventDefault()
    setSavingMinimos(true)
    setMsgMinimos('')
    try {
      const data = {}
      if (stockMinimos.seba   !== '') data.seba   = Number(stockMinimos.seba)
      if (stockMinimos.juan   !== '') data.juan   = Number(stockMinimos.juan)
      if (stockMinimos.DR     !== '') data.DR     = Number(stockMinimos.DR)
      if (stockMinimos.AC     !== '') data.AC     = Number(stockMinimos.AC)
      if (stockMinimos.vacios !== '') data.vacios = Number(stockMinimos.vacios)
      await update(ref(db, 'configuracion/stockMinimos'), data)
      setMsgMinimos('✅ Alertas guardadas')
    } finally { setSavingMinimos(false) }
  }

  const historialProd = Object.entries(produccion)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📦 Stock</h1>
      </div>

      {/* Stock alert banner */}
      {alertas.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>⚠️ Stock bajo</div>
          {alertas.map(a => <div key={a} style={{ fontSize: 13, color: '#b91c1c' }}>{a}</div>)}
        </div>
      )}

      {/* Registrar producción */}
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'produccion' ? null : 'produccion')}>
          <span className="fw-800" style={{ fontSize: 15 }}>🏭 Registrar producción</span>
          <span style={{ fontSize: 18 }}>{expandido === 'produccion' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'produccion' && (
          <div style={{ marginTop: 14 }}>
            <form onSubmit={handleProduccion}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Frascos producidos</label>
                  <input className="form-input" type="number" min="1" step="1" placeholder="0" required
                    value={prodForm.frascosProducidos}
                    onChange={e => setProdForm(f => ({ ...f, frascosProducidos: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">DR usado</label>
                  <input className="form-input" type="number" min="0" step="1" placeholder="0" required
                    value={prodForm.drUsado}
                    onChange={e => setProdForm(f => ({ ...f, drUsado: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">AC usado</label>
                  <input className="form-input" type="number" min="0" step="1" placeholder="0" required
                    value={prodForm.acUsado}
                    onChange={e => setProdForm(f => ({ ...f, acUsado: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Vacíos usados</label>
                  <input className="form-input" type="number" min="0" step="1" placeholder="0" required
                    value={prodForm.vaciosUsados}
                    onChange={e => setProdForm(f => ({ ...f, vaciosUsados: e.target.value }))} />
                </div>
              </div>

              {(prodFrascos > 0 || prodDR > 0 || prodAC > 0 || prodVacios > 0) && (
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div className="fw-700 mb-8" style={{ fontSize: 13, color: 'var(--muted)' }}>Vista previa post-producción</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      <span className="text-muted">DR: </span>
                      <span className={`fw-800 ${postDR < 0 ? 'text-red' : 'text-green'}`}>{postDR}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}> (era {stockDR})</span>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <span className="text-muted">AC: </span>
                      <span className={`fw-800 ${postAC < 0 ? 'text-red' : 'text-green'}`}>{postAC}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}> (era {stockAC})</span>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <span className="text-muted">Vacíos: </span>
                      <span className={`fw-800 ${postVacios < 0 ? 'text-red' : 'text-green'}`}>{postVacios}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}> (era {frascosVacios})</span>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <span className="text-muted">Stock {usuario}: </span>
                      <span className="fw-800 text-blue">{postStock}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}> (era {stockActual})</span>
                    </div>
                  </div>
                </div>
              )}

              <button className="btn btn-primary btn-sm" type="submit" disabled={savingProd}>
                {savingProd ? 'Guardando...' : '🏭 Registrar producción'}
              </button>
              {msgProd && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>{msgProd}</div>}
            </form>

            {/* Historial producción */}
            <div style={{ marginTop: 20 }}>
              <div className="fw-700 mb-8" style={{ fontSize: 13, color: 'var(--muted)' }}>📋 Últimas 5 producciones</div>
              {historialProd.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin registros de producción.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {historialProd.map(p => (
                    <div key={p.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span className="fw-700" style={{ fontSize: 13 }}>{p.fecha}</span>
                        <span style={{ background: '#e8f1ff', color: 'var(--blue)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                          +{p.frascosProducidos} frascos
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {p.usuario} · DR: {p.drUsado} · AC: {p.acUsado} · Vacíos: {p.vaciosUsados}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
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

      {/* Transferir frascos al otro socio */}
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'transfer' ? null : 'transfer')}>
          <span className="fw-800" style={{ fontSize: 15 }}>🔄 Transferir frascos a {otroSocio}</span>
          <span style={{ fontSize: 18 }}>{expandido === 'transfer' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'transfer' && (
          <div style={{ marginTop: 14 }}>
            <form onSubmit={transferir} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
                <label className="form-label">Frascos a transferir</label>
                <input className="form-input" type="number" min="1" max={usuarios[usuario]?.stock ?? 0} step="1" placeholder="0"
                  value={tfCantidad} onChange={e => setTfCantidad(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={tfLoading} style={{ marginBottom: 2 }}>
                {tfLoading ? 'Transfiriendo...' : `🔄 Enviar a ${otroSocio}`}
              </button>
            </form>
            {tfCantidad && parseInt(tfCantidad) > 0 && (
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 12px', marginTop: 10, fontSize: 13 }}>
                <span className="text-muted">Stock {usuario} post-transferencia: </span>
                <span className="fw-800 text-blue">{(usuarios[usuario]?.stock ?? 0) - (parseInt(tfCantidad) || 0)}</span>
                <span className="text-muted"> · {otroSocio}: </span>
                <span className="fw-800 text-purple">{(usuarios[otroSocio]?.stock ?? 0) + (parseInt(tfCantidad) || 0)}</span>
              </div>
            )}
            {tfMsg && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: tfMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{tfMsg}</div>}

            {/* Historial de transferencias */}
            {Object.keys(transferencias).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="fw-700 mb-8" style={{ fontSize: 13, color: 'var(--muted)' }}>Últimas transferencias</div>
                {Object.entries(transferencias)
                  .map(([id, t]) => ({ id, ...t }))
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 5)
                  .map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                      <span className="fw-600">{t.de} → {t.para}: <strong>{t.cantidad} frascos</strong></span>
                      <span className="text-muted">{t.fecha}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Frascos vacíos */}
      <div className="fw-700 mb-8" style={{ fontSize: 14, color: 'var(--muted)' }}>Frascos vacíos</div>
      <div style={{ background: '#fdf4ff', border: '2px solid #a855f7', borderRadius: 14, padding: '20px', textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#6b21a8' }}>🫙 Vacíos</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: '#a855f7' }}>{frascosVacios}</div>
        <div style={{ fontSize: 12, color: '#9333ea' }}>unidades</div>
      </div>
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'vacios' ? null : 'vacios')}>
          <span className="fw-800" style={{ fontSize: 15 }}>Ajustar frascos vacíos</span>
          <span style={{ fontSize: 18 }}>{expandido === 'vacios' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'vacios' && (
          <AjusteForm
            label="vacíos"
            valorActual={frascosVacios}
            onGuardar={v => update(ref(db, 'componentes'), { vacios: v })}
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
          <AjusteForm label="DR" valorActual={stockDR}
            onGuardar={v => update(ref(db, 'componentes'), { DR: v })} />
        )}
      </div>

      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'AC' ? null : 'AC')}>
          <span className="fw-800" style={{ fontSize: 15 }}>Ajustar componente AC</span>
          <span style={{ fontSize: 18 }}>{expandido === 'AC' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'AC' && (
          <AjusteForm label="AC" valorActual={stockAC}
            onGuardar={v => update(ref(db, 'componentes'), { AC: v })} />
        )}
      </div>

      {/* Configurar alertas mínimas */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setExpandido(expandido === 'alertas' ? null : 'alertas')}>
          <span className="fw-800" style={{ fontSize: 15 }}>⚙️ Configurar alertas mínimas</span>
          <span style={{ fontSize: 18 }}>{expandido === 'alertas' ? '▲' : '▼'}</span>
        </div>
        {expandido === 'alertas' && (
          <form onSubmit={guardarMinimos} style={{ marginTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Frascos Seba (mín.)</label>
                <input className="form-input" type="number" min="0" step="1" placeholder="Sin alerta"
                  value={stockMinimos.seba}
                  onChange={e => setStockMinimos(m => ({ ...m, seba: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Frascos Juan (mín.)</label>
                <input className="form-input" type="number" min="0" step="1" placeholder="Sin alerta"
                  value={stockMinimos.juan}
                  onChange={e => setStockMinimos(m => ({ ...m, juan: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">DR (mín.)</label>
                <input className="form-input" type="number" min="0" step="1" placeholder="Sin alerta"
                  value={stockMinimos.DR}
                  onChange={e => setStockMinimos(m => ({ ...m, DR: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">AC (mín.)</label>
                <input className="form-input" type="number" min="0" step="1" placeholder="Sin alerta"
                  value={stockMinimos.AC}
                  onChange={e => setStockMinimos(m => ({ ...m, AC: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Vacíos (mín.)</label>
                <input className="form-input" type="number" min="0" step="1" placeholder="Sin alerta"
                  value={stockMinimos.vacios}
                  onChange={e => setStockMinimos(m => ({ ...m, vacios: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={savingMinimos}>
              {savingMinimos ? 'Guardando...' : '💾 Guardar alertas'}
            </button>
            {msgMinimos && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>{msgMinimos}</div>}
          </form>
        )}
      </div>
    </div>
  )
}
