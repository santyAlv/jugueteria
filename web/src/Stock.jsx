import { Fragment, useEffect, useState } from 'react'
import { api, fecha, hora, pesos } from './api.js'
import Recortable from './Recortable.jsx'

const STOCK_BAJO = 5

// Historial de un producto: cada ingreso y cada venta (egreso) con fecha, cantidad y usuario
function Historial({ id }) {
  const [movs, setMovs] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api('GET', `/productos/${id}/movimientos`).then(setMovs, (e) => setError(e.message))
  }, [id])

  if (error) return <p className="nota" role="alert">{error}</p>
  if (!movs) return <p className="nota">Cargando historial…</p>
  if (movs.length === 0) return <p className="nota">Este producto todavía no tiene movimientos.</p>
  return (
    <Recortable
      items={movs}
      hijo={(lista) => (
        <table>
          <thead>
            <tr><th>Fecha</th><th>Hora</th><th>Movimiento</th><th>Cantidad</th><th>Usuario</th></tr>
          </thead>
          <tbody>
            {lista.map((m) => (
              <tr key={m.id}>
                <td>{fecha(m.fecha_hora)}</td>
                <td>{hora(m.fecha_hora)}</td>
                <td>{m.tipo_movimiento === 'INGRESO' ? 'Ingreso' : 'Venta'}</td>
                <td>{m.tipo_movimiento === 'INGRESO' ? '+' : '−'}{m.cantidad}</td>
                <td>{m.nombre_usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  )
}

// Gerente: consulta del stock de los productos de la sucursal, con búsqueda y filtro de stock bajo
export default function Stock({ datos }) {
  const [buscar, setBuscar] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)
  const [abierto, setAbierto] = useState(null) // id del producto con el historial desplegado

  const texto = buscar.trim().toLowerCase()
  const productos = datos.productos.filter(
    (p) => (!soloBajo || p.stock <= STOCK_BAJO) && (!texto || `${p.nombre} ${p.codigo_barras ?? ''}`.toLowerCase().includes(texto))
  )
  const unidades = productos.reduce((n, p) => n + p.stock, 0)

  return (
    <section id="stock">
      <div className="titulo">
        <h2>Consulta de stock</h2>
        <div className="pago">
          <input type="search" placeholder="Nombre o código" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar producto" />
          <button type="button" className="lila chico" aria-pressed={soloBajo} onClick={() => setSoloBajo(!soloBajo)}>
            Stock bajo (≤ {STOCK_BAJO})
          </button>
        </div>
      </div>
      <div className="resumen">
        <span>Productos: <strong>{productos.length}</strong></span>
        <span>Unidades en stock: <strong>{unidades}</strong></span>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>ID</th><th>Producto</th><th>Código de barras</th><th>Precio</th><th>Stock</th><th>Historial</th></tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>{p.id}</td>
                  <td>{p.nombre}</td>
                  <td>{p.codigo_barras}</td>
                  <td>{pesos(p.precio)}</td>
                  <td>{p.stock === 0 ? <strong>Sin stock</strong> : p.stock <= STOCK_BAJO ? <strong>{p.stock} · bajo</strong> : p.stock}</td>
                  <td>
                    <button type="button" className="enlace" aria-expanded={abierto === p.id} onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                      {abierto === p.id ? 'Ocultar' : 'Ver historial'}
                    </button>
                  </td>
                </tr>
                {abierto === p.id && <tr><td colSpan={6}><Historial id={p.id} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {productos.length === 0 && <p className="nota">No hay productos que coincidan.</p>}
    </section>
  )
}
