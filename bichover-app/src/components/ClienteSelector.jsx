import { useState, useRef, useEffect } from 'react'

export default function ClienteSelector({ clientes, value, onChange, required }) {
  const [busqueda, setBusqueda] = useState('')
  const [open, setOpen]         = useState(false)
  const wrapRef = useRef(null)

  const selected = value ? clientes[value] : null

  const lista = Object.entries(clientes || {})
    .map(([id, c]) => ({ id, ...c }))
    .filter(c => {
      if (!busqueda) return true
      const q = busqueda.toLowerCase()
      return c.razonSocial?.toLowerCase().includes(q) || c.localidad?.toLowerCase().includes(q)
    })
    .sort((a, b) => (a.razonSocial || '').localeCompare(b.razonSocial || ''))
    .slice(0, 10)

  // cerrar al hacer click afuera
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function seleccionar(c) {
    onChange(c.id)
    setBusqueda('')
    setOpen(false)
  }

  function limpiar() {
    onChange('')
    setBusqueda('')
    setOpen(true)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {selected ? (
        <div style={{
          border: '1.5px solid var(--blue)', borderRadius: 10, padding: '10px 14px',
          background: '#e8f1ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{selected.razonSocial}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.localidad}</div>
          </div>
          <button type="button" onClick={limpiar}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>
            ✕
          </button>
        </div>
      ) : (
        <input
          className="form-input"
          placeholder="🔍 Escribir nombre o localidad..."
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          required={required && !value}
          autoComplete="off"
        />
      )}

      {open && !selected && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--white)', border: '1.5px solid var(--border)',
          borderRadius: 10, zIndex: 100, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        }}>
          {lista.length === 0 ? (
            <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 13 }}>Sin resultados</div>
          ) : lista.map(c => (
            <div key={c.id}
              onMouseDown={() => seleccionar(c)}
              style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{c.razonSocial}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.localidad}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
