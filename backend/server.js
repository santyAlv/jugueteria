// API REST del Sistema de Gestión para Juguetería
// Módulos: inicio de sesión y permisos, carga de productos (Caso de Uso 3),
//          panel de administración (admin.js), caja y ventas (ventas.js) y módulo del gerente (gerente.js).
//          El frontend web en React está en ../web
import { join } from 'node:path'
import express from 'express'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import { codigoInterno } from './codigo-barras.js'
import { rutasAdmin } from './admin.js'
import { rutasVentas } from './ventas.js'
import { rutasGerente, rutasReportes } from './gerente.js'

const SECRET = process.env.JWT_SECRET || 'cambiar-este-secreto'
const PORT = Number(process.env.PORT || 3000)
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jugueteria',
  decimalNumbers: true,
})

const app = express()
app.use(express.json())
// Frontend web ya compilado (npm run build en ../web): queda en http://localhost:3000
app.use(express.static(join(import.meta.dirname, '../web/dist')))

// Prueba de conexión desde la app (para verificar la IP y el puerto configurados)
app.get('/api/ping', (req, res) => res.json({ ok: true }))

// ---------------------------------------------------------------------------
// Caso de Uso 1: Iniciar sesión
// ---------------------------------------------------------------------------
// campo: 'email' o 'id' (nunca viene del cliente). Los usuarios desactivados no existen para la API.
// accesos: las opciones que su rol tiene habilitadas en acceso_roles.
async function usuarioActivo(campo, valor) {
  const [[u]] = await db.query(
    `SELECT u.id, u.nombre_usuario, u.email, u.password_hash, u.sucursal_id, u.caja_id, r.nombre AS rol,
            (SELECT JSON_ARRAYAGG(a.ruta_script) FROM acceso_roles a WHERE a.rol_id = u.rol_id AND a.visible = 1) AS accesos
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.${campo} = ? AND u.activo = 1`,
    [valor]
  )
  if (u) u.accesos ??= []
  return u
}

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  const u = await usuarioActivo('email', String(email ?? ''))
  if (!u || !(await bcrypt.compare(String(password ?? ''), u.password_hash))) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' })
  }
  const usuario = { id: u.id, nombre_usuario: u.nombre_usuario, rol: u.rol, sucursal_id: u.sucursal_id }
  res.json({ token: jwt.sign(usuario, SECRET, { expiresIn: '8h' }), usuario })
})

// El token solo dice quién es: el rol y el estado se leen de la base en cada pedido,
// así un cambio de rol o una baja hecha por el administrador rige al instante.
async function autenticado(req, res, next) {
  let id
  try {
    id = jwt.verify((req.headers.authorization ?? '').replace('Bearer ', ''), SECRET).id
  } catch {}
  req.usuario = id && (await usuarioActivo('id', id))
  if (req.usuario) return next()
  res.status(401).json({ error: 'Sesión vencida, volvé a iniciar sesión' })
}

// usuarios.tieneAcceso(ruta_script): los permisos de cada rol salen de la tabla acceso_roles
const tieneAcceso = (ruta, accion) => (req, res, next) => {
  if (req.usuario.accesos.includes(ruta)) return next()
  res.status(403).json({ error: `El rol ${req.usuario.rol} no puede ${accion}` })
}
const puedeCargar = tieneAcceso('/api/productos', 'cargar productos')

// Datos del usuario y opciones habilitadas: con esto el frontend web arma sus pantallas
app.get('/api/menu', autenticado, (req, res) => {
  const { id, nombre_usuario, rol, sucursal_id, caja_id, accesos } = req.usuario
  res.json({ id, nombre_usuario, rol, sucursal_id, caja_id, accesos })
})

// ---------------------------------------------------------------------------
// Caso de Uso 1: Recuperar Contraseña (Servidor de Correo SMTP del Diagrama de Despliegue)
// ---------------------------------------------------------------------------
// Sin SMTP_HOST el mail no sale: se muestra en la consola del servidor (sirve para desarrollar).
const smtp = process.env.SMTP_HOST && nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_PORT === '465',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
})
async function enviarCorreo(para, asunto, texto) {
  if (!smtp) return console.log(`[correo sin enviar: falta SMTP_HOST] Para: ${para} · ${asunto}\n${texto}`)
  await smtp.sendMail({ from: process.env.SMTP_FROM || 'Juguetería <no-responder@jugueteria.com>', to: para, subject: asunto, text: texto })
}

// El token se firma también con el hash actual: en cuanto se cambia la contraseña deja de servir
const claveRecuperar = (u) => SECRET + u.password_hash

