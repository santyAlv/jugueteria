// Módulo del gerente: horarios de las cajas, hora límite de ventas e informes.
// rutasGerente se monta en /api/gerente y rutasReportes en /api/reportes; los permisos los controla server.js.
import { Router } from 'express'

// ---------------------------------------------------------------------------
// Validación de datos (nunca confiar en lo que manda el cliente)
// ---------------------------------------------------------------------------
const esHora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
const centavos = (v) => Math.round(v * 100)
const fallo = (estado, mensaje) => Object.assign(new Error(mensaje), { estado })

// Apertura < cierre; la hora límite es opcional y tiene que caer dentro del horario de la caja
export function validarHorario(b) {
  const { hora_apertura, hora_cierre } = b ?? {}
  const limite = b?.hora_limite_ventas || null
  if (!esHora(hora_apertura) || !esHora(hora_cierre)) return { error: 'Horario inválido (formato HH:MM)' }
  if (hora_apertura >= hora_cierre) return { error: 'La hora de apertura debe ser anterior a la de cierre' }
  if (limite && !esHora(limite)) return { error: 'Hora límite de ventas inválida (formato HH:MM)' }
  if (limite && (limite <= hora_apertura || limite > hora_cierre)) {
    return { error: 'La hora límite de ventas debe estar entre la apertura y el cierre de la caja' }
  }
  return { hora_apertura, hora_cierre, hora_limite_ventas: limite }
}

