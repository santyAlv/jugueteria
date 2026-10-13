import { useState } from 'react'
import Dialogo from './Dialogo.jsx'
import { nombreSucursal, pesos } from './api.js'

// Crear las cajas disponibles para la venta · Horarios de apertura y cierre
export default function Cajas({ datos, yo, guardar, avisar }) {
  const { sucursales, usuarios, cajas } = datos
  const [editando, setEditando] = useState(null) // null = cerrado · {} = alta · caja = modificación

  function eliminar() {
    if (!confirm(`¿Eliminar la caja ${editando.numero_caja}? Sus cajeros quedan sin caja asignada.`)) return
    guardar('DELETE', `/admin/cajas/${editando.id}`, undefined, 'Caja eliminada').catch((e) => avisar(e.message, true))
    setEditando(null)
  }

  return (
    <section id="cajas">
      <div className="titulo">
        <h2>Gestión de cajas</h2>
        <button type="button" className="lila" onClick={() => setEditando({})}>+ Nueva caja</button>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>ID</th><th>N° de caja</th><th>Sucursal</th><th>Apertura</th><th>Cierre</th><th>Cajeros</th><th>Estado</th><th>Monto</th><th></th></tr>
          </thead>
          <tbody>
            {cajas.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.numero_caja}</td>
                <td>{nombreSucursal(sucursales.find((s) => s.id === c.sucursal_id))}</td>
                <td>{c.hora_apertura}</td>
                <td>{c.hora_cierre}</td>
                <td>{usuarios.filter((u) => u.caja_id === c.id).map((u) => u.nombre_usuario).join(', ') || 'Sin cajeros'}</td>
                <td><span className="estado">{c.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'}</span></td>
                <td>{c.monto == null ? '—' : pesos(c.monto)}</td>
                <td><button type="button" className="lila chico" onClick={() => setEditando(c)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cajas.length === 0 && <p className="nota">Todavía no hay cajas: creá la primera con "+ Nueva caja".</p>}
      <p className="nota">Los cajeros se asignan a cada caja desde la columna "Caja" de Gestión de usuarios.</p>

      {editando && (
        <Dialogo
          titulo={editando.id ? 'Modificar caja' : 'Nueva caja'}
          alCerrar={() => setEditando(null)}
          alGuardar={(f) => {
            // La sucursal no se cambia al modificar (el campo deshabilitado no viaja en el formulario)
            const c = { ...f, sucursal_id: Number(f.sucursal_id ?? editando.sucursal_id) }
            return editando.id
              ? guardar('PUT', `/admin/cajas/${editando.id}`, c, 'Caja modificada')
              : guardar('POST', '/admin/cajas', c, 'Caja creada')
          }}
          extra={editando.id && <button type="button" className="enlace" onClick={eliminar}>Eliminar caja</button>}
        >
          <label>
            Número de caja:
            <input name="numero_caja" defaultValue={editando.numero_caja} maxLength={50} placeholder="2" autoComplete="off" required />
          </label>
          <label>
            Sucursal:
            <select name="sucursal_id" defaultValue={editando.sucursal_id ?? yo.sucursal_id} disabled={!!editando.id} required>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{nombreSucursal(s)}</option>)}
            </select>
          </label>
          <div className="dos">
            <label>
              Hora de apertura:
              <input name="hora_apertura" type="time" defaultValue={editando.hora_apertura ?? '09:00'} required />
            </label>
            <label>
              Hora de cierre:
              <input name="hora_cierre" type="time" defaultValue={editando.hora_cierre ?? '18:00'} required />
            </label>
          </div>
        </Dialogo>
      )}
    </section>
  )
}
