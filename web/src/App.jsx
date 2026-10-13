import { useState } from 'react'
import { api, sesion } from './api.js'
import Panel from './Panel.jsx'

export default function App() {
  const [conSesion, setConSesion] = useState(Boolean(sesion.token))
  const [motivo, setMotivo] = useState('')
  // Enlace que llega por mail: /?recuperar=<token>
  const [tokenRecuperar, setTokenRecuperar] = useState(new URLSearchParams(location.search).get('recuperar'))

  function salir(mensaje = '') {
    sesion.borrar()
    setMotivo(mensaje)
    setConSesion(false)
  }

  if (tokenRecuperar) {
    return (
      <NuevaPassword
        token={tokenRecuperar}
        alTerminar={(mensaje) => {
          history.replaceState(null, '', location.pathname) // saca el token de la barra de direcciones
          setTokenRecuperar(null)
          salir(mensaje)
        }}
      />
    )
  }
  if (conSesion) return <Panel salir={salir} />
  return <Login motivo={motivo} alEntrar={() => setConSesion(true)} />
}

function Tarjeta({ titulo, children }) {
  return (
    <main className="login">
      <img src="/logo.png" alt="Juguetería" />
      <h1>{titulo}</h1>
      {children}
    </main>
  )
}

// Caso de Uso 1: Iniciar sesión (+ Recuperar Contraseña)
function Login({ motivo, alEntrar }) {
  const [mensaje, setMensaje] = useState(motivo)
  const [recuperando, setRecuperando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    const campos = Object.fromEntries(new FormData(e.target))
    try {
      if (recuperando) {
        setMensaje((await api('POST', '/recuperar', campos)).mensaje)
        setRecuperando(false)
      } else {
        sesion.guardar((await api('POST', '/login', campos)).token)
        alEntrar()
      }
    } catch (err) {
      setMensaje(err.message)
    }
  }

  return (
    <Tarjeta titulo={recuperando ? 'Recuperar contraseña' : 'Iniciar sesión'}>
      <form onSubmit={enviar}>
        <label>
          Email:
          <input name="email" type="email" placeholder="Mi Email..." autoComplete="username" required />
        </label>
        {recuperando ? (
          <p className="nota">Te mandamos por mail un enlace para elegir una contraseña nueva.</p>
        ) : (
          <label>
            Contraseña:
            <input name="password" type="password" placeholder="Mi Contraseña..." autoComplete="current-password" required />
          </label>
        )}
        {mensaje && <p className="mensaje" role="alert">{mensaje}</p>}
        <button type="submit">{recuperando ? 'Enviar enlace' : 'Iniciar sesión'}</button>
        <button type="button" className="enlace" onClick={() => { setRecuperando(!recuperando); setMensaje('') }}>
          {recuperando ? 'Volver a iniciar sesión' : '¿Olvidaste tu contraseña?'}
        </button>
      </form>
    </Tarjeta>
  )
}

function NuevaPassword({ token, alTerminar }) {
  const [error, setError] = useState('')

  async function enviar(e) {
    e.preventDefault()
    const { password, repetida } = Object.fromEntries(new FormData(e.target))
    if (password !== repetida) return setError('Las contraseñas no coinciden')
    try {
      alTerminar((await api('POST', '/recuperar/confirmar', { token, password })).mensaje)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Tarjeta titulo="Nueva contraseña">
      <form onSubmit={enviar}>
        <label>
          Contraseña nueva:
          <input name="password" type="password" minLength={6} maxLength={72} placeholder="Mínimo 6 caracteres" autoComplete="new-password" required />
        </label>
        <label>
          Repetir contraseña:
          <input name="repetida" type="password" minLength={6} maxLength={72} autoComplete="new-password" required />
        </label>
        {error && <p className="mensaje" role="alert">{error}</p>}
        <button type="submit">Cambiar contraseña</button>
        <button type="button" className="enlace" onClick={() => alTerminar('')}>Volver a iniciar sesión</button>
      </form>
    </Tarjeta>
  )
}
