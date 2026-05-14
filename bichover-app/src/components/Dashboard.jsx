import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase.js'

const PERIODS = [
  { label: 'Este mes', key: '1m' },
  { label: '3 meses',  key: '3m' },
  { label: '6 meses',  key: '6m' },
  { label: 'Este año', key: '1y' },
  { label: 'Todo',     key: 'all' },
]

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function startOfPeriod(key) {
  const now = new Date()
  if (key === 'all') return new Date(0)
  if (key === '1m') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (key === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d }
  if (key === '6m') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d }
  if (key === '1y')  return new Date(now.getFullYear(), 0, 1)
  return new Date(0)
}

export default function Dashboard({ usuario }) {
  const [period, setPeriod] = useState('1m')
  const [ventas, setVentas] = useState([])
  const [gastos, setGastos] = useState([])
  const [usuarios, setUsuarios] = useState({})

  useEffect(() => {
    const unV = onValue(ref(db, 'ventas'),   s => setVentas(s.exists()   ? Object.values(s.val()) : []))
    const unG = onValue(ref(db, 'gastos'),   s => setGastos(s.exists()   ? Object.values(s.val()) : []))
    const unU = onValue(ref(db, 'usuarios'), s => setUsuarios(s.exists() ? s.val() : {}))
    return () => { unV(); unG(); unU() }
  }, [])

  const desde = startOfPeriod(period)

  const ventasFiltradas = ventas.filter(v => new Date(v.timestamp) >= desde)
  const gastosFiltrados = gastos.filter(g => new Date(g.timestamp) >= desde && g.monto > 0)

  const facturacion = ventasFiltradas.reduce((a, v) => a + v.cantidadFrascos * v.precioVenta, 0)
  const totalGastos = gastosFiltrados.reduce((a, g) => a + g.monto, 0)
  const gananciaNeta = facturacion - totalGastos
  const clientesUnicos = new Set(ventasFiltradas.map(v => v.clienteKey)).size

  const stockSeba = usuarios.Seba?.stock ?? 0
  const stockJuan = usuarios.Juan?.stock ?? 0
  const stockTotal = stockSeba + stockJuan

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📊 Dashboard</h1>
      </div>

      <div className="period-pills">
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={`period-pill ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
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
          <div className={`metric-value ${gananciaNeta >= 0 ? 'text-green' : 'text-red'}`}>
            {fmt(gananciaNeta)}
          </div>
          <div className="metric-sub">Facturación − Gastos</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">👥 Clientes activos</div>
          <div className="metric-value text-purple">{clientesUnicos}</div>
          <div className="metric-sub">con al menos 1 venta</div>
        </div>
      </div>

      <div className="card mt-20">
        <div style={{ marginBottom: 16 }}>
          <span className="fw-800" style={{ fontSize: 16 }}>📦 Stock actual</span>
          <span className="text-muted" style={{ fontSize: 13, marginLeft: 8 }}>Estado en tiempo real</span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--amber)' }}>{stockTotal}</div>
          <div className="text-muted fw-600" style={{ fontSize: 14 }}>frascos totales</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, #0b1f3a, #1a3a6b)',
            borderRadius: 12,
            padding: '16px 20px',
            textAlign: 'center',
          }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🔵 Seba</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#60a5fa' }}>{stockSeba}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>frascos</div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #2e1065, #4c1d95)',
            borderRadius: 12,
            padding: '16px 20px',
            textAlign: 'center',
          }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🟣 Juan</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#c4b5fd' }}>{stockJuan}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>frascos</div>
          </div>
        </div>
      </div>
    </div>
  )
}
