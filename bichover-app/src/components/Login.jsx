import { useState } from 'react'
import { ref, get } from 'firebase/database'
import { db } from '../firebase.js'

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('Seba')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const snap = await get(ref(db, `usuarios/${usuario}`))
      if (!snap.exists()) {
        setError('Usuario no encontrado.')
        return
      }
      const data = snap.val()
      if (data.password === password) {
        onLogin(usuario)
      } else {
        setError('Contraseña incorrecta.')
      }
    } catch {
      setError('Error al conectar con Firebase. Verificá la configuración.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">🏊</div>
        <div className="login-title">BICHOVER!</div>
        <div className="login-sub">Gestión interna de piscinas</div>

        {error && <div className="login-error">{error}</div>}

        <label className="login-label">Usuario</label>
        <select
          className="login-select"
          value={usuario}
          onChange={e => setUsuario(e.target.value)}
        >
          <option value="Seba">Seba</option>
          <option value="Juan">Juan</option>
        </select>

        <label className="login-label">Contraseña</label>
        <input
          className="login-input"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? 'Verificando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
