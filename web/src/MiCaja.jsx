import { useEffect, useState } from 'react'
import { api, fecha, hora, pesos } from './api.js'
import Dialogo from './Dialogo.jsx'

// Informe de cierre: lo vendido por forma de pago, fecha, número de caja y el arqueo
function Informe({ i }) {
  const dif = i.diferencia
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Caja</th><th>Efectivo</th><th>Digital</th><th>Voucher</th><th>Retiros</th><th>Sistema</th><th>Declarado</th><th>Diferencia</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>{fecha(i.fecha_hora)} {hora(i.fecha_hora)}</td>
            <td>{i.numero_caja}</td>
            <td>{pesos(i.total_efectivo)}</td>
            <td>{pesos(i.total_digital)}</td>
            <td>{pesos(i.total_voucher)}</td>
            <td>{pesos(i.total_retiros)}</td>
            <td>{pesos(i.monto_sistema)}</td>
            <td>{pesos(i.monto_declarado)}</td>
            <td>{dif === 0 ? 'Sin diferencia' : `${dif > 0 ? 'Sobrante' : 'Faltante'} ${pesos(Math.abs(dif))}`}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Boceto "Vistas caja": la caja del usuario, su apertura y cierre (arqueo), los retiros (achique),
// la venta de vouchers y el acceso a facturar
export default function MiCaja({ datos, guardar, ir }) {
  const { caja, medios } = datos
  const [dialogo, setDialogo] = useState(null) // null · 'apertura' · 'cierre' · 'retiro' · 'voucher'
  const [cierre, setCierre] = useState(null) // informe del último cierre hecho en esta sesión
  const [voucher, setVoucher] = useState(null) // último voucher creado
  const [informes, setInformes] = useState([])

  // Informes de cierre anteriores (se vuelven a leer cuando cambia el estado de la caja)
  useEffect(() => {
    api('GET', '/caja/informes').then(setInformes).catch(() => setInformes([]))
  }, [caja?.estado])

  if (!caja) {
    return (
      <section id="caja">
        <div className="titulo"><h2>Mi caja</h2></div>
        <p className="nota">No tenés una caja asignada. La asigna el administrador en Gestión de usuarios, columna "Caja".</p>
      </section>
    )
  }

  const abierta = caja.estado === 'ABIERTA'
  const titulos = { apertura: `Abrir caja ${caja.numero_caja}`, cierre: `Cerrar caja ${caja.numero_caja}`, retiro: 'Retirar efectivo (achique)', voucher: 'Crear voucher / tarjeta de regalo' }

  async function enviar(f) {
    if (dialogo === 'retiro') return guardar('POST', '/caja/retiros', { monto: Number(f.monto), motivo: f.motivo }, 'Achique registrado')
    if (dialogo === 'voucher') {
      const v = await guardar('POST', '/vouchers', { monto: Number(f.monto), medio_pago_id: Number(f.medio_pago_id) }, 'Voucher creado')
      return setVoucher(v)
    }
    const r = await guardar('POST', `/caja/${dialogo}`, { monto_declarado: Number(f.monto_declarado) }, dialogo === 'apertura' ? 'Caja abierta' : 'Caja cerrada')
    setCierre(dialogo === 'cierre' ? r : null)
  }

  return (
    <section id="caja">
      <div className="titulo">
        <h2>Caja {caja.numero_caja} <span className="estado">{abierta ? 'Abierta' : 'Cerrada'}</span></h2>
        <div className="botones">
          {abierta && <button type="button" onClick={() => ir('factura')}>+ Nueva factura</button>}
          {abierta && <button type="button" className="lila" onClick={() => setDialogo('voucher')}>Crear voucher</button>}
          {abierta && <button type="button" className="lila" onClick={() => setDialogo('retiro')}>Achique</button>}
          <button type="button" className="lila" onClick={() => setDialogo(abierta ? 'cierre' : 'apertura')}>
            {abierta ? 'Cerrar caja' : 'Abrir caja'}
          </button>
        </div>
      </div>
      <p className="nota">
        Horario: {caja.hora_apertura} a {caja.hora_cierre}
        {abierta && <> · Efectivo en caja según el sistema: <strong>{pesos(caja.monto)}</strong></>}
      </p>
      {voucher && (
        <p className="nota">
          Voucher creado: <strong>{voucher.numero_referencia}</strong> (ID {voucher.id}) por {pesos(voucher.monto_precargado)}. Se usa una sola vez.
        </p>
      )}

      {abierta && caja.retiros?.length > 0 && (
        <>
          <h3>Achiques de este turno</h3>
          <div className="scroll">
            <table>
              <thead><tr><th>Fecha</th><th>Monto</th><th>Motivo</th></tr></thead>
              <tbody>
                {caja.retiros.map((r) => (
                  <tr key={r.id}><td>{fecha(r.fecha_hora)} {hora(r.fecha_hora)}</td><td>{pesos(r.monto)}</td><td>{r.motivo}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {cierre && (
        <>
          <h3>Informe del cierre</h3>
          <Informe i={cierre} />
        </>
      )}
      {informes.length > 0 && (
        <details>
          <summary>Informes de cierre anteriores</summary>
          {informes.map((i) => <Informe key={i.id} i={i} />)}
        </details>
      )}

      {dialogo && (
        <Dialogo titulo={titulos[dialogo]} alCerrar={() => setDialogo(null)} alGuardar={enviar}>
          {(dialogo === 'apertura' || dialogo === 'cierre') && (
            <label>
              {dialogo === 'apertura' ? 'Efectivo con el que abre la caja ($):' : 'Efectivo contado en la caja ($):'}
              <input name="monto_declarado" type="number" min="0" step="0.01" inputMode="decimal" required />
            </label>
          )}
          {dialogo === 'cierre' && (
            <p className="nota">El sistema lo compara con la apertura más las ventas en efectivo, menos los achiques. Se permite una diferencia de hasta $3.000.</p>
          )}
          {(dialogo === 'retiro' || dialogo === 'voucher') && (
            <label>
              Monto ($):
              <input name="monto" type="number" min="0.01" step="0.01" inputMode="decimal" required />
            </label>
          )}
          {dialogo === 'retiro' && (
            <label>
              Motivo:
              <input name="motivo" maxLength={255} required />
            </label>
          )}
          {dialogo === 'voucher' && (
            <label>
              Se paga con:
              <select name="medio_pago_id" required>
                {medios.filter((m) => m.nombre !== 'Voucher').map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}
        </Dialogo>
      )}
    </section>
  )
}