// ponytail: sin límite de pedidos por IP (tampoco el login); agregar express-rate-limit antes de exponerlo a internet
app.post('/api/recuperar', async (req, res) => {
  const u = await usuarioActivo('email', String(req.body?.email ?? ''))
  if (u) {
    // La dirección del enlace sale de la configuración, nunca de lo que manda el cliente
    const web = process.env.URL_WEB || `http://localhost:${PORT}`
    const token = jwt.sign({ id: u.id }, claveRecuperar(u), { expiresIn: '15m' })
    await enviarCorreo(
      u.email,
      'Recuperar contraseña - Juguetería',
      `Hola ${u.nombre_usuario}:\n\nPara elegir una contraseña nueva entrá a este enlace (vale 15 minutos):\n${web}/?recuperar=${token}\n\nSi no lo pediste, ignorá este mensaje.`
    )
  }
  // La misma respuesta exista o no el email, para no revelar quién está registrado
  res.json({ mensaje: 'Si el email está registrado, te enviamos un enlace para cambiar la contraseña' })
})

app.post('/api/recuperar/confirmar', async (req, res) => {
  const token = String(req.body?.token ?? '')
  const password = req.body?.password
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 72 caracteres' })
  }
  const u = await usuarioActivo('id', Number(jwt.decode(token)?.id) || 0)
  let valido = false
  try {
    valido = Boolean(u && jwt.verify(token, claveRecuperar(u)))
  } catch {}
  if (!valido) return res.status(400).json({ error: 'El enlace no es válido o ya venció: pedí uno nuevo' })
  await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), u.id])
  res.json({ mensaje: 'Contraseña cambiada: ya podés iniciar sesión' })
})

// ---------------------------------------------------------------------------
// Validación de datos (nunca confiar en lo que manda el cliente)
// ---------------------------------------------------------------------------
const esNumero = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const esEnteroPositivo = (v) => Number.isInteger(v) && v > 0 && v <= 100000

function validarProducto(b) {
  const nombre = typeof b?.nombre === 'string' ? b.nombre.trim() : ''
  const codigo = typeof b?.codigo_barras === 'string' ? b.codigo_barras.trim() : ''
  if (!nombre || nombre.length > 50) return { error: 'El nombre es obligatorio (máximo 50 caracteres)' }
  if (codigo && !/^[0-9A-Za-z-]{1,50}$/.test(codigo)) return { error: 'Código de barras inválido' }
  if (!esNumero(b.precio_ingreso, 0, 99999999)) return { error: 'Precio de ingreso inválido' }
  if (!esNumero(b.porcentaje_ganancia, 0, 999)) return { error: 'Porcentaje de ganancia inválido' }
  if (!esNumero(b.iva, 0, 100)) return { error: 'IVA inválido (0 a 100)' }
  return { nombre, codigo_barras: codigo || null, precio_ingreso: b.precio_ingreso, porcentaje_ganancia: b.porcentaje_ganancia, iva: b.iva }
}

async function buscarProducto(id, sucursalId) {
  const [[p]] = await db.query('SELECT * FROM productos WHERE id = ? AND sucursal_id = ?', [id, sucursalId])
  return p
}

// Registrar Ingreso + Actualización de Stock, siempre dentro de una transacción
async function registrarIngreso(con, productoId, usuarioId, cantidad) {
  await con.query(
    "INSERT INTO movimientos_stock (producto_id, usuario_id, tipo_movimiento, cantidad) VALUES (?, ?, 'INGRESO', ?)",
    [productoId, usuarioId, cantidad]
  )
  await con.query('UPDATE productos SET stock = stock + ? WHERE id = ?', [cantidad, productoId])
}

async function enTransaccion(fn) {
  const con = await db.getConnection()
  try {
    await con.beginTransaction()
    const r = await fn(con)
    await con.commit()
    return r
  } catch (e) {
    await con.rollback()
    throw e
  } finally {
    con.release()
  }
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
app.get('/api/productos', autenticado, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM productos WHERE sucursal_id = ? ORDER BY nombre', [req.usuario.sucursal_id])
  res.json(rows)
})

app.get('/api/productos/:id', autenticado, async (req, res) => {
  const p = await buscarProducto(req.params.id, req.usuario.sucursal_id)
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' })
  res.json(p)
})

// Buscar Producto (buscarPorCodigoBarras)
app.get('/api/productos/codigo/:codigo', autenticado, async (req, res) => {
  const [[p]] = await db.query('SELECT * FROM productos WHERE codigo_barras = ? AND sucursal_id = ?', [
    req.params.codigo.trim(),
    req.usuario.sucursal_id,
  ])
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' })
  res.json(p)
})

