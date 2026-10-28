import { useEffect, useState } from 'react'
import { pesos } from './api.js'

const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fechaLarga = (f) => f.split('-').reverse().join('/')

// Cada informe: de qué ruta sale, si pide un rango o un día y cómo se dibuja su tabla
const INFORMES = {
  'Ventas de caja': {
    ruta: '/reportes/ventas-caja', rango: true,
    resumen: (d) => [['Ventas', d.ventas], ['Total', pesos(d.total)]],
    columnas: ['Fecha', 'Caja', 'Ventas', 'Anuladas', 'Total'],
    fila: (f) => [fechaLarga(f.fecha), f.numero_caja, f.ventas, f.anuladas, pesos(f.total)],
  },
  'Ventas de productos': {
    ruta: '/reportes/ventas-producto', rango: true,
    resumen: (d) => [['Unidades vendidas', d.unidades], ['Importe', pesos(d.importe)]],
    columnas: ['Producto', 'Código de barras', 'Unidades', 'Importe'],
    fila: (f) => [f.nombre, f.codigo_barras, f.unidades, pesos(f.importe)],
  },
  'Recaudación del día': {
    ruta: '/reportes/recaudacion',
    resumen: (d) => [
      ['Ventas', d.ventas], ['Recaudación', pesos(d.total)],
      ['Anuladas', `${d.anuladas.cantidad} (${pesos(d.anuladas.monto)})`],
      ['Vouchers vendidos', pesos(d.vouchers_vendidos)], ['Retiros de caja', pesos(d.retiros)],
    ],
    columnas: ['Medio de pago', 'Monto'],
    fila: (f) => [f.medio, pesos(f.monto)],
  },
  'Ganancia del día': {
    ruta: '/reportes/ganancia',
    resumen: (d) => [['Venta sin IVA', pesos(d.venta_neta)], ['Costo', pesos(d.costo)], ['Ganancia', pesos(d.ganancia)]],
    columnas: ['Producto', 'Unidades', 'Venta sin IVA', 'Costo', 'Ganancia'],
    fila: (f) => [f.nombre, f.unidades, pesos(f.venta_neta), pesos(f.costo), pesos(f.ganancia)],
    nota: 'Ganancia = precio de venta sin IVA − precio de ingreso, por unidad vendida. Las ventas anuladas no cuentan.',
  },
  'Ventas por cajero': {
    ruta: '/reportes/ventas-cajero', rango: true,
    resumen: (d) => [['Ventas', d.ventas], ['Total', pesos(d.total)]],
    columnas: ['Cajero', 'Ventas', 'Total'],
    fila: (f) => [f.nombre_usuario, f.ventas, pesos(f.total)],
  },
}
// Recaudación y ganancia traen sus filas en otro campo
const FILAS = { 'Recaudación del día': (d) => d.medios }

// Informes del gerente: ventas de caja, ventas de productos, recaudación y ganancia (mínimos) + ventas por cajero
export default function Informes({ pedir, ir }) {
  const hoy = dia(new Date())
  const [nombre, setNombre] = useState('Ventas de caja')
  const [desde, setDesde] = useState(dia(new Date(Date.now() - 29 * 86400000)))
  const [hasta, setHasta] = useState(hoy)
  const [fecha, setFecha] = useState(hoy)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const inf = INFORMES[nombre]

  useEffect(() => {
    let vigente = true
    setError(null)
    const consulta = inf.rango ? `desde=${desde}&hasta=${hasta}` : `fecha=${fecha}`
    pedir('GET', `${inf.ruta}?${consulta}`)
      .then((d) => vigente && setDatos(d))
      .catch((e) => vigente && (setDatos(null), setError(e.message)))
    return () => { vigente = false }
  }, [nombre, desde, hasta, fecha])

  const filas = datos && (FILAS[nombre]?.(datos) ?? datos.filas)

  return (
    <main>
      <button type="button" className="icono" onClick={() => ir('inicio')} aria-label="Volver">‹</button>
      <h1>Informes</h1>

      <section>
        <div className="titulo">
          <div className="pago">
            {Object.keys(INFORMES).map((n) => (
              <button key={n} type="button" className="lila chico" aria-pressed={nombre === n} onClick={() => { setDatos(null); setNombre(n) }}>{n}</button>
            ))}
          </div>
        </div>
        <div className="titulo">
          {inf.rango ? (
            <div className="pago">
              <label>Desde: <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} /></label>
              <label>Hasta: <input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} /></label>
            </div>
          ) : (
            <label>Día: <input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)} /></label>
          )}
        </div>

        {error && <p className="mensaje" role="alert">{error}</p>}
        {datos && (
          <>
            <div className="resumen">
              {inf.resumen(datos).map(([titulo, valor]) => <span key={titulo}>{titulo}: <strong>{valor}</strong></span>)}
            </div>
            <div className="scroll">
              <table>
                <thead><tr>{inf.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {filas.map((f, i) => <tr key={i}>{inf.fila(f).map((v, j) => <td key={j}>{v}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
            {filas.length === 0 && <p className="nota">No hay datos para el período elegido.</p>}
            {inf.nota && <p className="nota">{inf.nota}</p>}
          </>
        )}
      </section>
    </main>
  )
}
