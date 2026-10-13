import { useEffect, useRef, useState } from 'react'

// Formulario en una ventana modal (<dialog> nativo). alGuardar recibe los campos del formulario;
// si falla, el error se muestra adentro y la ventana queda abierta.
export default function Dialogo({ titulo, alGuardar, alCerrar, extra, children }) {
  const ref = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ref.current.open) ref.current.showModal()
  }, [])

  async function enviar(e) {
    e.preventDefault()
    setError('')
    try {
      await alGuardar(Object.fromEntries(new FormData(e.target)))
      alCerrar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <dialog ref={ref} onClose={alCerrar}>
      <form onSubmit={enviar}>
        <h2>{titulo}</h2>
        {children}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button type="submit">Guardar</button>
          <button type="button" className="lila" onClick={alCerrar}>Cancelar</button>
          {extra}
        </div>
      </form>
    </dialog>
  )
}
