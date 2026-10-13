// Panel de administración (boceto web "Super Admin"): usuarios y roles, permisos, cajas y datos del comercio.
// Las rutas se montan en /api/admin; el permiso se controla en server.js con tieneAcceso().
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { MONTO_CAJA } from './ventas.js'

// ---------------------------------------------------------------------------
// Validación de datos (nunca confiar en lo que manda el cliente)
// ---------------------------------------------------------------------------
const texto = (v) => (typeof v === 'string' ? v.trim() : '')
const esId = (v) => Number.isInteger(v) && v > 0
const esHora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

export function validarUsuario(b, esNuevo) {
  const nombre_usuario = texto(b?.nombre_usuario)
  const email = texto(b?.email)
  const password = b?.password ?? ''
  if (!nombre_usuario || nombre_usuario.length > 50) return { error: 'El nombre de usuario es obligatorio (máximo 50 caracteres)' }
  if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email inválido' }
  if (!esId(b.rol_id)) return { error: 'Elegí un rol' }
  if (!esId(b.sucursal_id)) return { error: 'Elegí una sucursal' }
  if (b.caja_id != null && !esId(b.caja_id)) return { error: 'Caja inválida' }
  // Al modificar, la contraseña vacía significa "no cambiarla". 72 es el máximo que usa bcrypt.
  if (typeof password !== 'string' || ((esNuevo || password) && (password.length < 6 || password.length > 72))) {
    return { error: 'La contraseña debe tener entre 6 y 72 caracteres' }
  }
  return {
    nombre_usuario, email, password, rol_id: b.rol_id, sucursal_id: b.sucursal_id,
    caja_id: b.caja_id ?? null, activo: b.activo == null || Boolean(b.activo),
  }
}

export function validarCaja(b) {
  const numero_caja = texto(b?.numero_caja)
  if (!numero_caja || numero_caja.length > 50) return { error: 'El número de caja es obligatorio (máximo 50 caracteres)' }
  if (!esId(b.sucursal_id)) return { error: 'Elegí una sucursal' }
  if (!esHora(b.hora_apertura) || !esHora(b.hora_cierre)) return { error: 'Horario inválido (formato HH:MM)' }
  if (b.hora_apertura >= b.hora_cierre) return { error: 'La hora de apertura debe ser anterior a la de cierre' }
  return { numero_caja, sucursal_id: b.sucursal_id, hora_apertura: b.hora_apertura, hora_cierre: b.hora_cierre }
}

export function validarSucursal(b) {
  const s = { razon_social: texto(b?.razon_social), domicilio: texto(b?.domicilio), telefono: texto(b?.telefono) }
  if (!s.razon_social || s.razon_social.length > 100) return { error: 'La razón social es obligatoria (máximo 100 caracteres)' }
  if (!s.domicilio || s.domicilio.length > 150) return { error: 'El domicilio es obligatorio (máximo 150 caracteres)' }
  if (s.telefono.length > 50) return { error: 'Teléfono demasiado largo (máximo 50 caracteres)' }
  return s
}

