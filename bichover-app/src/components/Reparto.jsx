import { useState, useEffect } from 'react'
import { ref, onValue, update, push, set, remove } from 'firebase/database'
import { db } from '../firebase.js'

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ fontSize: 16 }}>⚠️ Confirmar</div>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>{mensaje}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={onConfirm}>Sí, eliminar</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function Reparto({ usuario }) {
  const [ventas, setVentas]     = useState({})
  const [gastos, setGastos]     = useState({})
  const [repartos, setRepartos] = useState({})

  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin]       = useState('')
  const [resultado, setResultado]     = useState(null)
  const [guardando, setGuardando]     = useState(false)
  const [confirm, setConfirm]         = useState(null)

  useEffect(() => {
    const unV = onValue(ref(db, 'ventas'),   s => setVentas(s.exists()   ? s.val() : {}))
    const unG = onValue(ref(db, 'gastos'),   s => setGastos(s.exists()   ? s.val() : {}))
    const unR = onValue(ref(db, 'repartos'), s => setRepartos(s.exists() ? s.val() : {}))
    return () => { unV(); unG(); unR() }
  }, [])

  function calcular(e) {
    e.preventDefault()
    const desde = new Date(fechaInicio).getTime()
    const hasta = new Date(fechaFin + 'T23:59:59').getTime()

    const ventasFiltradas = Object.entries(ventas)
      .filter(([, v]) => !v.repartido && v.timestamp >= desde && v.timestamp <= hasta)

    const gastosFiltrados = Object.entries(gastos)
      .filter(([, g]) => !g.repartido && g.monto > 0 && g.timestamp >= desde && g.timestamp <= hasta)

    const socios = ['Seba', 'Juan']
    const netos = socios.map(s => {
      const vSocio = ventasFiltradas.filter(([, v]) => v.usuario === s)
        .reduce((a, [, v]) => a + v.cantidadFrascos * v.precioVenta, 0)
      const gSocio = gastosFiltrados.filter(([, g]) => g.usuario === s)
        .reduce((a, [, g]) => a + g.monto, 0)
      return { usuario: s, ventas: vSocio, gastos: gSocio, neto: vSocio - gSocio }
    })

    const totalNeto = netos.reduce((a, n) => a + n.neto, 0)
    const esperado  = totalNeto / 2

    let mensaje = ''
    const diff = Math.abs(netos[0].neto - esperado)
    if (diff < 1) {
      mensaje = '✅ Los socios están equilibrados'
    } else if (netos[0].neto > esperado) {
      mensaje = `Seba le debe pagar ${fmt(diff)} a Juan`
    } else {
      mensaje = `Juan le debe pagar ${fmt(diff)} a Seba`
    }

    setResultado({
      netos, totalNeto, esperado, mensaje,
      ventasIds: ventasFiltradas.map(([id]) => id),
      gastosIds: gastosFiltrados.map(([id]) => id),
      cantVentas: ventasFiltradas.length,
      cantGastos: gastosFiltrados.length,
    })
  }

  async function guardarReparto() {
    if (!resultado) return
    setGuardando(true)
    try {
      const updates = {}
      resultado.ventasIds.forEach(id => { updates[`ventas/${id}/repartido`] = true })
      resultado.gastosIds.forEach(id => { updates[`gastos/${id}/repartido`] = true })
      await update(ref(db), updates)

      const [y1, m1, d1] = fechaInicio.split('-')
      const [y2, m2, d2] = fechaFin.split('-')

      await push(ref(db, 'repartos'), {
        fechaInicio:  `${d1}/${m1}/${y1}`,
        fechaFin:     `${d2}/${m2}/${y2}`,
        fechaReparto: hoy(),
        timestamp:    Date.now(),
        totalNeto:    resultado.totalNeto,
        mensaje:      resultado.mensaje,
        netos:        resultado.netos,
        ventasIds:    resultado.ventasIds,
        gastosIds:    resultado.gastosIds,
      })
      setResultado(null)
      setFechaInicio('')
      setFechaFin('')
    } finally { setGuardando(false) }
  }

  async function eliminarReparto(id) {
    setConfirm(null)
    const reparto = repartos[id]

    // Revertir repartido=false en ventas y gastos incluidos
    const updates = {}

    if (Array.isArray(reparto.ventasIds) && reparto.ventasIds.length > 0) {
      // IDs guardados directamente en el reparto (repartos nuevos)
      reparto.ventasIds.forEach(vid => { updates[`ventas/${vid}/repartido`] = false })
    } else {
      // Fallback para repartos viejos sin IDs: buscar por rango de fechas
      const [d1, m1, y1] = (reparto.fechaInicio || '').split('/')
      const [d2, m2, y2] = (reparto.fechaFin    || '').split('/')
      const desde = new Date(`${y1}-${m1}-${d1}`).getTime()
      const hasta  = new Date(`${y2}-${m2}-${d2}T23:59:59`).getTime()
      Object.entries(ventas).forEach(([vid, v]) => {
        if (v.repartido && v.timestamp >= desde && v.timestamp <= hasta)
          updates[`ventas/${vid}/repartido`] = false
      })
    }

    if (Array.isArray(reparto.gastosIds) && reparto.gastosIds.length > 0) {
      reparto.gastosIds.forEach(gid => { updates[`gastos/${gid}/repartido`] = false })
    } else {
      const [d1, m1, y1] = (reparto.fechaInicio || '').split('/')
      const [d2, m2, y2] = (reparto.fechaFin    || '').split('/')
      const desde = new Date(`${y1}-${m1}-${d1}`).getTime()
      const hasta  = new Date(`${y2}-${m2}-${d2}T23:59:59`).getTime()
      Object.entries(gastos).forEach(([gid, g]) => {
        if (g.repartido && g.monto > 0 && g.timestamp >= desde && g.timestamp <= hasta)
          updates[`gastos/${gid}/repartido`] = false
      })
    }

    if (Object.keys(updates).length > 0) await update(ref(db), updates)
    await set(ref(db, `repartosEliminados/${id}`), reparto)
    await remove(ref(db, `repartos/${id}`))
  }

  const historial = Object.entries(repartos)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">🤝 Reparto de Ganancias</h1>
      </div>

      {/* Formulario */}
      <div className="card mb-16">
        <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>Calcular período</h3>
        <form onSubmit={calcular}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Fecha inicio</label>
              <input className="form-input" type="date"
                value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha fin</label>
              <input className="form-input" type="date"
                value={fechaFin} onChange={e => setFechaFin(e.target.value)} required />
            </div>
          </div>
          <button className="btn btn-primary" type="submit">🧮 Calcular</button>
        </form>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="card mb-16">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 className="fw-800" style={{ fontSize: 16 }}>Resultado del período</h3>
            <span className="text-muted" style={{ fontSize: 13 }}>
              {resultado.cantVentas} ventas · {resultado.cantGastos} gastos incluidos
            </span>
          </div>

          <div className="reparto-result-grid">
            {resultado.netos.map(n => (
              <div key={n.usuario} style={{
                background: n.usuario === 'Seba' ? '#e8f1ff' : '#f3f0ff',
                borderRadius: 12, padding: 16,
                border: `2px solid ${n.usuario === 'Seba' ? 'var(--blue)' : 'var(--purple)'}`,
              }}>
                <div className="fw-800 mb-8" style={{ fontSize: 16, color: n.usuario === 'Seba' ? 'var(--blue)' : 'var(--purple)' }}>
                  {n.usuario === 'Seba' ? '🔵' : '🟣'} {n.usuario}
                </div>
                <div className="stat-row">
                  <span className="stat-label">Ventas</span>
                  <span className="stat-value text-green">{fmt(n.ventas)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Gastos</span>
                  <span className="stat-value text-red">{fmt(n.gastos)}</span>
                </div>
                <div className="stat-row" style={{ borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 8, marginTop: 4 }}>
                  <span className="stat-label fw-700">Neto</span>
                  <span className="stat-value fw-800" style={{ fontSize: 18 }}>{fmt(n.neto)}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fffbeb', border: '2px solid var(--amber)', borderRadius: 12, padding: '14px 18px', marginBottom: 16, fontWeight: 700, fontSize: 15, color: '#92400e' }}>
            {resultado.mensaje}
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="stat-row" style={{ flex: 1 }}>
              <span className="stat-label">Ganancia total</span>
              <span className="stat-value text-blue fw-800" style={{ fontSize: 18 }}>{fmt(resultado.totalNeto)}</span>
            </div>
            <div className="stat-row" style={{ flex: 1 }}>
              <span className="stat-label">Esperado por socio</span>
              <span className="stat-value fw-800" style={{ fontSize: 18 }}>{fmt(resultado.esperado)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-success" onClick={guardarReparto} disabled={guardando}>
              {guardando ? 'Guardando...' : '💾 Guardar y Marcar como Repartido'}
            </button>
            <button className="btn btn-ghost" onClick={() => setResultado(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div className="card">
          <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>Historial de repartos</h3>
          {historial.map(r => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div>
                  <div className="fw-700" style={{ fontSize: 14 }}>{r.fechaInicio} → {r.fechaFin}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Guardado: {r.fechaReparto}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="fw-800 text-blue" style={{ fontSize: 16 }}>{fmt(r.totalNeto)}</span>
                  <button className="btn btn-danger btn-sm"
                    onClick={() => setConfirm({ id: r.id, periodo: `${r.fechaInicio} → ${r.fechaFin}` })}>
                    🗑
                  </button>
                </div>
              </div>
              <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
                {r.mensaje}
              </div>
              {Array.isArray(r.netos) && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {r.netos.map(n => (
                    <div key={n.usuario} className="text-muted" style={{ fontSize: 13 }}>
                      <strong>{n.usuario}</strong>: ventas {fmt(n.ventas)} · gastos {fmt(n.gastos)} · neto {fmt(n.neto)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          mensaje={`¿Eliminás el reparto del período ${confirm.periodo}? Esta acción no desmarca los ítems ya repartidos.`}
          onConfirm={() => eliminarReparto(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