// Registrar Nuevo (+ Generar Código de Barras + stock inicial)
app.post('/api/productos', autenticado, puedeCargar, async (req, res) => {
  const p = validarProducto(req.body)
  if (p.error) return res.status(400).json(p)
  const stockInicial = req.body.stock_inicial ?? 0
  if (stockInicial !== 0 && !esEnteroPositivo(stockInicial)) {
    return res.status(400).json({ error: 'El stock inicial debe ser un número entero mayor o igual a 0' })
  }

  const id = await enTransaccion(async (con) => {
    const [r] = await con.query(
      'INSERT INTO productos (nombre, codigo_barras, precio_ingreso, porcentaje_ganancia, iva, sucursal_id) VALUES (?, ?, ?, ?, ?, ?)',
      [p.nombre, p.codigo_barras, p.precio_ingreso, p.porcentaje_ganancia, p.iva, req.usuario.sucursal_id]
    )
    if (!p.codigo_barras) {
      await con.query('UPDATE productos SET codigo_barras = ? WHERE id = ?', [codigoInterno(r.insertId), r.insertId])
    }
    if (stockInicial > 0) await registrarIngreso(con, r.insertId, req.usuario.id, stockInicial)
    return r.insertId
  })
  res.status(201).json(await buscarProducto(id, req.usuario.sucursal_id))
})

// Modificar Información del Producto (el stock no se toca acá: solo por movimientos)
app.put('/api/productos/:id', autenticado, puedeCargar, async (req, res) => {
  const p = validarProducto(req.body)
  if (p.error) return res.status(400).json(p)
  const actual = await buscarProducto(req.params.id, req.usuario.sucursal_id)
  if (!actual) return res.status(404).json({ error: 'Producto no encontrado' })
  await db.query(
    'UPDATE productos SET nombre = ?, codigo_barras = ?, precio_ingreso = ?, porcentaje_ganancia = ?, iva = ? WHERE id = ?',
    [p.nombre, p.codigo_barras ?? actual.codigo_barras, p.precio_ingreso, p.porcentaje_ganancia, p.iva, actual.id]
  )
  res.json(await buscarProducto(actual.id, req.usuario.sucursal_id))
})

// Registrar Ingreso de mercadería sobre un producto existente
app.post('/api/productos/:id/ingreso', autenticado, puedeCargar, async (req, res) => {
  const cantidad = req.body?.cantidad
  if (!esEnteroPositivo(cantidad)) return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor a 0' })
  const actual = await buscarProducto(req.params.id, req.usuario.sucursal_id)
  if (!actual) return res.status(404).json({ error: 'Producto no encontrado' })
  await enTransaccion((con) => registrarIngreso(con, actual.id, req.usuario.id, cantidad))
  res.json(await buscarProducto(actual.id, req.usuario.sucursal_id))
})

// obtenerTrazabilidad(producto_id)
app.get('/api/productos/:id/movimientos', autenticado, async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.id, m.tipo_movimiento, m.cantidad, m.fecha_hora, u.nombre_usuario
       FROM movimientos_stock m
       JOIN productos p ON p.id = m.producto_id
       JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.producto_id = ? AND p.sucursal_id = ?
      ORDER BY m.fecha_hora DESC, m.id DESC`,
    [req.params.id, req.usuario.sucursal_id]
  )
  res.json(rows)
})

// ---------------------------------------------------------------------------
// Panel de administración
// ---------------------------------------------------------------------------
app.use('/api/admin', autenticado, tieneAcceso('/api/admin', 'usar el panel de administración'), rutasAdmin(db))

// ---------------------------------------------------------------------------
// Módulo del gerente: horarios de caja, hora límite de ventas e informes (gerente.js)
// ---------------------------------------------------------------------------
app.use('/api/gerente', autenticado, tieneAcceso('/api/gerente', 'configurar las cajas'), rutasGerente(db))
app.use('/api/reportes', autenticado, tieneAcceso('/api/reportes', 'ver los informes'), rutasReportes(db))

// ---------------------------------------------------------------------------
// Caja y ventas (Caso de Uso 2)
// ---------------------------------------------------------------------------
app.use('/api', rutasVentas({ db, enTransaccion, autenticado, tieneAcceso }))

// Caso de uso "Error": todo error termina en un mensaje entendible para el usuario
app.use((err, req, res, next) => {
  if (err.estado) return res.status(err.estado).json({ error: err.message })
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un producto con ese código de barras' })
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ error: 'Datos fuera de rango' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' })
  console.error(err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

app.listen(PORT, '0.0.0.0', () => console.log(`API Juguetería escuchando en http://localhost:${PORT}`))
