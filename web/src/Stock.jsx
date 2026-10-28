import { useState } from 'react'
import { pesos } from './api.js'

const STOCK_BAJO = 5

// Gerente: consulta del stock de los productos de la sucursal, con búsqueda y filtro de stock bajo
export default function Stock({ datos }) {
  const [buscar, setBuscar] = useState('')
  const [soloBajo, setSoloBajo] = useState(false)

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
            <tr><th>ID</th><th>Producto</th><th>Código de barras</th><th>Precio</th><th>Stock</th></tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.nombre}</td>
                <td>{p.codigo_barras}</td>
                <td>{pesos(p.precio)}</td>
                <td>{p.stock === 0 ? <strong>Sin stock</strong> : p.stock <= STOCK_BAJO ? <strong>{p.stock} · bajo</strong> : p.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {productos.length === 0 && <p className="nota">No hay productos que coincidan.</p>}
    </section>
  )
}