// Fecha real en formato AAAA-MM-DD (rechaza 2026-02-31)
export function esFecha(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

// Rango de un informe: si falta alguna fecha se toman los últimos 30 días (se resuelve en SQL)
export function validarRango(q) {
  const desde = q?.desde || null
  const hasta = q?.hasta || null
  if ((desde && !esFecha(desde)) || (hasta && !esFecha(hasta))) return { error: 'Fecha inválida (formato AAAA-MM-DD)' }
  if (desde && hasta && desde > hasta) return { error: 'La fecha "desde" no puede ser posterior a "hasta"' }
  return { desde, hasta }
}

// Los totales se suman en centavos para no arrastrar errores de decimales
export const sumar = (filas, campo) => filas.reduce((t, f) => t + centavos(f[campo]), 0) / 100

// Filtro de fechas sobre f.fecha_hora (alias de facturas)
const RANGO = `f.fecha_hora >= COALESCE(?, CURDATE() - INTERVAL 29 DAY) AND f.fecha_hora < DATE_ADD(COALESCE(?, CURDATE()), INTERVAL 1 DAY)`

// ---------------------------------------------------------------------------
// Horarios de las cajas · /api/gerente
// ---------------------------------------------------------------------------
export function rutasGerente(db) {
  const r = Router()

  r.get('/cajas', async (req, res) => {
    const [rows] = await db.query(
      `SELECT id, numero_caja, estado,
              TIME_FORMAT(hora_apertura, '%H:%i') AS hora_apertura, TIME_FORMAT(hora_cierre, '%H:%i') AS hora_cierre,
              TIME_FORMAT(hora_limite_ventas, '%H:%i') AS hora_limite_ventas
         FROM cajas WHERE sucursal_id = ? ORDER BY numero_caja`,
      [req.usuario.sucursal_id]
    )
    res.json(rows)
  })

  // Configurar hora de apertura y cierre de la caja + hora límite de ventas
  r.put('/cajas/:id', async (req, res) => {
    const h = validarHorario(req.body)
    if (h.error) return res.status(400).json(h)
    const [x] = await db.query(
      'UPDATE cajas SET hora_apertura = ?, hora_cierre = ?, hora_limite_ventas = ? WHERE id = ? AND sucursal_id = ?',
      [h.hora_apertura, h.hora_cierre, h.hora_limite_ventas, req.params.id, req.usuario.sucursal_id]
    )
    if (!x.affectedRows) throw fallo(404, 'Caja no encontrada')
    res.json({ ok: true })
  })

  return r
}

// ---------------------------------------------------------------------------
// Informes · /api/reportes. Siempre de la sucursal del usuario y solo con facturas EMITIDA
// salvo que se diga otra cosa (las anuladas tienen nota de crédito y no suman).
// ---------------------------------------------------------------------------
export function rutasReportes(db) {
  const r = Router()

  // Valida el rango o la fecha antes de ejecutar el informe
  const conRango = (fn) => async (req, res) => {
    const q = validarRango(req.query)
    if (q.error) return res.status(400).json(q)
    res.json(await fn(req.usuario.sucursal_id, q))
  }
  const conDia = (fn) => async (req, res) => {
    const fecha = req.query.fecha || null
    if (fecha && !esFecha(fecha)) return res.status(400).json({ error: 'Fecha inválida (formato AAAA-MM-DD)' })
    res.json(await fn(req.usuario.sucursal_id, fecha))
  }

  // 1. Histórico de ventas de caja: por día y por caja
  r.get('/ventas-caja', conRango(async (sucursal, { desde, hasta }) => {
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(f.fecha_hora, '%Y-%m-%d') AS fecha, c.numero_caja,
              SUM(f.estado = 'EMITIDA') AS ventas,
              COALESCE(SUM(IF(f.estado = 'EMITIDA', f.total, 0)), 0) AS total,
              SUM(f.estado = 'ANULADA') AS anuladas
         FROM facturas f JOIN cajas c ON c.id = f.caja_id
        WHERE c.sucursal_id = ? AND ${RANGO}
        GROUP BY fecha, c.id, c.numero_caja
        ORDER BY fecha DESC, c.numero_caja`,
      [sucursal, desde, hasta]
    )
    return { filas: rows, ventas: rows.reduce((n, f) => n + Number(f.ventas), 0), total: sumar(rows, 'total') }
  }))

  // 2. Histórico de venta de productos: unidades e importe por producto
  r.get('/ventas-producto', conRango(async (sucursal, { desde, hasta }) => {
    const [rows] = await db.query(
      `SELECT p.id, p.nombre, p.codigo_barras, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS importe
         FROM detalle_factura d
         JOIN facturas f ON f.id = d.factura_id
         JOIN cajas c ON c.id = f.caja_id
         JOIN productos p ON p.id = d.producto_id
        WHERE c.sucursal_id = ? AND f.estado = 'EMITIDA' AND ${RANGO}
        GROUP BY p.id, p.nombre, p.codigo_barras
        ORDER BY unidades DESC, p.nombre`,
      [sucursal, desde, hasta]
    )
    return { filas: rows, unidades: rows.reduce((n, f) => n + Number(f.unidades), 0), importe: sumar(rows, 'importe') }
  }))

  // 3. Recaudación de un día en particular (sin fecha, hoy): lo cobrado por medio de pago
  r.get('/recaudacion', conDia(async (sucursal, fecha) => {
    const dia = 'DATE(f.fecha_hora) = COALESCE(?, CURDATE())'
    const [medios] = await db.query(
      `SELECT m.nombre AS medio, SUM(pg.monto) AS monto
         FROM pagos pg
         JOIN facturas f ON f.id = pg.factura_id
         JOIN cajas c ON c.id = f.caja_id
         JOIN medios_pago m ON m.id = pg.medio_pago_id
        WHERE c.sucursal_id = ? AND f.estado = 'EMITIDA' AND ${dia}
        GROUP BY m.id, m.nombre ORDER BY monto DESC`,
      [sucursal, fecha]
    )
    const [[v]] = await db.query(
      `SELECT COUNT(*) AS ventas, COALESCE(SUM(f.total), 0) AS total FROM facturas f JOIN cajas c ON c.id = f.caja_id
        WHERE c.sucursal_id = ? AND f.estado = 'EMITIDA' AND ${dia}`,
      [sucursal, fecha]
    )
    const [[a]] = await db.query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(f.total), 0) AS monto FROM facturas f JOIN cajas c ON c.id = f.caja_id
        WHERE c.sucursal_id = ? AND f.estado = 'ANULADA' AND ${dia}`,
      [sucursal, fecha]
    )
    const [[vo]] = await db.query(
      `SELECT COALESCE(SUM(v.monto_precargado), 0) AS monto FROM vouchers v JOIN cajas c ON c.id = v.caja_id
        WHERE c.sucursal_id = ? AND DATE(v.fecha_hora) = COALESCE(?, CURDATE())`,
      [sucursal, fecha]
    )
    const [[re]] = await db.query(
      `SELECT COALESCE(SUM(x.monto), 0) AS monto FROM retiros_efectivo x JOIN cajas c ON c.id = x.caja_id
        WHERE c.sucursal_id = ? AND DATE(x.fecha_hora) = COALESCE(?, CURDATE())`,
      [sucursal, fecha]
    )
    const [[hoy]] = await db.query('SELECT DATE_FORMAT(COALESCE(?, CURDATE()), "%Y-%m-%d") AS fecha', [fecha])
    return { fecha: hoy.fecha, ventas: v.ventas, total: v.total, medios, anuladas: a, vouchers_vendidos: vo.monto, retiros: re.monto }
  }))

  // 4. Ganancia del día (sin fecha, hoy): precio de venta sin IVA menos el precio de ingreso, por unidad vendida.
  // ponytail: usa el precio de ingreso y el IVA actuales del producto, no guarda el costo de cada venta.
  r.get('/ganancia', conDia(async (sucursal, fecha) => {
    const [rows] = await db.query(
      `SELECT p.id, p.nombre, SUM(d.cantidad) AS unidades,
              ROUND(SUM(d.subtotal / (1 + p.iva / 100)), 2) AS venta_neta,
              ROUND(SUM(d.cantidad * p.precio_ingreso), 2) AS costo
         FROM detalle_factura d
         JOIN facturas f ON f.id = d.factura_id
         JOIN cajas c ON c.id = f.caja_id
         JOIN productos p ON p.id = d.producto_id
        WHERE c.sucursal_id = ? AND f.estado = 'EMITIDA' AND DATE(f.fecha_hora) = COALESCE(?, CURDATE())
        GROUP BY p.id, p.nombre ORDER BY p.nombre`,
      [sucursal, fecha]
    )
    const filas = rows.map((f) => ({ ...f, ganancia: (centavos(f.venta_neta) - centavos(f.costo)) / 100 }))
    const [[hoy]] = await db.query('SELECT DATE_FORMAT(COALESCE(?, CURDATE()), "%Y-%m-%d") AS fecha', [fecha])
    return { fecha: hoy.fecha, filas, venta_neta: sumar(filas, 'venta_neta'), costo: sumar(filas, 'costo'), ganancia: sumar(filas, 'ganancia') }
  }))

  // Informe extra: ventas por cajero en un período
  r.get('/ventas-cajero', conRango(async (sucursal, { desde, hasta }) => {
    const [rows] = await db.query(
      `SELECT u.nombre_usuario, COUNT(*) AS ventas, SUM(f.total) AS total
         FROM facturas f JOIN cajas c ON c.id = f.caja_id JOIN usuarios u ON u.id = f.usuario_id
        WHERE c.sucursal_id = ? AND f.estado = 'EMITIDA' AND ${RANGO}
        GROUP BY u.id, u.nombre_usuario ORDER BY total DESC`,
      [sucursal, desde, hasta]
    )
    return { filas: rows, ventas: rows.reduce((n, f) => n + Number(f.ventas), 0), total: sumar(rows, 'total') }
  }))

  return r
}
