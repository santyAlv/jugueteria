// Permisos por rol (tabla acceso_roles): qué opciones del sistema puede usar cada uno.
// Cada casilla es una fila de la tabla; al tildarla cambia su columna `visible`.
export default function Permisos({ datos, guardar, avisar }) {
  const { roles, permisos } = datos
  const opciones = [...new Map(permisos.map((p) => [p.ruta_script, p.nombre_opcion]))]

  const cambiar = (permiso, visible) =>
    guardar('PUT', `/admin/permisos/${permiso.id}`, { visible }, 'Permiso actualizado').catch((e) => avisar(e.message, true))

  return (
    <section id="permisos">
      <div className="titulo"><h2>Permisos por rol</h2></div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Opción</th>{roles.map((r) => <th key={r.id}>{r.nombre}</th>)}</tr>
          </thead>
          <tbody>
            {opciones.map(([ruta, nombre]) => (
              <tr key={ruta}>
                <td>{nombre}</td>
                {roles.map((r) => {
                  const permiso = permisos.find((p) => p.ruta_script === ruta && p.rol_id === r.id)
                  return (
                    <td key={r.id}>
                      {permiso && (
                        <input
                          type="checkbox"
                          aria-label={`${nombre} para ${r.nombre}`}
                          checked={Boolean(permiso.visible)}
                          // El Administrador no puede quedarse sin el panel
                          disabled={r.nombre === 'Administrador' && ruta === '/api/admin'}
                          onChange={(e) => cambiar(permiso, e.target.checked)}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Los cambios rigen al instante, también para quien ya inició sesión.</p>
    </section>
  )
}