// ---------------------------------------------------------------------------
// Rutas. El administrador ve y configura todas las sucursales.
// ---------------------------------------------------------------------------
export function rutasAdmin(db) {
  const r = Router()

  // --- Configurar datos del comercio: sucursal, domicilio, razón social ---
  r.get('/sucursales', async (req, res) => {
    const [rows] = await db.query('SELECT id, razon_social, domicilio, telefono FROM sucursales ORDER BY id')
    res.json(rows)
  })

  r.post('/sucursales', async (req, res) => {
    const s = validarSucursal(req.body)
    if (s.error) return res.status(400).json(s)
    const [x] = await db.query('INSERT INTO sucursales (razon_social, domicilio, telefono) VALUES (?, ?, ?)', [
      s.razon_social, s.domicilio, s.telefono || null,
    ])
    res.status(201).json({ id: x.insertId })
  })

  // sucursales.actualizarDatos()
  r.put('/sucursales/:id', async (req, res) => {
    const s = validarSucursal(req.body)
    if (s.error) return res.status(400).json(s)
    const [x] = await db.query('UPDATE sucursales SET razon_social = ?, domicilio = ?, telefono = ? WHERE id = ?', [
      s.razon_social, s.domicilio, s.telefono || null, req.params.id,
    ])
    if (!x.affectedRows) return res.status(404).json({ error: 'Sucursal no encontrada' })
    res.json({ id: Number(req.params.id) })
  })

  // --- Crear y administrar usuarios · Asignar roles (Gerente, Deposito, Cajero) ---
  // vende: el rol tiene habilitada la facturación, así que sus usuarios pueden tener caja
  const ROLES = `SELECT r.id, r.nombre,
                        EXISTS(SELECT 1 FROM acceso_roles a
                                WHERE a.rol_id = r.id AND a.ruta_script = '/api/ventas' AND a.visible = 1) AS vende
                   FROM roles r`

  r.get('/roles', async (req, res) => {
    const [rows] = await db.query(`${ROLES} ORDER BY r.id`)
    res.json(rows)
  })

  // --- Permisos de cada rol: acceso_roles.cambiarVisibilidad(visible) ---
  r.get('/permisos', async (req, res) => {
    const [rows] = await db.query('SELECT id, rol_id, nombre_opcion, ruta_script, visible FROM acceso_roles ORDER BY id')
    res.json(rows)
  })

  r.put('/permisos/:id', async (req, res) => {
    const visible = Boolean(req.body?.visible)
    const [[p]] = await db.query('SELECT a.ruta_script, r.nombre AS rol FROM acceso_roles a JOIN roles r ON r.id = a.rol_id WHERE a.id = ?', [
      req.params.id,
    ])
    if (!p) return res.status(404).json({ error: 'Permiso no encontrado' })
    // Que el sistema nunca se quede sin nadie que pueda administrarlo
    if (!visible && p.rol === 'Administrador' && p.ruta_script === '/api/admin') {
      return res.status(400).json({ error: 'El Administrador no puede quedarse sin el panel de administración' })
    }
    await db.query('UPDATE acceso_roles SET visible = ? WHERE id = ?', [visible, req.params.id])
    res.json({ id: Number(req.params.id), visible })
  })

  r.get('/usuarios', async (req, res) => {
    const [rows] = await db.query(
      `SELECT u.id, u.nombre_usuario, u.email, u.rol_id, r.nombre AS rol, u.sucursal_id, u.caja_id, u.activo
         FROM usuarios u JOIN roles r ON r.id = u.rol_id
        ORDER BY u.id`
    )
    res.json(rows)
  })

  async function buscarRol(id) {
    const [[rol]] = await db.query(`${ROLES} WHERE r.id = ?`, [id])
    return rol
  }

  // La caja se asigna después, desde la lista de usuarios
  r.post('/usuarios', async (req, res) => {
    const u = validarUsuario(req.body, true)
    if (u.error) return res.status(400).json(u)
    if (!(await buscarRol(u.rol_id))) return res.status(400).json({ error: 'El rol no existe' })
    const [x] = await db.query(
      'INSERT INTO usuarios (nombre_usuario, email, password_hash, rol_id, sucursal_id) VALUES (?, ?, ?, ?, ?)',
      [u.nombre_usuario, u.email, await bcrypt.hash(u.password, 10), u.rol_id, u.sucursal_id]
    )
    res.status(201).json({ id: x.insertId })
  })

  // Modificar datos, cambiarPassword(), asignar rol, asignarSucursal(), asignarCaja() y dar de baja
  r.put('/usuarios/:id', async (req, res) => {
    const u = validarUsuario(req.body, false)
    if (u.error) return res.status(400).json(u)
    const rol = await buscarRol(u.rol_id)
    if (!rol) return res.status(400).json({ error: 'El rol no existe' })
    const id = Number(req.params.id)
    // Que el sistema nunca se quede sin administrador
    if (id === req.usuario.id && (rol.nombre !== 'Administrador' || !u.activo)) {
      return res.status(400).json({ error: 'No podés desactivarte ni quitarte el rol de Administrador' })
    }
    // Asignar cajeros a cada caja: solo tiene caja un usuario activo cuyo rol puede facturar,
    // y la caja tiene que ser de su sucursal
    const [x] = await db.query(
      `UPDATE usuarios
          SET nombre_usuario = ?, email = ?, rol_id = ?, sucursal_id = ?, activo = ?,
              caja_id = IF(?, (SELECT id FROM cajas WHERE id = ? AND sucursal_id = ?), NULL),
              password_hash = COALESCE(?, password_hash)
        WHERE id = ?`,
      [u.nombre_usuario, u.email, u.rol_id, u.sucursal_id, u.activo,
        Boolean(rol.vende && u.activo), u.caja_id, u.sucursal_id,
        u.password ? await bcrypt.hash(u.password, 10) : null, id]
    )
    if (!x.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json({ id })
  })

  // --- Crear cajas · Horarios de apertura y cierre ---
  r.get('/cajas', async (req, res) => {
    const [rows] = await db.query(
      `SELECT c.id, c.numero_caja, c.sucursal_id, c.estado,
              TIME_FORMAT(c.hora_apertura, '%H:%i') AS hora_apertura, TIME_FORMAT(c.hora_cierre, '%H:%i') AS hora_cierre,
              IF(c.estado = 'ABIERTA', ${MONTO_CAJA}, NULL) AS monto
         FROM cajas c ORDER BY c.sucursal_id, c.numero_caja`
    )
    res.json(rows)
  })

  r.post('/cajas', async (req, res) => {
    const c = validarCaja(req.body)
    if (c.error) return res.status(400).json(c)
    const [x] = await db.query('INSERT INTO cajas (numero_caja, sucursal_id, hora_apertura, hora_cierre) VALUES (?, ?, ?, ?)', [
      c.numero_caja, c.sucursal_id, c.hora_apertura, c.hora_cierre,
    ])
    res.status(201).json({ id: x.insertId })
  })

  // La caja no cambia de sucursal: sus cajeros y sus ventas son de esa sucursal
  r.put('/cajas/:id', async (req, res) => {
    const c = validarCaja(req.body)
    if (c.error) return res.status(400).json(c)
    const [x] = await db.query('UPDATE cajas SET numero_caja = ?, hora_apertura = ?, hora_cierre = ? WHERE id = ? AND sucursal_id = ?', [
      c.numero_caja, c.hora_apertura, c.hora_cierre, req.params.id, c.sucursal_id,
    ])
    if (!x.affectedRows) return res.status(404).json({ error: 'Caja no encontrada' })
    res.json({ id: Number(req.params.id) })
  })

  // Los cajeros de la caja quedan sin asignar (ON DELETE SET NULL)
  r.delete('/cajas/:id', async (req, res) => {
    const [x] = await db.query("DELETE FROM cajas WHERE id = ? AND estado = 'CERRADA'", [req.params.id])
    if (!x.affectedRows) return res.status(409).json({ error: 'No se puede eliminar: la caja no existe o está abierta' })
    res.json({ ok: true })
  })

  // Errores de la base con un mensaje propio; el resto sigue al manejador general
  r.use((err, req, res, next) => {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'La sucursal elegida no existe' })
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'No se puede eliminar: la caja ya tiene operaciones registradas' })
    if (err.code !== 'ER_DUP_ENTRY') return next(err)
    const cual = req.path.startsWith('/cajas') ? 'una caja con ese número en la sucursal'
      : /email/.test(err.sqlMessage) ? 'un usuario con ese email'
      : 'un usuario con ese nombre'
    res.status(409).json({ error: `Ya existe ${cual}` })
  })

  return r
}
