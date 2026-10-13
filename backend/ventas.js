// Caja (apertura y cierre) y Caso de Uso 2 "Realizar Venta": factura, detalle, pagos y egreso de stock.
import { Router } from 'express'

// ---------------------------------------------------------------------------
// Validación y cálculos (nunca confiar en lo que manda el cliente)
// ---------------------------------------------------------------------------
const esId = (v) => Number.isInteger(v) && v > 0
const esMonto = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 99999999
const centavos = (v) => Math.round(v * 100)
// Error de negocio con su código HTTP: lo convierte en respuesta el manejador de server.js
const fallo = (estado, mensaje) => Object.assign(new Error(mensaje), { estado })

export function validarVenta(b) {
  const items = b?.items
  const voucher = typeof b?.voucher === 'string' ? b.voucher.trim() : ''
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return { error: 'La factura tiene que tener al menos un producto' }
  if (!items.every((i) => esId(i?.producto_id) && esId(i?.cantidad) && i.cantidad <= 100000)) return { error: 'Producto o cantidad inválidos' }
  if (b.medio_pago_id != null && !esId(b.medio_pago_id)) return { error: 'Medio de pago inválido' }
  if (voucher.length > 50) return { error: 'Voucher inválido' }
  return {
    items: items.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })),
    medio_pago_id: b.medio_pago_id ?? null,
    voucher,
  }
}

// facturas.calcularTotal(): se suma en centavos para no arrastrar errores de decimales
export const totalDe = (lineas) => lineas.reduce((t, l) => t + centavos(l.precio_unitario) * l.cantidad, 0) / 100

// Efectivo que tiene que haber en una caja abierta (alias "c"):
// lo declarado en la apertura + lo cobrado en efectivo desde entonces
export const MONTO_CAJA = `(
  SELECT a.monto_declarado + COALESCE((
           SELECT SUM(p.monto)
             FROM pagos p
             JOIN facturas f ON f.id = p.factura_id
             JOIN medios_pago m ON m.id = p.medio_pago_id
            WHERE f.caja_id = a.caja_id AND m.nombre = 'Efectivo' AND f.fecha_hora >= a.fecha_hora), 0)
    FROM caja_movimientos a
   WHERE a.caja_id = c.id AND a.tipo = 'APERTURA'
   ORDER BY a.id DESC LIMIT 1)`

