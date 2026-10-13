import { useState } from 'react'
import Dialogo from './Dialogo.jsx'

// Configurar datos del comercio: sucursal, domicilio, razón social
export default function Sucursales({ datos, guardar }) {
  const [editando, setEditando] = useState(null) // null = cerrado · {} = alta · sucursal = modificación

  return (
    <section id="comercio">
      <div className="titulo">
        <h2>Datos del comercio</h2>
        <button type="button" className="lila" onClick={() => setEditando({})}>+ Nueva sucursal</button>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>ID</th><th>Razón social</th><th>Domicilio</th><th>Teléfono</th><th></th></tr>
          </thead>
          <tbody>
            {datos.sucursales.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.razon_social}</td>
                <td>{s.domicilio}</td>
                <td>{s.telefono ?? '—'}</td>
                <td><button type="button" className="lila chico" onClick={() => setEditando(s)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <Dialogo
          titulo={editando.id ? `Modificar sucursal ${editando.id}` : 'Nueva sucursal'}
          alCerrar={() => setEditando(null)}
          alGuardar={(f) =>
            editando.id
              ? guardar('PUT', `/admin/sucursales/${editando.id}`, f, 'Datos del comercio guardados')
              : guardar('POST', '/admin/sucursales', f, 'Sucursal creada')
          }
        >
          <label>
            Razón social:
            <input name="razon_social" defaultValue={editando.razon_social} maxLength={100} required />
          </label>
          <label>
            Domicilio:
            <input name="domicilio" defaultValue={editando.domicilio} maxLength={150} required />
          </label>
          <label>
            Teléfono:
            <input name="telefono" defaultValue={editando.telefono ?? ''} maxLength={50} />
          </label>
        </Dialogo>
      )}
    </section>
  )
}
