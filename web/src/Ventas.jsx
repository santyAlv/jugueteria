import { useState } from 'react'
import { fecha, hora, pesos } from './api.js'

// Fila por venta; "Pago" y "Detalle" se despliegan (los ▾ del boceto)
export function TablaVentas({ ventas }) {
  if (ventas.length === 0) return <p className="nota">No hay ventas para mostrar.</p>
  return (
    <div className="scroll">
      <table className="ventas">
        <thead>
          <tr><th>ID</th><th>Caja</th><th>Usuario</th><th>Fecha</th><th>Hora</th><th>Total</th><th>Pago</th><th>Detalle</th></tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td>{v.id}</td>
              <td>{v.numero_caja}</td>
              <td>{v.nombre_usuario}</td>
              <td>{fecha(v.fecha_hora)}</td>
              <td>{hora(v.fecha_hora)}</td>
              <td>{pesos(v.total)}</td>
              <td>
                <details>
                  <summary>{(v.pagos ?? []).map((p) => p.medio).join(' + ') || 'Sin cobro'}</summary>
                  {(v.pagos ?? []).map((p, i) => <div key={i}>{p.medio}: {pesos(p.monto)}</div>)}
                </details>
              </td>
              <td>
                <details>
                  <summary>{(v.detalle ?? []).reduce((n, d) => n + d.cantidad, 0)} unidades</summary>
                  {(v.detalle ?? []).map((d, i) => <div key={i}>{d.cantidad} × {d.producto} · {pesos(d.subtotal)}</div>)}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Desde cuándo se muestran las ventas en cada filtro
const PERIODOS = {
  Día: (hoy) => hoy,
  Semana: (hoy) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6),
  Mes: (hoy) => new Date(hoy.getFullYear(), hoy.getMonth(), 1),
  Todo: () => new Date(0),
}
const ORDENES = {
  'Más recientes': (a, b) => b.id - a.id,
  'Total: menor a mayor': (a, b) => a.total - b.total,
  'Total: mayor a menor': (a, b) => b.total - a.total,
}

// Boceto "Ventas": filtros por período, orden, cantidad de ventas y total
export default function Ventas({ datos, ir }) {
  const [periodo, setPeriodo] = useState('Día')
  const [orden, setOrden] = useState('Más recientes')

  const ahora = new Date()
  const desde = PERIODOS[periodo](new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()))
  const ventas = datos.ventas.filter((v) => new Date(v.fecha_hora) >= desde).sort(ORDENES[orden])
  const total = ventas.reduce((t, v) => t + Math.round(v.total * 100), 0) / 100
  const todas = datos.yo.accesos.includes('/api/reportes')

  return (
    <main>
      <button type="button" className="icono" onClick={() => ir('inicio')} aria-label="Volver">‹</button>
      <h1>{todas ? 'Gestión de ventas' : `Ventas de Caja ${datos.caja?.numero_caja ?? ''}`}</h1>

      <section>
        <div className="titulo">
          <div className="pago">
            <span>Filtros:</span>
            {Object.keys(PERIODOS).map((p) => (
              <button key={p} type="button" className="lila chico" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}>{p}</button>
            ))}
          </div>
          <label className="orden">
            Orden:
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              {Object.keys(ORDENES).map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        </div>
        <div className="resumen">
          <span>Cantidad de ventas: <strong>{ventas.length}</strong></span>
          <span>Total: <strong>{pesos(total)}</strong></span>
        </div>
        <TablaVentas ventas={ventas} />
      </section>
    </main>
  )
}
