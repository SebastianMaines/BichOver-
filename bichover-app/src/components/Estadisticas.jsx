import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase.js'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

const GASTO_COLORS = {
  Frascos:       '#1a6bff',
  Producto:      '#0891b2',
  Etiquetas:     '#7c3aed',
  Cajas:         '#f59e0b',
  Nafta:         '#ef4444',
  Peaje:         '#94a3b8',
  Transferencia: '#10b981',
  Otro:          '#64748b',
}

const TIER_CONFIG = {
  1: { label: '🏊 Exc. Piscinas', color: '#1a6bff' },
  2: { label: '🔧 Ferretería',    color: '#10b981' },
  3: { label: '📦 Distribuidor',  color: '#f59e0b' },
}

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 600,
      }}>
        {fmt(payload[0].value)}
      </div>
    )
  }
  return null
}

export default function Estadisticas() {
  const [ventas, setVentas]     = useState([])
  const [gastos, setGastos]     = useState([])
  const [clientes, setClientes] = useState({})

  useEffect(() => {
    const unV = onValue(ref(db, 'ventas'),   s => setVentas(s.exists()   ? Object.values(s.val()) : []))
    const unG = onValue(ref(db, 'gastos'),   s => setGastos(s.exists()   ? Object.values(s.val()) : []))
    const unC = onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
    return () => { unV(); unG(); unC() }
  }, [])

  // ── Resumen ────────────────────────────────────────────────
  const facturacionTotal = ventas.reduce((a, v) => a + v.cantidadFrascos * v.precioVenta, 0)
  const frascosTotal     = ventas.reduce((a, v) => a + v.cantidadFrascos, 0)
  const ventaPromedio    = ventas.length ? facturacionTotal / ventas.length : 0

  // Mejor mes
  const porMes = {}
  ventas.forEach(v => {
    const d = new Date(v.timestamp)
    const k = `${d.getMonth() + 1}/${d.getFullYear()}`
    porMes[k] = (porMes[k] || 0) + v.cantidadFrascos * v.precioVenta
  })
  const mejorMes = Object.entries(porMes).sort((a, b) => b[1] - a[1])[0]

  // ── Gráfico 1: Ventas mensuales últimos 12 meses ───────────
  const now = new Date()
  const meses12 = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const k = `${d.getMonth() + 1}/${d.getFullYear()}`
    const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    meses12.push({ k, label, total: porMes[k] || 0 })
  }

  // ── Gráfico 2: Top 8 clientes ──────────────────────────────
  const porCliente = {}
  ventas.forEach(v => {
    porCliente[v.cliente] = (porCliente[v.cliente] || 0) + v.cantidadFrascos * v.precioVenta
  })
  const top8 = Object.entries(porCliente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([nombre, total]) => ({ nombre: nombre?.slice(0, 20), total }))
    .reverse()

  // ── Gráfico 3: Gastos por categoría ───────────────────────
  const porCategoria = {}
  gastos.filter(g => g.monto > 0).forEach(g => {
    porCategoria[g.tipo] = (porCategoria[g.tipo] || 0) + g.monto
  })
  const gastosData = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, total]) => ({ tipo, total }))
    .reverse()

  // ── Gráfico 4: Ventas por tipo de cliente (CSS bars) ──────
  const tierData = [1, 2, 3].map(tier => {
    const clientesTier = Object.entries(clientes)
      .filter(([, c]) => (c.tier || 1) === tier)
      .map(([id]) => id)
    const totalTier = ventas
      .filter(v => clientesTier.includes(v.clienteKey))
      .reduce((a, v) => a + v.cantidadFrascos * v.precioVenta, 0)
    const frascosTier = ventas
      .filter(v => clientesTier.includes(v.clienteKey))
      .reduce((a, v) => a + v.cantidadFrascos, 0)
    return { tier, total: totalTier, frascos: frascosTier, count: clientesTier.length }
  })
  const maxTier = Math.max(...tierData.map(t => t.total), 1)

  // ── Gráfico 5: Top 5 clientes ranking ─────────────────────
  const top5 = Object.entries(porCliente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nombre, total]) => ({ nombre, total }))
  const maxTop5 = top5[0]?.total || 1

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📈 Estadísticas</h1>
      </div>

      {/* Resumen */}
      <div className="metrics-grid mb-16" style={{ marginBottom: 20 }}>
        <div className="metric-card">
          <div className="metric-label">💰 Facturación total</div>
          <div className="metric-value text-blue">{fmt(facturacionTotal)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">📦 Frascos vendidos</div>
          <div className="metric-value text-amber">{frascosTotal.toLocaleString('es-AR')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">🧾 Venta promedio</div>
          <div className="metric-value text-purple">{fmt(ventaPromedio)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">🏆 Mejor mes</div>
          <div className="metric-value text-green" style={{ fontSize: mejorMes ? 20 : 26 }}>
            {mejorMes ? mejorMes[0] : '—'}
          </div>
          {mejorMes && <div className="metric-sub">{fmt(mejorMes[1])}</div>}
        </div>
      </div>

      {/* Gráfico 1 */}
      <div className="card mb-16">
        <div className="fw-800 mb-12" style={{ fontSize: 16 }}>📅 Ventas mensuales — últimos 12 meses</div>
        {ventas.length === 0 ? (
          <div className="empty-state"><p>Sin datos</p></div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={meses12} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" fill="#1a6bff" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 2 */}
      <div className="card mb-16">
        <div className="fw-800 mb-12" style={{ fontSize: 16 }}>🏆 Top 8 clientes por facturación</div>
        {top8.length === 0 ? (
          <div className="empty-state"><p>Sin datos</p></div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, top8.length * 38)}>
            <BarChart data={top8} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 8 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="nombre" type="category" width={130} tick={{ fontSize: 12, fill: '#0b1f3a' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" fill="#1a6bff" radius={[0,6,6,0]}
                label={{ position: 'right', formatter: fmt, fontSize: 12, fill: '#64748b' }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 3 */}
      <div className="card mb-16">
        <div className="fw-800 mb-12" style={{ fontSize: 16 }}>💸 Gastos por categoría</div>
        {gastosData.length === 0 ? (
          <div className="empty-state"><p>Sin datos</p></div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, gastosData.length * 38)}>
            <BarChart data={gastosData} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 8 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="tipo" type="category" width={100} tick={{ fontSize: 12, fill: '#0b1f3a' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" radius={[0,6,6,0]}
                label={{ position: 'right', formatter: fmt, fontSize: 12, fill: '#64748b' }}>
                {gastosData.map((g, i) => (
                  <Cell key={i} fill={GASTO_COLORS[g.tipo] || '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 4: Ventas por tipo */}
      <div className="card mb-16">
        <div className="fw-800 mb-12" style={{ fontSize: 16 }}>📊 Ventas por tipo de cliente</div>
        {tierData.every(t => t.total === 0) ? (
          <div className="empty-state"><p>Sin datos</p></div>
        ) : tierData.map(t => {
          const pct = Math.round((t.total / (facturacionTotal || 1)) * 100)
          const cfg = TIER_CONFIG[t.tier]
          return (
            <div key={t.tier} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                <span className="fw-700" style={{ fontSize: 14 }}>{cfg.label}</span>
                <span className="fw-800" style={{ color: cfg.color, fontSize: 14 }}>{fmt(t.total)} · {pct}%</span>
              </div>
              <div className="progress-bar-wrap" style={{ marginBottom: 4 }}>
                <div className="progress-bar-fill" style={{
                  width: `${pct}%`,
                  background: cfg.color,
                }} />
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {t.count} clientes · {t.frascos} frascos
              </div>
            </div>
          )
        })}
      </div>

      {/* Gráfico 5: Top 5 ranking */}
      <div className="card">
        <div className="fw-800 mb-12" style={{ fontSize: 16 }}>🥇 Top 5 clientes</div>
        {top5.length === 0 ? (
          <div className="empty-state"><p>Sin datos</p></div>
        ) : top5.map((c, i) => {
          const pct = Math.round((c.total / maxTop5) * 100)
          return (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="fw-800" style={{ color: 'var(--blue)', fontSize: 15, flexShrink: 0 }}>#{i+1}</span>
                  <span className="fw-600" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nombre}
                  </span>
                </div>
                <span className="fw-800 text-blue" style={{ fontSize: 14, flexShrink: 0 }}>{fmt(c.total)}</span>
              </div>
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${pct}%`, background: 'var(--blue)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
