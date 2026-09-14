// API REST del Sistema de Gestión para Juguetería
// Módulo: carga de productos / Caso de Uso 3 "Registrar Ingreso de Mercadería"
import express from 'express'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { codigoInterno } from './codigo-barras.js'

const SECRET = process.env.JWT_SECRET || 'cambiar-este-secreto'
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

// ---------------------------------------------------------------------------
// Caso de Uso 1: Iniciar sesión
// ---------------------------------------------------------------------------
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  const [[u]] = await db.query(
    `SELECT u.id, u.nombre_usuario, u.password_hash, u.sucursal_id, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.email = ?`,
    [String(email ?? '')]
  )
  if (!u || !(await bcrypt.compare(String(password ?? ''), u.password_hash))) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' })
  }
  const usuario = { id: u.id, nombre_usuario: u.nombre_usuario, rol: u.rol, sucursal_id: u.sucursal_id }
  res.json({ token: jwt.sign(usuario, SECRET, { expiresIn: '8h' }), usuario })
})

function autenticado(req, res, next) {
  try {
    req.usuario = jwt.verify((req.headers.authorization ?? '').replace('Bearer ', ''), SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Sesión vencida, volvé a iniciar sesión' })
  }
}

// ponytail: permisos fijos por rol; pasar a la tabla acceso_roles cuando haya más módulos
const ROLES_CARGA = ['Administrador', 'Gerente', 'Deposito']
function puedeCargar(req, res, next) {
  if (ROLES_CARGA.includes(req.usuario.rol)) return next()
  res.status(403).json({ error: `El rol ${req.usuario.rol} no puede cargar productos` })
}

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

// Caso de uso "Error": todo error termina en un mensaje entendible para el usuario
app.use((err, req, res, next) => {
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un producto con ese código de barras' })
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return res.status(400).json({ error: 'Datos fuera de rango' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' })
  console.error(err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

const PORT = Number(process.env.PORT || 3000)
app.listen(PORT, '0.0.0.0', () => console.log(`API Juguetería escuchando en http://localhost:${PORT}`))
