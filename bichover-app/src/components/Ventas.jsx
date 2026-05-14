import { useState, useEffect } from 'react'
import { ref, onValue, push, update, set, remove } from 'firebase/database'
import { db } from '../firebase.js'

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ fontSize: 16 }}>⚠️ Confirmar eliminación</div>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>{mensaje}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={onConfirm}>Sí, eliminar</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export default function Ventas({ usuario }) {
  const [clientes, setClientes]         = useState({})
  const [ventas, setVentas]             = useState({})
  const [ventasEliminadas, setVentasEl] = useState({})
  const [usuarios, setUsuarios]         = useState({})
  const [showForm, setShowForm]         = useState(false)
  const [showEliminadas, setShowEl]     = useState(false)
  const [busqueda, setBusqueda]         = useState('')
  const [loading, setLoading]           = useState(false)
  const [confirm, setConfirm]           = useState(null)

  const [clienteKey, setClienteKey] = useState('')
  const [cantidad, setCantidad]     = useState('')
  const [precio, setPrecio]         = useState('')
  const [canal, setCanal]           = useState('Presencial')

  useEffect(() => {
    const unC = onValue(ref(db, 'clientes'),          s => setClientes(s.exists()  ? s.val() : {}))
    const unV = onValue(ref(db, 'ventas'),            s => setVentas(s.exists()    ? s.val() : {}))
    const unE = onValue(ref(db, 'ventasEliminadas'),  s => setVentasEl(s.exists()  ? s.val() : {}))
    const unU = onValue(ref(db, 'usuarios'),          s => setUsuarios(s.exists()  ? s.val() : {}))
    return () => { unC(); unV(); unE(); unU() }
  }, [])

  const stockActual = usuarios[usuario]?.stock ?? 0
  const cantNum     = parseFloat(cantidad) || 0
  const precioNum   = parseFloat(precio)   || 0
  const total       = cantNum * precioNum
  const stockPost   = stockActual - cantNum

  const clientesOrdenados = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => a.razonSocial?.localeCompare(b.razonSocial))

  async function handleGuardar(e) {
    e.preventDefault()
    if (!clienteKey) return
    setLoading(true)
    try {
      const cliente = clientes[clienteKey]
      await push(ref(db, 'ventas'), {
        clienteKey, cliente: cliente.razonSocial,
        cantidadFrascos: cantNum, precioVenta: precioNum,
        fechaVenta: hoy(), timestamp: Date.now(),
        usuario, repartido: false, canal,
      })
      await update(ref(db, `clientes/${clienteKey}`), {
        cantidadFrascos: (cliente.cantidadFrascos || 0) + cantNum,
        fechaUltimaCompra: hoy(),
      })
      await update(ref(db, `usuarios/${usuario}`), { stock: stockActual - cantNum })
      setCantidad(''); setPrecio(''); setClienteKey(''); setCanal('Presencial')
      setShowForm(false)
    } finally { setLoading(false) }
  }

  function pedirConfirmacion(id, v) {
    setConfirm({ id, venta: v })
  }

  async function confirmarEliminar() {
    const { id, venta: v } = confirm
    setConfirm(null)
    await set(ref(db, `ventasEliminadas/${id}`), { ...v, fechaEliminacion: hoy() })
    await remove(ref(db, `ventas/${id}`))
    const cliente = clientes[v.clienteKey]
    if (cliente) {
      await update(ref(db, `clientes/${v.clienteKey}`), {
        cantidadFrascos: Math.max(0, (cliente.cantidadFrascos || 0) - v.cantidadFrascos),
      })
    }
    const u = usuarios[v.usuario]
    if (u) {
      await update(ref(db, `usuarios/${v.usuario}`), { stock: (u.stock || 0) + v.cantidadFrascos })
    }
  }

  const totalHistorico = Object.values(ventas)
    .reduce((a, v) => a + v.cantidadFrascos * v.precioVenta, 0)

  const lista = Object.entries(ventas)
    .map(([id, v]) => ({ id, ...v }))
    .filter(v => !busqueda || v.cliente?.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => b.timestamp - a.timestamp)

  const listaEliminadas = Object.entries(ventasEliminadas)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">🛒 Ventas</h1>
          <div className="section-sub">Total histórico: <strong className="text-green">{fmt(totalHistorico)}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Cerrar' : '+ Nueva Venta'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-16">
          <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>Nueva venta</h3>
          <form onSubmit={handleGuardar}>
            <div className="form-group">
              <label className="form-label">Cliente</label>
              <select className="form-select" value={clienteKey}
                onChange={e => setClienteKey(e.target.value)} required>
                <option value="">— Seleccionar cliente —</option>
                {clientesOrdenados.map(c => (
                  <option key={c.id} value={c.id}>{c.razonSocial} — {c.localidad}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Cantidad de frascos</label>
                <input className="form-input" type="number" min="1" step="1" placeholder="0"
                  value={cantidad} onChange={e => setCantidad(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Precio por frasco ($)</label>
                <input className="form-input" type="number" min="0" step="0.01" placeholder="0"
                  value={precio} onChange={e => setPrecio(e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Canal de venta</label>
              <select className="form-select" value={canal} onChange={e => setCanal(e.target.value)}>
                <option value="Presencial">🤝 Presencial</option>
                <option value="Mercado Libre">🛍️ Mercado Libre</option>
              </select>
            </div>

            {(cantNum > 0 || precioNum > 0) && (
              <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div className="text-muted fw-600" style={{ fontSize: 12 }}>Total de la venta</div>
                  <div className="text-blue fw-800" style={{ fontSize: 28 }}>{fmt(total)}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{cantNum} frascos × {fmt(precioNum)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-muted fw-600" style={{ fontSize: 12 }}>Stock post-venta</div>
                  <div className={`fw-800 ${stockPost >= 5 ? 'text-green' : 'text-red'}`} style={{ fontSize: 22 }}>
                    {stockPost} frascos
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Guardando...' : '💾 Registrar Venta'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="search-wrap mb-16">
          <span className="search-icon">🔍</span>
          <input className="form-input" style={{ paddingLeft: 36 }}
            placeholder="Buscar por cliente..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>

        {lista.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🛒</div>
            <p>No hay ventas registradas</p>
          </div>
        ) : lista.map(v => (
          <div key={v.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <span className="fw-700" style={{ fontSize: 14 }}>{v.cliente}</span>
                {v.canal === 'Mercado Libre' && (
                  <span className="badge badge-amber" style={{ fontSize: 11 }}>🛍️ ML</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: 12 }}>{v.fechaVenta} · {v.usuario}</span>
                <span style={{ background: '#e8f1ff', color: 'var(--blue)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                  {v.cantidadFrascos} frascos
                </span>
                <span style={{ background: 'var(--bg)', color: 'var(--muted)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                  {fmt(v.precioVenta)} c/u
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="text-green fw-800" style={{ fontSize: 15 }}>
                {fmt(v.cantidadFrascos * v.precioVenta)}
              </span>
              {v.repartido
                ? <span className="badge badge-rep">✓ repartido</span>
                : <button className="btn btn-icon btn-danger btn-sm"
                    onClick={() => pedirConfirmacion(v.id, v)}>✕</button>
              }
            </div>
          </div>
        ))}
      </div>

      {/* Ventas eliminadas */}
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-ghost w-full" onClick={() => setShowEl(v => !v)}>
          {showEliminadas ? '▲ Ocultar' : '▼ Ver'} ventas eliminadas ({listaEliminadas.length})
        </button>
        {showEliminadas && listaEliminadas.length > 0 && (
          <div className="card mt-8">
            <div className="fw-800 mb-12" style={{ fontSize: 14, color: 'var(--red)' }}>🗑 Ventas eliminadas</div>
            {listaEliminadas.map(v => (
              <div key={v.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8, opacity: 0.7 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fw-700" style={{ fontSize: 14 }}>{v.cliente}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {v.fechaVenta} · {v.usuario} · eliminada: {v.fechaEliminacion || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <span style={{ background: '#e8f1ff', color: 'var(--blue)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                      {v.cantidadFrascos} frascos
                    </span>
                    <span style={{ background: 'var(--bg)', color: 'var(--muted)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                      {fmt(v.precioVenta)} c/u
                    </span>
                  </div>
                </div>
                <div className="text-red fw-800" style={{ fontSize: 14 }}>
                  {fmt(v.cantidadFrascos * v.precioVenta)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmModal
          mensaje={`¿Eliminás la venta de ${confirm.venta.cantidadFrascos} frascos a ${confirm.venta.cliente}? Se revierte el stock y el historial del cliente.`}
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