// ---------------------------------------------------------------------------
// Rutas (se montan en /api)
// ---------------------------------------------------------------------------
export function rutasVentas({ db, enTransaccion, autenticado, tieneAcceso }) {
  const r = Router()
  const vende = [autenticado, tieneAcceso('/api/ventas', 'facturar ni operar una caja')]

  // --- Caja del usuario: cajas.getEstado() ---
  async function cajaDe(usuario, con = db) {
    const [[c]] = await con.query(
      `SELECT c.id, c.numero_caja, c.sucursal_id, c.estado,
              TIME_FORMAT(c.hora_apertura, '%H:%i') AS hora_apertura, TIME_FORMAT(c.hora_cierre, '%H:%i') AS hora_cierre,
              IF(c.estado = 'ABIERTA', ${MONTO_CAJA}, NULL) AS monto
         FROM cajas c WHERE c.id = ?`,
      [usuario.caja_id]
    )
    return c ?? null
  }

  r.get('/caja', vende, async (req, res) => res.json(await cajaDe(req.usuario)))

  // cajas.abrirCaja(usuario_id) + caja_movimientos.registrarApertura(monto_declarado)
  r.post('/caja/apertura', vende, async (req, res) => {
    const monto = req.body?.monto_declarado
    if (!esMonto(monto)) return res.status(400).json({ error: 'Ingresá el efectivo con el que abre la caja' })
    const u = req.usuario
    await enTransaccion(async (con) => {
      // Solo se abre una caja cerrada y dentro del horario que configuró el administrador
      const [x] = await con.query(
        `UPDATE cajas SET estado = 'ABIERTA', usuario_id = ?
          WHERE id = ? AND estado = 'CERRADA' AND CURTIME() BETWEEN hora_apertura AND hora_cierre`,
        [u.id, u.caja_id]
      )
      if (!x.affectedRows) {
        const c = await cajaDe(u, con)
        if (!c) throw fallo(409, 'No tenés una caja asignada')
        if (c.estado === 'ABIERTA') throw fallo(409, `La caja ${c.numero_caja} ya está abierta`)
        throw fallo(409, `La caja ${c.numero_caja} solo se puede abrir entre las ${c.hora_apertura} y las ${c.hora_cierre}`)
      }
      // En la apertura no hay nada contra qué comparar: el sistema toma lo declarado
      await con.query(
        "INSERT INTO caja_movimientos (caja_id, usuario_id, tipo, monto_sistema, monto_declarado) VALUES (?, ?, 'APERTURA', ?, ?)",
        [u.caja_id, u.id, monto, monto]
      )
    })
    res.json(await cajaDe(u))
  })

  // cajas.cerrarCaja() + caja_movimientos.registrarCierre(monto_declarado): el arqueo
  r.post('/caja/cierre', vende, async (req, res) => {
    const monto = req.body?.monto_declarado
    if (!esMonto(monto)) return res.status(400).json({ error: 'Ingresá el efectivo contado en la caja' })
    const u = req.usuario
    const cierre = await enTransaccion(async (con) => {
      const [[c]] = await con.query(`SELECT ${MONTO_CAJA} AS monto FROM cajas c WHERE c.id = ? AND c.estado = 'ABIERTA' FOR UPDATE`, [u.caja_id])
      if (!c) throw fallo(409, 'Tu caja no está abierta')
      const [x] = await con.query(
        "INSERT INTO caja_movimientos (caja_id, usuario_id, tipo, monto_sistema, monto_declarado) VALUES (?, ?, 'CIERRE', ?, ?)",
        [u.caja_id, u.id, c.monto, monto]
      )
      await con.query("UPDATE cajas SET estado = 'CERRADA', usuario_id = NULL WHERE id = ?", [u.caja_id])
      const [[m]] = await con.query('SELECT monto_sistema, monto_declarado, diferencia FROM caja_movimientos WHERE id = ?', [x.insertId])
      return m
    })
    res.json(cierre)
  })

  // --- Medios de pago y vouchers ---
  r.get('/medios-pago', vende, async (req, res) => {
    const [rows] = await db.query('SELECT id, nombre FROM medios_pago ORDER BY id')
    res.json(rows)
  })

  // vouchers.validarVoucher()
  r.get('/vouchers/:numero', vende, async (req, res) => {
    const [[v]] = await db.query("SELECT numero_referencia, monto_precargado FROM vouchers WHERE numero_referencia = ? AND estado = 'DISPONIBLE'", [
      req.params.numero.trim(),
    ])
    if (!v) return res.status(404).json({ error: 'Voucher inexistente o ya utilizado' })
    res.json(v)
  })

  // --- Caso de Uso 2: Realizar Venta. Todo o nada, dentro de una transacción ---
  r.post('/ventas', vende, async (req, res) => {
    const v = validarVenta(req.body)
    if (v.error) return res.status(400).json(v)
    const u = req.usuario
    const factura = await enTransaccion(async (con) => {
      const [[caja]] = await con.query("SELECT id FROM cajas WHERE id = ? AND estado = 'ABIERTA' FOR UPDATE", [u.caja_id])
      if (!caja) throw fallo(409, u.caja_id ? 'Tu caja está cerrada: abrila para poder facturar' : 'No tenés una caja asignada')

      // Buscar Producto + Agregar Producto + Calcular Stock (movimientos_stock.registrarEgreso)
      const lineas = []
      for (const { producto_id, cantidad } of v.items) {
        const [[p]] = await con.query('SELECT id, nombre, precio FROM productos WHERE id = ? AND sucursal_id = ?', [producto_id, u.sucursal_id])
        if (!p) throw fallo(404, 'Producto no encontrado')
        const [x] = await con.query('UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?', [cantidad, p.id, cantidad])
        if (!x.affectedRows) throw fallo(409, `No hay stock suficiente de ${p.nombre}`)
        await con.query("INSERT INTO movimientos_stock (producto_id, usuario_id, tipo_movimiento, cantidad) VALUES (?, ?, 'EGRESO', ?)", [p.id, u.id, cantidad])
        lineas.push({ producto_id: p.id, cantidad, precio_unitario: p.precio })
      }

      // Calcular Total + Registrar Venta (facturas.generarFactura, detalle_factura.agregarProducto)
      const total = totalDe(lineas)
      const [f] = await con.query('INSERT INTO facturas (usuario_id, caja_id, total) VALUES (?, ?, ?)', [u.id, caja.id, total])
      await con.query('INSERT INTO detalle_factura (factura_id, producto_id, cantidad, precio_unitario) VALUES ?', [
        lineas.map((l) => [f.insertId, l.producto_id, l.cantidad, l.precio_unitario]),
      ])

      // Aplicar Voucher: paga hasta su monto y queda usado; el resto se cobra con el medio elegido
      let resto = total
      if (v.voucher) {
        const [[vou]] = await con.query("SELECT id, monto_precargado FROM vouchers WHERE numero_referencia = ? AND estado = 'DISPONIBLE' FOR UPDATE", [v.voucher])
        if (!vou) throw fallo(409, 'Voucher inexistente o ya utilizado')
        const aplicado = Math.min(vou.monto_precargado, total)
        await con.query(
          "INSERT INTO pagos (factura_id, medio_pago_id, monto, voucher_id) SELECT ?, id, ?, ? FROM medios_pago WHERE nombre = 'Voucher'",
          [f.insertId, aplicado, vou.id]
        )
        await con.query("UPDATE vouchers SET estado = 'USADO' WHERE id = ?", [vou.id])
        resto = (centavos(total) - centavos(aplicado)) / 100
      }
      if (resto > 0) {
        const [x] = await con.query(
          "INSERT INTO pagos (factura_id, medio_pago_id, monto) SELECT ?, id, ? FROM medios_pago WHERE id = ? AND nombre <> 'Voucher'",
          [f.insertId, resto, v.medio_pago_id]
        )
        if (!x.affectedRows) throw fallo(400, 'Elegí el medio de pago: efectivo o tarjeta')
      }
      return { id: f.insertId, total }
    })
    res.status(201).json(factura)
  })

  // Ventas con su detalle y sus pagos. Con "Reporte de ventas" se ven todas; si no, las de la caja propia.
  // ponytail: devuelve todo sin paginar; agregar LIMIT/fechas cuando las facturas sean miles
  r.get('/ventas', autenticado, async (req, res) => {
    const u = req.usuario
    const todas = u.accesos.includes('/api/reportes')
    if (!todas && !u.accesos.includes('/api/ventas')) return res.status(403).json({ error: `El rol ${u.rol} no puede ver las ventas` })
    const [rows] = await db.query(
      `SELECT f.id, f.fecha_hora, f.total, f.estado, f.caja_id, c.numero_caja, c.sucursal_id, us.nombre_usuario,
              (SELECT JSON_ARRAYAGG(JSON_OBJECT('producto', p.nombre, 'codigo_barras', p.codigo_barras, 'cantidad', d.cantidad,
                                                'precio_unitario', d.precio_unitario, 'subtotal', d.subtotal))
                 FROM detalle_factura d JOIN productos p ON p.id = d.producto_id WHERE d.factura_id = f.id) AS detalle,
              (SELECT JSON_ARRAYAGG(JSON_OBJECT('medio', m.nombre, 'monto', pg.monto))
                 FROM pagos pg JOIN medios_pago m ON m.id = pg.medio_pago_id WHERE pg.factura_id = f.id) AS pagos
         FROM facturas f
         JOIN cajas c ON c.id = f.caja_id
         JOIN usuarios us ON us.id = f.usuario_id
        WHERE ? OR f.caja_id = ?
        ORDER BY f.id DESC`,
      [todas, u.caja_id]
    )
    res.json(rows)
  })

  return r
}
