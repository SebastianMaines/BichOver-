import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase.js'
import * as XLSX from 'xlsx'

function hoyStr() {
  return new Date().toLocaleDateString('es-AR').replace(/\//g, '-')
}

function autoWidth(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const cols = []
  for (let C = range.s.c; C <= range.e.c; C++) {
    let max = 10
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      if (cell && cell.v != null) max = Math.max(max, String(cell.v).length + 2)
    }
    cols.push({ wch: Math.min(max, 40) })
  }
  ws['!cols'] = cols
  return ws
}

export default function Exportar() {
  const [ventas, setVentas]     = useState({})
  const [gastos, setGastos]     = useState({})
  const [clientes, setClientes] = useState({})

  useEffect(() => {
    const unV = onValue(ref(db, 'ventas'),   s => setVentas(s.exists()   ? s.val() : {}))
    const unG = onValue(ref(db, 'gastos'),   s => setGastos(s.exists()   ? s.val() : {}))
    const unC = onValue(ref(db, 'clientes'), s => setClientes(s.exists() ? s.val() : {}))
    return () => { unV(); unG(); unC() }
  }, [])

  function sheetVentas() {
    const rows = Object.values(ventas)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(v => ({
        Fecha:       v.fechaVenta     || '',
        Cliente:     v.cliente        || '',
        Canal:       v.canal          || 'Presencial',
        Frascos:     v.cantidadFrascos,
        'Precio/u':  v.precioVenta,
        Total:       v.cantidadFrascos * v.precioVenta,
        Vendedor:    v.usuario        || '',
        Repartido:   v.repartido      ? 'Sí' : 'No',
      }))
    return autoWidth(XLSX.utils.json_to_sheet(rows))
  }

  function sheetGastos() {
    const rows = Object.values(gastos)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(g => ({
        Fecha:     g.fecha    || '',
        Tipo:      g.tipo     || '',
        Razón:     g.razon    || '',
        Monto:     g.monto,
        Usuario:   g.usuario  || '',
        Repartido: g.repartido ? 'Sí' : 'No',
      }))
    return autoWidth(XLSX.utils.json_to_sheet(rows))
  }

  function sheetClientes() {
    const TIER = { 1: 'Exc. Piscinas', 2: 'Ferretería', 3: 'Distribuidor' }
    const rows = Object.values(clientes)
      .sort((a, b) => (a.razonSocial || '').localeCompare(b.razonSocial || ''))
      .map(c => ({
        'Razón Social':    c.razonSocial        || '',
        Localidad:         c.localidad          || '',
        Dirección:         c.direccion          || '',
        Teléfono:          c.telefono           || '',
        Tipo:              TIER[c.tier]         || '',
        'Frascos totales': c.cantidadFrascos    || 0,
        'Última compra':   c.fechaUltimaCompra  || '',
        'En el mapa':      c.lat ? 'Sí' : 'No',
      }))
    return autoWidth(XLSX.utils.json_to_sheet(rows))
  }

  function exportarTodo() {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheetVentas(),   'Ventas')
    XLSX.utils.book_append_sheet(wb, sheetGastos(),   'Gastos')
    XLSX.utils.book_append_sheet(wb, sheetClientes(), 'Clientes')
    XLSX.writeFile(wb, `BichOver_${hoyStr()}.xlsx`)
  }

  function exportarUno(sheet, nombre) {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, nombre)
    XLSX.writeFile(wb, `BichOver_${nombre}_${hoyStr()}.xlsx`)
  }

  const totalVentas  = Object.values(ventas).reduce((s, v)  => s + v.cantidadFrascos * v.precioVenta, 0)
  const totalGastos  = Object.values(gastos).filter(g => g.monto > 0).reduce((s, g) => s + g.monto, 0)
  const nClientes    = Object.keys(clientes).length

  const BTN = { background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'Outfit, sans-serif' }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📤 Exportar</h1>
      </div>

      {/* Export todo */}
      <div className="card mb-16" style={{ background: 'linear-gradient(135deg, #0b1f3a, #1a3a6b)', border: 'none' }}>
        <div style={{ color: '#fff', marginBottom: 12 }}>
          <div className="fw-800" style={{ fontSize: 18, marginBottom: 4 }}>📊 Exportar todo</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
            Un solo archivo Excel con 3 pestañas: Ventas, Gastos y Clientes
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { label: 'Ventas', value: Object.keys(ventas).length, sub: `$${Math.round(totalVentas).toLocaleString('es-AR')}` },
            { label: 'Gastos', value: Object.keys(gastos).length, sub: `$${Math.round(totalGastos).toLocaleString('es-AR')}` },
            { label: 'Clientes', value: nClientes, sub: 'registrados' },
          ].map(m => (
            <div key={m.label} style={{ background: 'rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 16px', flex: 1, minWidth: 80 }}>
              <div style={{ color: '#60a5fa', fontWeight: 900, fontSize: 22 }}>{m.value}</div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{m.label}</div>
              <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, fontWeight: 600 }}>{m.sub}</div>
            </div>
          ))}
        </div>
        <button onClick={exportarTodo}
          style={{ background: '#60a5fa', color: '#0b1f3a', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 15, fontWeight: 800, cursor: 'pointer', width: '100%' }}>
          ⬇️ Descargar BichOver_{hoyStr()}.xlsx
        </button>
      </div>

      {/* Export individual */}
      <div className="fw-700 mb-8" style={{ fontSize: 14, color: 'var(--muted)' }}>O exportar por separado</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button style={BTN} onClick={() => exportarUno(sheetVentas(), 'Ventas')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="fw-800" style={{ fontSize: 15 }}>🛒 Ventas</div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                {Object.keys(ventas).length} registros · Fecha, Cliente, Canal, Frascos, Precio, Total, Vendedor
              </div>
            </div>
            <span style={{ fontSize: 20 }}>⬇️</span>
          </div>
        </button>

        <button style={BTN} onClick={() => exportarUno(sheetGastos(), 'Gastos')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="fw-800" style={{ fontSize: 15 }}>💸 Gastos</div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                {Object.keys(gastos).length} registros · Fecha, Tipo, Razón, Monto, Usuario
              </div>
            </div>
            <span style={{ fontSize: 20 }}>⬇️</span>
          </div>
        </button>

        <button style={BTN} onClick={() => exportarUno(sheetClientes(), 'Clientes')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="fw-800" style={{ fontSize: 15 }}>👥 Clientes</div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                {nClientes} registros · Razón Social, Localidad, Teléfono, Tipo, Frascos, Última compra
              </div>
            </div>
            <span style={{ fontSize: 20 }}>⬇️</span>
          </div>
        </button>
      </div>
    </div>
  )
}
