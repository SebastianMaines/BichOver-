import { useState, useEffect } from 'react'
import { ref, onValue, push, update, set } from 'firebase/database'
import { db } from '../firebase.js'
import ClienteSelector from './ClienteSelector.jsx'

function diasDesdeStr(fechaStr) {
  if (!fechaStr) return null
  const [d, m, y] = fechaStr.split('/')
  return Math.floor((Date.now() - new Date(+y, +m - 1, +d).getTime()) / 86400000)
}

const TIPOS = ['Frascos', 'Producto', 'Etiquetas', 'Cajas', 'Nafta', 'Peaje', 'Transferencia', 'Otro']

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function QuickSaleModal({ usuario, clientes, usuarios, onClose }) {
  const [clienteKey, setClienteKey] = useState('')
  const [cantidad, setCantidad]     = useState('')
  const [precio, setPrecio]         = useState('')
  const [loading, setLoading]       = useState(false)

  const stockActual = usuarios[usuario]?.stock ?? 0
  const cantNum     = parseFloat(cantidad) || 0
  const precioNum   = parseFloat(precio) || 0
  const total       = cantNum * precioNum
  const stockPost   = stockActual - cantNum

  // Auto-fill precio from precioHabitual when client changes
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
      const cliente = clientes[clienteKey]
      await push(ref(db, 'ventas'), {
        clienteKey, cliente: cliente.razonSocial,
        cantidadFrascos: cantNum, precioVenta: precioNum,
        fechaVenta: hoy(), timestamp: Date.now(),
        usuario, repartido: false, canal: 'Presencial',
      })
      await update(ref(db, `clientes/${clienteKey}`), {
        cantidadFrascos: (cliente.cantidadFrascos || 0) + cantNum,
        fechaUltimaCompra: hoy(),
        precioHabitual: precioNum,
      })
      await update(ref(db, `usuarios/${usuario}`), { stock: stockActual - cantNum })
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">⚡ Venta Rápida</div>
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
              <label className="form-label">Precio / frasco</label>
              <input className="form-input" type="number" min="0" step="0.01" placeholder="0"
                value={precio} onChange={e => setPrecio(e.target.value)} required />
            </div>
          </div>
          {cantNum > 0 && precioNum > 0 && (
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="text-muted fw-600" style={{ fontSize: 12 }}>Total</div>
                <div className="text-blue fw-800" style={{ fontSize: 24 }}>{fmt(total)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="text-muted fw-600" style={{ fontSize: 12 }}>Stock post-venta</div>
                <div className={`fw-800 ${stockPost >= 5 ? 'text-green' : 'text-red'}`} style={{ fontSize: 18 }}>
                  {stockPost} frascos
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Guardando...' : '💾 Registrar'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function QuickExpenseModal({ usuario, onClose }) {
  const [tipo, setTipo]   = useState('Nafta')
  const [monto, setMonto] = useState('')
  const [razon, setRazon] = useState('')
  const [loading, setLoading] = useState(false)
  const otroSocio = usuario === 'Seba' ? 'Juan' : 'Seba'

  async function guardar(e) {
    e.preventDefault()
    setLoading(true)
    const montoNum = parseFloat(monto)
    const ts = Date.now()
    try {
      if (tipo === 'Transferencia') {
        await push(ref(db, 'gastos'), { tipo, monto: montoNum, razon, fecha: hoy(), timestamp: ts, usuario, repartido: false, destinatario: otroSocio })
        await push(ref(db, 'gastos'), { tipo: 'Transferencia', monto: -montoNum, razon: `Recibido de ${usuario}`, fecha: hoy(), timestamp: ts + 1, usuario: otroSocio, repartido: false, destinatario: usuario })
      } else {
        await push(ref(db, 'gastos'), { tipo, monto: montoNum, razon, fecha: hoy(), timestamp: ts, usuario, repartido: false })
      }
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">⚡ Gasto Rápido</div>
        <form onSubmit={guardar}>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Monto ($)</label>
            <input className="form-input" type="number" min="0" step="0.01" placeholder="0"
              value={monto} onChange={e => setMonto(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Razón</label>
            <input className="form-input" type="text" placeholder="Detalle"
              value={razon} onChange={e => setRazon(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-danger" type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Guardando...' : '💾 Registrar'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const PERIODS = [
  { label: 'Este mes', key: '1m' },
  { label: '3 meses',  key: '3m' },
  { label: '6 meses',  key: '6m' },
  { label: 'Este año', key: '1y' },
  { label: 'Todo',     key: 'all' },
]

function startOfPeriod(key) {
  const now = new Date()
  if (key === 'all') return new Date(0)
  if (key === '1m')  return new Date(now.getFullYear(), now.getMonth(), 1)
  if (key === '3m')  { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d }
  if (key === '6m')  { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d }
  if (key === '1y')  return new Date(now.getFullYear(), 0, 1)
  return new Date(0)
}

export default function Dashboard({ usuario, onNavTo }) {
  const [period, setPeriod]   = useState('1m')
  const [ventas, setVentas]   = useState([])
  const [gastos, setGastos]   = useState([])
  const [usuarios, setUsuarios] = useState({})
  const [clientes, setClientes] = useState({})
  const [componentes, setComponentes] = useState({})
  const [stockMinimos, setStockMinimos] = useState({})
  const [objetivoMensual, setObjetivoMensual] = useState(null)
  const [pedidos, setPedidos] = useState({})
  const [showSale, setShowSale]   = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [alertasDismissed, setAlertasDismissed] = useState(false)
  const [editandoObjetivo, setEditandoObjetivo] = useState(false)
  const [nuevoObjetivo, setNuevoObjetivo] = useState('')
  const [savingObjetivo, setSavingObjetivo] = useState(false)

  useEffect(() => {
    const unV = onValue(ref(db, 'ventas'),   s => setVentas(s.exists()   ? Object.values(s.val()) : []))
    const unG = onValue(ref(db, 'gastos'),   s => setGastos(s.exists()   ? Object.values(s.val()) : []))
    const unU = onValue(ref(db, 'usuarios'), s => setUsuarios(s.exists() ? s.val() : {}))
    const unC = onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
    const unComp = onValue(ref(db, 'componentes'), s => setComponentes(s.exists() ? s.val() : {}))
    const unMin = onValue(ref(db, 'configuracion/stockMinimos'), s => setStockMinimos(s.exists() ? s.val() : {}))
    const unObj = onValue(ref(db, 'configuracion/objetivoMensual'), s => setObjetivoMensual(s.exists() ? s.val() : null))
    const unPed = onValue(ref(db, 'pedidos'), s => setPedidos(s.exists() ? s.val() : {}))
    return () => { unV(); unG(); unU(); unC(); unComp(); unMin(); unObj(); unPed() }
  }, [])

  const desde = startOfPeriod(period)
  const ventasFiltradas = ventas.filter(v => new Date(v.timestamp) >= desde)
  const gastosFiltrados = gastos.filter(g => new Date(g.timestamp) >= desde && g.monto > 0)

  const facturacion   = ventasFiltradas.reduce((a, v) => a + v.cantidadFrascos * v.precioVenta, 0)
  const totalGastos   = gastosFiltrados.reduce((a, g) => a + g.monto, 0)
  const gananciaNeta  = facturacion - totalGastos
  const clientesUnicos = new Set(ventasFiltradas.map(v => v.clienteKey)).size

  const stockSeba  = usuarios.Seba?.stock ?? 0
  const stockJuan  = usuarios.Juan?.stock ?? 0
  const stockTotal = stockSeba + stockJuan
  const stockDR    = componentes.DR ?? 0
  const stockAC    = componentes.AC ?? 0
  const frascosVacios = componentes.vacios ?? 0

  // Stock alerts
  const alertas = []
  if (stockMinimos.seba != null && stockSeba < stockMinimos.seba) alertas.push(`Frascos Seba: ${stockSeba} (mín. ${stockMinimos.seba})`)
  if (stockMinimos.juan != null && stockJuan < stockMinimos.juan) alertas.push(`Frascos Juan: ${stockJuan} (mín. ${stockMinimos.juan})`)
  if (stockMinimos.DR != null && stockDR < stockMinimos.DR) alertas.push(`DR: ${stockDR} (mín. ${stockMinimos.DR})`)
  if (stockMinimos.AC != null && stockAC < stockMinimos.AC) alertas.push(`AC: ${stockAC} (mín. ${stockMinimos.AC})`)
  if (stockMinimos.vacios != null && frascosVacios < stockMinimos.vacios) alertas.push(`Vacíos: ${frascosVacios} (mín. ${stockMinimos.vacios})`)

  // Objetivo mensual: current month ventas
  const now = new Date()
  const ventasMesActual = ventas.filter(v => {
    const d = new Date(v.timestamp)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const facturacionMes = ventasMesActual.reduce((a, v) => a + v.cantidadFrascos * v.precioVenta, 0)
  const porcentajeObjetivo = objetivoMensual ? Math.min(100, (facturacionMes / objetivoMensual) * 100) : 0

  const pedidosPendientes = Object.entries(pedidos)
    .filter(([, p]) => p.estado === 'pendiente')
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.timestamp - b.timestamp)

  // Resumen del día
  const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0)
  const hoyStr = hoy()
  const ventasHoy    = ventas.filter(v => v.timestamp >= inicioDia.getTime())
  const frascosHoy   = ventasHoy.reduce((s, v) => s + v.cantidadFrascos, 0)
  const plataHoy     = ventasHoy.reduce((s, v) => s + v.cantidadFrascos * v.precioVenta, 0)
  const gastosHoy    = gastos.filter(g => g.timestamp >= inicioDia.getTime() && g.monto > 0).reduce((s, g) => s + g.monto, 0)
  const entregadosHoy = Object.values(pedidos).filter(p => p.estado === 'entregado' && p.fechaEntrega === hoyStr).length

  // Lista de llamadas: clientes sin comprar hace 30+ días
  const DISMISS_KEY = `llamadas_dismiss_${hoyStr}`
  const dismissedHoy = (() => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] } })()

  const paraLlamar = Object.entries(clientes)
    .map(([id, c]) => ({ id, ...c, diasSinComprar: diasDesdeStr(c.fechaUltimaCompra) }))
    .filter(c => c.diasSinComprar != null && c.diasSinComprar >= 10 && !dismissedHoy.includes(c.id))
    .sort((a, b) => b.diasSinComprar - a.diasSinComprar)
    .slice(0, 8)

  function ignorarLlamada(id) {
    const nuevos = [...dismissedHoy, id]
    localStorage.setItem(DISMISS_KEY, JSON.stringify(nuevos))
    setClientes(prev => ({ ...prev })) // trigger re-render
  }

  function enviarResumenWA() {
    const partes = [
      `📊 *Resumen del día — ${hoyStr}* (${usuario})`,
      '',
      frascosHoy > 0 ? `🫙 Frascos vendidos: *${frascosHoy}*` : '🫙 Sin ventas hoy',
      plataHoy > 0   ? `💰 Cobrado: *${fmt(plataHoy)}*`       : null,
      gastosHoy > 0  ? `💸 Gastos: *${fmt(gastosHoy)}*`       : null,
      entregadosHoy > 0 ? `📦 Pedidos entregados: *${entregadosHoy}*` : null,
    ].filter(Boolean).join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(partes)}`, '_blank')
  }

  async function guardarObjetivo() {
    const num = parseFloat(nuevoObjetivo)
    if (!num || num <= 0) return
    setSavingObjetivo(true)
    try {
      await set(ref(db, 'configuracion/objetivoMensual'), num)
      setEditandoObjetivo(false)
      setNuevoObjetivo('')
    } finally { setSavingObjetivo(false) }
  }

  return (
    <div>
      {/* Stock alert banner */}
      {alertas.length > 0 && !alertasDismissed && (
        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <span style={{ fontWeight: 800, color: '#92400e' }}>⚠️ Stock bajo: </span>
            <span style={{ fontSize: 13, color: '#92400e' }}>{alertas.map(a => a.split(':')[0]).join(', ')}</span>
          </div>
          <button onClick={() => setAlertasDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#92400e', padding: '0 4px' }}>✕</button>
        </div>
      )}

      <div className="section-header">
        <h1 className="section-title">📊 Dashboard</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setShowSale(true)}>⚡ Venta Rápida</button>
          <button className="btn btn-danger"  onClick={() => setShowExpense(true)}>⚡ Gasto Rápido</button>
          <button className="btn btn-ghost"   onClick={enviarResumenWA} title="Enviar resumen del día por WhatsApp">📨 WA</button>
        </div>
      </div>

      {/* Resumen del día */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16,
        background: 'linear-gradient(135deg, #0b1f3a, #1a3a6b)',
        borderRadius: 14, padding: '16px 18px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hoy</div>
          <div style={{ color: '#60a5fa', fontSize: 26, fontWeight: 900 }}>{frascosHoy || '—'}</div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>frascos</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cobrado</div>
          <div style={{ color: '#34d399', fontSize: plataHoy >= 100000 ? 18 : 24, fontWeight: 900 }}>
            {plataHoy ? '$' + Math.round(plataHoy).toLocaleString('es-AR') : '—'}
          </div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{ventasHoy.length} venta{ventasHoy.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Gastos</div>
          <div style={{ color: gastosHoy > 0 ? '#f87171' : 'rgba(255,255,255,.3)', fontSize: 22, fontWeight: 900 }}>
            {gastosHoy ? '$' + Math.round(gastosHoy).toLocaleString('es-AR') : '—'}
          </div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>del día</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Entregas</div>
          <div style={{ color: entregadosHoy > 0 ? '#fbbf24' : 'rgba(255,255,255,.3)', fontSize: 26, fontWeight: 900 }}>{entregadosHoy || '—'}</div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>pedidos</div>
        </div>
      </div>

      <div className="period-pills">
        {PERIODS.map(p => (
          <button key={p.key} className={`period-pill ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}>{p.label}</button>
        ))}
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">💰 Facturación</div>
          <div className="metric-value text-blue">{fmt(facturacion)}</div>
          <div className="metric-sub">{ventasFiltradas.length} ventas</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">📤 Gastos</div>
          <div className="metric-value text-red">{fmt(totalGastos)}</div>
          <div className="metric-sub">{gastosFiltrados.length} registros</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">📈 Ganancia Neta</div>
          <div className={`metric-value ${gananciaNeta >= 0 ? 'text-green' : 'text-red'}`}>{fmt(gananciaNeta)}</div>
          <div className="metric-sub">Facturación − Gastos</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">👥 Clientes activos</div>
          <div className="metric-value text-purple">{clientesUnicos}</div>
          <div className="metric-sub">con al menos 1 venta</div>
        </div>
      </div>

      {/* Objetivo mensual card */}
      <div className="card mt-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="fw-800" style={{ fontSize: 16 }}>🎯 Objetivo del mes</span>
          {objetivoMensual && !editandoObjetivo && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoObjetivo(true); setNuevoObjetivo(String(objetivoMensual)) }}>
              ✏️ Editar
            </button>
          )}
        </div>
        {editandoObjetivo || !objetivoMensual ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" type="number" min="1" step="1" placeholder="Objetivo en $"
              value={nuevoObjetivo} onChange={e => setNuevoObjetivo(e.target.value)}
              style={{ maxWidth: 200 }} />
            <button className="btn btn-primary btn-sm" onClick={guardarObjetivo} disabled={savingObjetivo}>
              {savingObjetivo ? 'Guardando...' : '💾 Guardar'}
            </button>
            {editandoObjetivo && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditandoObjetivo(false)}>Cancelar</button>
            )}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span className="fw-700 text-green">{fmt(facturacionMes)}</span>
              <span className="text-muted">de {fmt(objetivoMensual)}</span>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${porcentajeObjetivo}%`,
                background: porcentajeObjetivo >= 100 ? 'var(--green)' : porcentajeObjetivo >= 60 ? 'var(--amber)' : 'var(--blue)',
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
              {porcentajeObjetivo.toFixed(1)}% completado
            </div>
          </div>
        )}
      </div>

      {/* Pedidos pendientes widget */}
      {pedidosPendientes.length > 0 && (
        <div className="card mt-20" style={{ borderLeft: '4px solid var(--amber)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="fw-800" style={{ fontSize: 16 }}>
              📋 Pedidos a entregar
              <span style={{ marginLeft: 8, background: 'var(--amber)', color: '#fff', borderRadius: 20, fontSize: 12, padding: '2px 8px', fontWeight: 900 }}>
                {pedidosPendientes.length}
              </span>
            </span>
            {onNavTo && (
              <button className="btn btn-ghost btn-sm" onClick={() => onNavTo('pedidos')}>Ver todos →</button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pedidosPendientes.slice(0, 4).map(p => {
              const dias = diasDesdeStr(p.fechaPedido)
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span className="fw-700" style={{ fontSize: 14 }}>{p.cliente}</span>
                    {p.notas && <span className="text-muted" style={{ fontSize: 12, marginLeft: 6 }}>· {p.notas}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="fw-800 text-amber" style={{ fontSize: 14 }}>{p.cantidadFrascos} frascos</span>
                    {dias != null && dias >= 2 && (
                      <span style={{ fontSize: 12, color: dias >= 4 ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }}>
                        {dias}d
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            {pedidosPendientes.length > 4 && (
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', paddingTop: 4 }}>
                + {pedidosPendientes.length - 4} más
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lista de llamadas del día */}
      {paraLlamar.length > 0 && (
        <div className="card mt-20" style={{ borderLeft: '4px solid var(--red)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="fw-800" style={{ fontSize: 16 }}>
              📞 Para llamar hoy
              <span style={{ marginLeft: 8, background: 'var(--red)', color: '#fff', borderRadius: 20, fontSize: 12, padding: '2px 8px', fontWeight: 900 }}>
                {paraLlamar.length}
              </span>
            </span>
            <span className="text-muted" style={{ fontSize: 12 }}>+30 días sin comprar</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paraLlamar.map(c => {
              const wa = c.telefono ? (() => {
                const d = c.telefono.replace(/\D/g, '')
                if (!d) return null
                const num = d.startsWith('54') ? d : d.startsWith('0') ? '54' + d.slice(1) : '54' + d
                return `https://wa.me/${num}`
              })() : null
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 10, gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fw-700" style={{ fontSize: 14 }}>{c.razonSocial}</div>
                    <div style={{ fontSize: 12, color: c.diasSinComprar >= 60 ? 'var(--red)' : 'var(--muted)', fontWeight: 600 }}>
                      {c.diasSinComprar} días sin comprar
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer"
                        style={{ background: '#25d366', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                        💬
                      </a>
                    )}
                    <button onClick={() => ignorarLlamada(c.id)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                      ✓ Ya llamé
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card mt-20">
        <div style={{ marginBottom: 16 }}>
          <span className="fw-800" style={{ fontSize: 16 }}>📦 Stock actual</span>
          <span className="text-muted" style={{ fontSize: 13, marginLeft: 8 }}>Tiempo real</span>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--amber)' }}>{stockTotal}</div>
          <div className="text-muted fw-600" style={{ fontSize: 14 }}>frascos totales</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'linear-gradient(135deg, #0b1f3a, #1a3a6b)', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🔵 Seba</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#60a5fa' }}>{stockSeba}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>frascos</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #2e1065, #4c1d95)', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🟣 Juan</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#c4b5fd' }}>{stockJuan}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>frascos</div>
          </div>
        </div>
      </div>

      {showSale && (
        <QuickSaleModal usuario={usuario} clientes={clientes} usuarios={usuarios} onClose={() => setShowSale(false)} />
      )}
      {showExpense && (
        <QuickExpenseModal usuario={usuario} onClose={() => setShowExpense(false)} />
      )}
    </div>
  )
}
