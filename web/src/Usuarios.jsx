import { useState } from 'react'
import Dialogo from './Dialogo.jsx'
import { nombreSucursal } from './api.js'

// Crear y administrar usuarios · Asignar roles · Asignar cajeros a cada caja
export default function Usuarios({ datos, yo, guardar, avisar }) {
  const { roles, sucursales, usuarios, cajas } = datos
  const [editando, setEditando] = useState(null) // null = cerrado · {} = alta · usuario = modificación

  // Cambios rápidos desde la tabla, como en el boceto: rol, sucursal, caja y estado
  const cambiar = (u, cambio, mensaje) =>
    guardar('PUT', `/admin/usuarios/${u.id}`, { ...u, ...cambio, password: '' }, mensaje).catch((e) => avisar(e.message, true))

  return (
    <section id="usuarios">
      <div className="titulo">
        <h2>Gestión de usuarios</h2>
        <button type="button" className="lila" onClick={() => setEditando({})}>+ Nuevo usuario</button>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>ID</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sucursal</th><th>Caja</th><th></th></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'inactivo'}>
                <td>{u.id}</td>
                <td>{u.nombre_usuario}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    aria-label={`Rol de ${u.nombre_usuario}`}
                    value={u.rol_id}
                    disabled={!u.activo || u.id === yo.id}
                    onChange={(e) => cambiar(u, { rol_id: Number(e.target.value) }, 'Rol asignado')}
                  >
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`Sucursal de ${u.nombre_usuario}`}
                    value={u.sucursal_id}
                    disabled={!u.activo}
                    onChange={(e) => cambiar(u, { sucursal_id: Number(e.target.value) }, 'Sucursal asignada')}
                  >
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{nombreSucursal(s)}</option>)}
                  </select>
                </td>
                <td>
                  {/* Solo tiene caja quien puede facturar (permiso "Facturación y caja" de su rol) */}
                  {u.activo && roles.find((r) => r.id === u.rol_id)?.vende ? (
                    <select
                      aria-label={`Caja de ${u.nombre_usuario}`}
                      value={u.caja_id ?? ''}
                      onChange={(e) => cambiar(u, { caja_id: Number(e.target.value) || null }, 'Caja asignada')}
                    >
                      <option value="">Sin caja</option>
                      {cajas.filter((c) => c.sucursal_id === u.sucursal_id).map((c) => (
                        <option key={c.id} value={c.id}>Caja {c.numero_caja}</option>
                      ))}
                    </select>
                  ) : '—'}
                </td>
                <td>
                  <button type="button" className="lila chico" onClick={() => setEditando(u)}>Editar</button>
                  {u.id !== yo.id && (
                    <button
                      type="button"
                      className="lila chico"
                      onClick={() => cambiar(u, { activo: !u.activo }, u.activo ? 'Usuario desactivado' : 'Usuario activado')}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <Dialogo
          titulo={editando.id ? 'Modificar usuario' : 'Nuevo usuario'}
          alCerrar={() => setEditando(null)}
          alGuardar={(f) => {
            const u = { ...editando, ...f, rol_id: Number(f.rol_id), sucursal_id: Number(f.sucursal_id) }
            return editando.id
              ? guardar('PUT', `/admin/usuarios/${editando.id}`, u, 'Usuario modificado')
              : guardar('POST', '/admin/usuarios', u, 'Usuario creado')
          }}
        >
          <label>
            Nombre de usuario:
            <input name="nombre_usuario" defaultValue={editando.nombre_usuario} maxLength={50} autoComplete="off" required />
          </label>
          <label>
            Correo:
            <input name="email" type="email" defaultValue={editando.email} maxLength={100} autoComplete="off" required />
          </label>
          <label>
            Contraseña:
            <input
              name="password"
              type="password"
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
              required={!editando.id}
              placeholder={editando.id ? 'Vacía = no se cambia' : 'Mínimo 6 caracteres'}
            />
          </label>
          <label>
            Rol:
            <select name="rol_id" defaultValue={editando.rol_id ?? ''} required>
              <option value="" disabled>Elegir rol...</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </label>
          <label>
            Sucursal:
            <select name="sucursal_id" defaultValue={editando.sucursal_id ?? yo.sucursal_id} required>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{nombreSucursal(s)}</option>)}
            </select>
          </label>
        </Dialogo>
      )}
    </section>
  )
}
