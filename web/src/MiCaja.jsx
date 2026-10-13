import { useState } from 'react'
import { pesos } from './api.js'
import Dialogo from './Dialogo.jsx'

// Boceto "Vistas caja": la caja del usuario, su apertura y cierre (arqueo) y el acceso a facturar
export default function MiCaja({ datos, guardar, ir }) {
  const { caja } = datos
  const [dialogo, setDialogo] = useState(null) // null · 'apertura' · 'cierre'
  const [cierre, setCierre] = useState(null) // resultado del último arqueo hecho en esta sesión

  if (!caja) {
    return (
      <section id="caja">
        <div className="titulo"><h2>Mi caja</h2></div>
        <p className="nota">No tenés una caja asignada. La asigna el administrador en Gestión de usuarios, columna "Caja".</p>
      </section>
    )
  }

  const abierta = caja.estado === 'ABIERTA'
  return (
    <section id="caja">
      <div className="titulo">
        <h2>Caja {caja.numero_caja} <span className="estado">{abierta ? 'Abierta' : 'Cerrada'}</span></h2>
        <div className="botones">
          {abierta && <button type="button" onClick={() => ir('factura')}>+ Nueva factura</button>}
          <button type="button" className="lila" onClick={() => setDialogo(abierta ? 'cierre' : 'apertura')}>
            {abierta ? 'Cerrar caja' : 'Abrir caja'}
          </button>
        </div>
      </div>
      <p className="nota">
        Horario: {caja.hora_apertura} a {caja.hora_cierre}
        {abierta && <> · Efectivo en caja según el sistema: <strong>{pesos(caja.monto)}</strong></>}
      </p>
      {cierre && (
        <p className="nota">
          Último cierre: el sistema calculó {pesos(cierre.monto_sistema)} y se declararon {pesos(cierre.monto_declarado)}.{' '}
          <strong>
            {cierre.diferencia === 0 ? 'Sin diferencia.' : `${cierre.diferencia > 0 ? 'Sobrante' : 'Faltante'} de ${pesos(Math.abs(cierre.diferencia))}.`}
          </strong>
        </p>
      )}

      {dialogo && (
        <Dialogo
          titulo={dialogo === 'apertura' ? `Abrir caja ${caja.numero_caja}` : `Cerrar caja ${caja.numero_caja}`}
          alCerrar={() => setDialogo(null)}
          alGuardar={async (f) => {
            const r = await guardar('POST', `/caja/${dialogo}`, { monto_declarado: Number(f.monto_declarado) }, dialogo === 'apertura' ? 'Caja abierta' : 'Caja cerrada')
            setCierre(dialogo === 'cierre' ? r : null)
          }}
        >
          <label>
            {dialogo === 'apertura' ? 'Efectivo con el que abre la caja ($):' : 'Efectivo contado en la caja ($):'}
            <input name="monto_declarado" type="number" min="0" step="0.01" inputMode="decimal" required />
          </label>
          {dialogo === 'cierre' && <p className="nota">El sistema lo compara con la apertura más las ventas en efectivo y registra la diferencia.</p>}
        </Dialogo>
      )}
    </section>
  )
}
