// Cliente de la API REST (backend Node.js) + sesión.
// La sesión dura lo que la pestaña: al cerrarla hay que volver a iniciar sesión.
export const sesion = {
  get token() {
    return sessionStorage.getItem('token')
  },
  guardar: (token) => sessionStorage.setItem('token', token),
  borrar: () => sessionStorage.clear(),
}

// Caso de uso "Error": cualquier falla llega como un Error con un mensaje para mostrar
export async function api(metodo, ruta, cuerpo) {
  let r
  try {
    r = await fetch('/api' + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.token}` },
      body: cuerpo && JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor')
  }
  const datos = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(datos.error || `Error ${r.status}`), { estado: r.status })
  return datos
}

// --- Formato de pantalla ---
export const pesos = (v) => v.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })
export const fecha = (f) => new Date(f).toLocaleDateString('es-AR')
export const hora = (f) => new Date(f).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
// La tabla sucursales no tiene nombre: se identifica por número y domicilio
export const nombreSucursal = (s) => (s ? `Sucursal ${s.id} · ${s.domicilio}` : '—')
