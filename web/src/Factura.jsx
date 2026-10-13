import { useState } from 'react'
import { api, fecha, hora, pesos } from './api.js'

const centavos = (v) => Math.round(v * 100)

// Caso de Uso 2 "Realizar Venta" · boceto "Crear Factura"
export default function Factura({ datos, guardar, avisar, ir }) {
  const { caja, productos, medios } = datos
  const [lineas, setLineas] = useState([]) // { producto, cantidad }
  const [busqueda, setBusqueda] = useState('')
  const [medio, setMedio] = useState(null)
  const [conVoucher, setConVoucher] = useState(false)
  const [voucher, setVoucher] = useState(null) // { numero_referencia, monto_precargado } ya validado
  const [error, setError] = useState('')
  const [ahora] = useState(new Date())

  if (caja?.estado !== 'ABIERTA') {
    return (
      <main>
        <button type="button" className="icono" onClick={() => ir('inicio')} aria-label="Volver">‹</button>
        <p className="nota centro">{caja ? 'Tu caja está cerrada: abrila para poder facturar.' : 'No tenés una caja asignada.'}</p>
      </main>
    )
  }

  // Buscar Producto: por nombre o por código de barras (un lector de códigos escribe el código y Enter)
  const texto = busqueda.trim().toLowerCase()
  const encontrados = texto ? productos.filter((p) => p.nombre.toLowerCase().includes(texto) || p.codigo_barras?.includes(texto)).slice(0, 6) : []

  // Agregar Producto + Calcular Stock
  function agregar(p) {
    setBusqueda('')
    const enFactura = lineas.find((l) => l.producto.id === p.id)?.cantidad ?? 0
    if (enFactura >= p.stock) return setError(`No hay más stock de ${p.nombre} (quedan ${p.stock})`)
    setError('')
    setLineas(enFactura ? lineas.map((l) => (l.producto.id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l)) : [...lineas, { producto: p, cantidad: 1 }])
  }

  const cambiarCantidad = (id, cantidad) => setLineas(lineas.map((l) => (l.producto.id === id ? { ...l, cantidad } : l)))

  // Calcular Total (+ Aplicar Voucher). La API lo vuelve a calcular: esto es solo lo que se muestra.
  const total = lineas.reduce((t, l) => t + centavos(l.producto.precio) * (l.cantidad || 0), 0) / 100
  const descuento = voucher ? Math.min(voucher.monto_precargado, total) : 0
  const resto = (centavos(total) - centavos(descuento)) / 100

  async function aplicarVoucher(e) {
    e.preventDefault()
    const codigo = new FormData(e.target).get('codigo').trim()
    try {
      setVoucher(await api('GET', `/vouchers/${encodeURIComponent(codigo)}`))
      setError('')
    } catch (err) {
      setVoucher(null)
      setError(err.message)
    }
  }

  // Registrar Venta
  async function emitir() {
    if (lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad < 1)) return setError('Revisá las cantidades')
    if (resto > 0 && !medio) return setError('Elegí el medio de pago: efectivo o tarjeta')
    try {
      const factura = await guardar('POST', '/ventas', {
        items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
        medio_pago_id: resto > 0 ? medio : null,
        voucher: voucher?.numero_referencia,
      })
      ir('inicio')
      avisar(`Factura N° ${factura.id} emitida · Total ${pesos(factura.total)}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="factura">
      <button type="button" className="icono" onClick={() => ir('inicio')} aria-label="Volver">‹</button>
      <h1>Crear factura</h1>

      <section>
        <div className="titulo">
          <p>Sucursal {caja.sucursal_id}<br />Caja {caja.numero_caja}</p>
          <p className="derecha">Fecha: {fecha(ahora)}<br />Hora: {hora(ahora)}</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (encontrados[0]) agregar(encontrados.find((p) => p.codigo_barras === texto) ?? encontrados[0]) }}>
          <input
            type="search"
            aria-label="Buscar producto"
            placeholder="Buscar producto por nombre o código de barras..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            autoFocus
          />
        </form>
        {encontrados.length > 0 && (
          <ul className="encontrados">
            {encontrados.map((p) => (
              <li key={p.id}>
                <button type="button" className="lila" onClick={() => agregar(p)} disabled={p.stock === 0}>
                  {p.nombre} · {pesos(p.precio)} · stock {p.stock}
                </button>
              </li>
            ))}
          </ul>
        )}
        {texto && encontrados.length === 0 && <p className="nota">Ningún producto coincide con "{busqueda}".</p>}

        <h2>Detalles</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Cód. barras</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th><th></th></tr>
            </thead>
            <tbody>
              {lineas.map(({ producto: p, cantidad }) => (
                <tr key={p.id}>
                  <td>{p.codigo_barras}</td>
                  <td>{p.nombre}</td>
                  <td>
                    <input
                      type="number"
                      aria-label={`Cantidad de ${p.nombre}`}
                      min="1"
                      max={p.stock}
                      value={cantidad || ''}
                      onChange={(e) => cambiarCantidad(p.id, Math.min(e.target.valueAsNumber, p.stock))}
                    />
                  </td>
                  <td>{pesos(p.precio)}</td>
                  <td>{pesos((centavos(p.precio) * (cantidad || 0)) / 100)}</td>
                  <td><button type="button" className="lila chico" onClick={() => setLineas(lineas.filter((l) => l.producto.id !== p.id))} aria-label={`Quitar ${p.nombre}`}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lineas.length === 0 && <p className="nota">Todavía no hay productos en la factura.</p>}

        <div className="total">
          <span>Total</span><strong>{pesos(total)}</strong>
          {voucher && <><span>Voucher {voucher.numero_referencia}</span><span>− {pesos(descuento)}</span></>}
          {voucher && <><span>A cobrar</span><strong>{pesos(resto)}</strong></>}
        </div>

        <div className="pago">
          <span>Medio de pago:</span>
          {medios.filter((m) => m.nombre !== 'Voucher').map((m) => (
            <button key={m.id} type="button" className="lila" aria-pressed={medio === m.id} onClick={() => setMedio(m.id)}>{m.nombre}</button>
          ))}
          <button type="button" className="lila" aria-pressed={conVoucher} onClick={() => { setConVoucher(!conVoucher); setVoucher(null) }}>Voucher</button>
        </div>
        {conVoucher && (
          <form className="pago" onSubmit={aplicarVoucher}>
            <input name="codigo" aria-label="Código del voucher" placeholder="Código del voucher" maxLength={50} required />
            <button type="submit" className="lila">Aplicar</button>
          </form>
        )}
        {voucher && voucher.monto_precargado > total && <p className="nota">El voucher es de {pesos(voucher.monto_precargado)}: se usa una sola vez y el saldo que sobra se pierde.</p>}

        {error && <p className="mensaje" role="alert">{error}</p>}
        <div className="acciones">
          <button type="button" className="lila" onClick={() => (lineas.length === 0 || confirm('¿Cancelar la venta? Se pierde lo cargado.')) && ir('inicio')}>Cancelar venta</button>
          <button type="button" onClick={emitir} disabled={lineas.length === 0}>Emitir factura</button>
        </div>
      </section>
    </main>
  )
}
