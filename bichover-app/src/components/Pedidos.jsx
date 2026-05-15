import { useState, useEffect } from 'react'
import { ref, onValue, push, update, remove } from 'firebase/database'
import { db } from '../firebase.js'
import ClienteSelector from './ClienteSelector.jsx'

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function diasDesde(fechaStr) {
  if (!fechaStr) return null
  const [d, m, y] = fechaStr.split('/')
  const diff = Date.now() - new Date(+y, +m - 1, +d).getTime()
  return Math.floor(diff / 86400000)
}

function EntregarModal({ pedido, pedidoId, clientes, usuarios, usuario, onClose }) {
  const [precio, setPrecio] = useState(pedido.precioVenta ? String(pedido.precioVenta) : '')
  const [loading, setLoading] = useState(false)
  const clienteData = clientes[pedido.clienteKey]
  const precioHabitual = clienteData?.precioHabitual

  useEffect(() => {
    if (!precio && precioHabitual) setPrecio(String(precioHabitual))
  }, [])

  const precioNum = parseFloat(precio) || 0
  const total = pedido.cantidadFrascos * precioNum
  const vendedor = pedido.usuario || usuario
  const stockActual = usuarios[vendedor]?.stock ?? 0
  const stockPost = stockActual - pedido.cantidadFrascos

  async function confirmar(e) {
    e.preventDefault()
    if (!precioNum) return
    setLoading(true)
    try {
      await push(ref(db, 'ventas'), {
        clienteKey:      pedido.clienteKey,
        cliente:         pedido.cliente,
        cantidadFrascos: pedido.cantidadFrascos,
        precioVenta:     precioNum,
        fechaVenta:      hoy(),
        timestamp:       Date.now(),
        usuario:         vendedor,
        repartido:       false,
        canal:           'Presencial',
      })
      const updates = {}
      updates[`clientes/${pedido.clienteKey}/cantidadFrascos`] = (clienteData?.cantidadFrascos || 0) + pedido.cantidadFrascos
      updates[`clientes/${pedido.clienteKey}/fechaUltimaCompra`] = hoy()
      updates[`clientes/${pedido.clienteKey}/precioHabitual`] = precioNum
      updates[`usuarios/${vendedor}/stock`] = Math.max(0, stockPost)
      updates[`pedidos/${pedidoId}/estado`] = 'entregado'
      updates[`pedidos/${pedidoId}/fechaEntrega`] = hoy()
      updates[`pedidos/${pedidoId}/precioVenta`] = precioNum
      await update(ref(db), updates)
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">✅ Entregar pedido</div>
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div className="fw-700" style={{ fontSize: 15 }}>{pedido.cliente}</div>
          <div className="text-muted" style={{ fontSize: 13 }}>{pedido.cantidadFrascos} frascos · Pedido: {pedido.fechaPedido}</div>
          {pedido.notas && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>"{pedido.notas}"</div>}
        </div>
        <form onSubmit={confirmar}>
          <div className="form-group">
            <label className="form-label">Precio por frasco ($)</label>
            <input className="form-input" type="number" min="0" step="0.01" placeholder="0"
              value={precio} onChange={e => setPrecio(e.target.value)} required autoFocus />
          </div>
          {precioNum > 0 && (
            <div style={{ background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="text-muted fw-600" style={{ fontSize: 12 }}>Total a cobrar</div>
                <div className="fw-800 text-green" style={{ fontSize: 22 }}>{fmt(total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="text-muted fw-600" style={{ fontSize: 12 }}>Stock de {vendedor} post-entrega</div>
                <div className={`fw-800 ${stockPost >= 5 ? 'text-blue' : 'text-red'}`} style={{ fontSize: 18 }}>
                  {stockPost} frascos
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-success" type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Guardando...' : '✅ Confirmar entrega'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Pedidos({ usuario }) {
  const [pedidos, setPedidos]     = useState({})
  const [clientes, setClientes]   = useState({})
  const [usuarios, setUsuarios]   = useState({})
  const [clienteKey, setClienteKey] = useState('')
  const [cantidad, setCantidad]   = useState('')
  const [precio, setPrecio]       = useState('')
  const [notas, setNotas]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [entregando, setEntregando] = useState(null)
  const [verHistorial, setVerHistorial] = useState(false)

  useEffect(() => {
    const unP = onValue(ref(db, 'pedidos'),   s => setPedidos(s.exists()   ? s.val() : {}))
    const unC = onValue(ref(db, 'clientes'),  s => setClientes(s.exists()  ? s.val() : {}))
    const unU = onValue(ref(db, 'usuarios'),  s => setUsuarios(s.exists()  ? s.val() : {}))
    return () => { unP(); unC(); unU() }
  }, [])

  useEffect(() => {
    if (clienteKey && clientes[clienteKey]?.precioHabitual != null) {
      setPrecio(String(clientes[clienteKey].precioHabitual))
    }
  }, [clienteKey])

  async function guardar(e) {
    e.preventDefault()
    if (!clienteKey) return
    setLoading(true)
    try {
      await push(ref(db, 'pedidos'), {
        clienteKey,
        cliente:         clientes[clienteKey].razonSocial,
        cantidadFrascos: parseFloat(cantidad),
        precioVenta:     parseFloat(precio) || null,
        notas:           notas.trim() || null,
        fechaPedido:     hoy(),
        timestamp:       Date.now(),
        usuario,
        estado:          'pendiente',
      })
      const otroSocio = usuario === 'Seba' ? 'Juan' : 'Seba'
      await push(ref(db, `notificaciones/${otroSocio}`), {
        tipo: 'pedido', de: usuario,
        mensaje: `Nuevo pedido: ${clientes[clienteKey].razonSocial} — ${cantidad} frascos 📋`,
        timestamp: Date.now(), leida: false,
      })
      setClienteKey(''); setCantidad(''); setPrecio(''); setNotas('')
    } finally { setLoading(false) }
  }

  async function cancelar(id) {
    await update(ref(db, `pedidos/${id}`), { estado: 'cancelado', fechaCancelado: hoy() })
  }

  const pendientes = Object.entries(pedidos)
    .filter(([, p]) => p.estado === 'pendiente')
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.timestamp - b.timestamp)

  const historial = Object.entries(pedidos)
    .filter(([, p]) => p.estado !== 'pendiente')
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30)

  const totalFrascosPendientes = pendientes.reduce((s, p) => s + (p.cantidadFrascos || 0), 0)

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📋 Pedidos pendientes</h1>
        {pendientes.length > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 10, padding: '6px 14px', fontWeight: 800, color: '#92400e', fontSize: 14 }}>
            {pendientes.length} pedido{pendientes.length !== 1 ? 's' : ''} · {totalFrascosPendientes} frascos
          </div>
        )}
      </div>

      {/* Form nuevo encargo */}
      <div className="card mb-16">
        <h3 className="fw-800 mb-12" style={{ fontSize: 16 }}>➕ Nuevo encargo</h3>
        <form onSubmit={guardar}>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <ClienteSelector clientes={clientes} value={clienteKey} onChange={setClienteKey} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Frascos</label>
              <input className="form-input" type="number" min="1" placeholder="0"
                value={cantidad} onChange={e => setCantidad(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Precio / frasco (opcional)</label>
              <input className="form-input" type="number" min="0" step="0.01" placeholder="0"
                value={precio} onChange={e => setPrecio(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notas (opcional)</label>
            <input className="form-input" type="text" placeholder="Ej: llamar antes de ir, entrega en negocio..."
              value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Guardando...' : '💾 Registrar encargo'}
          </button>
        </form>
      </div>

      {/* Lista pendientes */}
      {pendientes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div className="fw-700" style={{ fontSize: 16 }}>Sin pedidos pendientes</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Todos los encargos están entregados</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pendientes.map(p => {
            const dias = diasDesde(p.fechaPedido)
            return (
              <div key={p.id} className="card" style={{ borderLeft: '4px solid var(--amber)', padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fw-800" style={{ fontSize: 16 }}>{p.cliente}</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                      <span className="fw-700 text-amber" style={{ fontSize: 15 }}>{p.cantidadFrascos} frascos</span>
                      {p.precioVenta && (
                        <span className="text-muted" style={{ fontSize: 13 }}>· {fmt(p.cantidadFrascos * p.precioVenta)}</span>
                      )}
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        · {p.fechaPedido}
                        {dias != null && dias > 0 && (
                          <span style={{ color: dias >= 3 ? 'var(--red)' : 'var(--muted)' }}> ({dias}d)</span>
                        )}
                      </span>
                    </div>
                    {p.notas && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                        📝 {p.notas}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      Tomado por {p.usuario}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-success btn-sm"
                      onClick={() => setEntregando({ pedido: p, id: p.id })}>
                      ✅ Entregar
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => cancelar(p.id)}>
                      ❌
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div className="card mt-20">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: verHistorial ? 12 : 0 }}
            onClick={() => setVerHistorial(v => !v)}>
            <span className="fw-700" style={{ fontSize: 14 }}>Historial de pedidos</span>
            <span>{verHistorial ? '▲' : '▼'}</span>
          </div>
          {verHistorial && historial.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div className="fw-600" style={{ fontSize: 14 }}>{p.cliente}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{p.cantidadFrascos} frascos · {p.fechaPedido}</div>
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: p.estado === 'entregado' ? '#ecfdf5' : '#fef2f2',
                color: p.estado === 'entregado' ? 'var(--green)' : 'var(--red)',
              }}>
                {p.estado === 'entregado' ? '✅ Entregado' : '❌ Cancelado'}
              </span>
            </div>
          ))}
        </div>
      )}

      {entregando && (
        <EntregarModal
          pedido={entregando.pedido}
          pedidoId={entregando.id}
          clientes={clientes}
          usuarios={usuarios}
          usuario={usuario}
          onClose={() => setEntregando(null)}
        />
      )}
    </div>
  )
}
