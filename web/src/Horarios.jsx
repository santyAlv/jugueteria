import { useState } from 'react'
import Dialogo from './Dialogo.jsx'

// Gerente: hora de apertura y cierre de cada caja + hora límite de ventas
export default function Horarios({ datos, guardar }) {
  const [editando, setEditando] = useState(null)

  return (
    <section id="horarios">
      <div className="titulo"><h2>Horarios de las cajas</h2></div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>N° de caja</th><th>Apertura</th><th>Cierre</th><th>Límite de ventas</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {datos.horarios.map((c) => (
              <tr key={c.id}>
                <td>{c.numero_caja}</td>
                <td>{c.hora_apertura}</td>
                <td>{c.hora_cierre}</td>
                <td>{c.hora_limite_ventas ?? 'Sin límite'}</td>
                <td><span className="estado">{c.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'}</span></td>
                <td><button type="button" className="lila chico" onClick={() => setEditando(c)}>Configurar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Pasada la hora límite, la caja deja de facturar y de vender vouchers; el cierre se puede hacer igual.</p>

      {editando && (
        <Dialogo
          titulo={`Configurar la caja ${editando.numero_caja}`}
          alCerrar={() => setEditando(null)}
          alGuardar={(f) => guardar('PUT', `/gerente/cajas/${editando.id}`, f, 'Horario guardado')}
        >
          <div className="dos">
            <label>
              Hora de apertura:
              <input name="hora_apertura" type="time" defaultValue={editando.hora_apertura} required />
            </label>
            <label>
              Hora de cierre:
              <input name="hora_cierre" type="time" defaultValue={editando.hora_cierre} required />
            </label>
          </div>
          <label>
            Hora límite de ventas (vacío = sin límite):
            <input name="hora_limite_ventas" type="time" defaultValue={editando.hora_limite_ventas ?? ''} />
          </label>
        </Dialogo>
      )}
    </section>
  )
}
