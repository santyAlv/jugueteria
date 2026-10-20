// Caja (apertura y cierre) y Caso de Uso 2 "Realizar Venta": factura, detalle, pagos y egreso de stock.
import { randomBytes } from 'node:crypto'
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
  if (b.efectivo_recibido != null && !esMonto(b.efectivo_recibido)) return { error: 'Efectivo recibido inválido' }
  return {
    items: items.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })),
    medio_pago_id: b.medio_pago_id ?? null,
    voucher,
    efectivo_recibido: b.efectivo_recibido ?? null,
  }
}

// facturas.calcularTotal(): se suma en centavos para no arrastrar errores de decimales
export const totalDe = (lineas) => lineas.reduce((t, l) => t + centavos(l.precio_unitario) * l.cantidad, 0) / 100

// Diferencia máxima que se tolera entre el efectivo contado y el del sistema para poder cerrar la caja
export const DIFERENCIA_MAXIMA = 3000
export const diferenciaPermitida = (sistema, declarado) => Math.abs(centavos(declarado) - centavos(sistema)) <= centavos(DIFERENCIA_MAXIMA)

// Vuelto de un pago en efectivo: null si no se informó cuánto entregó el cliente; error si no alcanza
export function calcularVuelto(recibido, aCobrar) {
  if (recibido == null) return { vuelto: null }
  if (!esMonto(recibido)) return { error: 'Efectivo recibido inválido' }
  if (centavos(recibido) < centavos(aCobrar)) return { error: 'El efectivo recibido no alcanza para cubrir el total' }
  return { vuelto: (centavos(recibido) - centavos(aCobrar)) / 100 }
}

// Valida un retiro (achique) o una anulación: monto positivo y motivo obligatorio
export function validarMotivo(b, conMonto = true) {
  const motivo = typeof b?.motivo === 'string' ? b.motivo.trim() : ''
  if (!motivo || motivo.length > 255) return { error: 'Indicá el motivo (hasta 255 caracteres)' }
  if (!conMonto) return { motivo }
  if (!esMonto(b.monto) || b.monto <= 0) return { error: 'Monto inválido' }
  return { motivo, monto: b.monto }
}

// Forma de pago de cada medio: Efectivo y Voucher son lo que dicen; el resto (tarjeta, transferencia) es digital
const FORMA = `CASE m.nombre WHEN 'Efectivo' THEN 'efectivo' WHEN 'Voucher' THEN 'voucher' ELSE 'digital' END`

// Efectivo que tiene que haber en una caja abierta (alias "c"): lo declarado en la apertura
// + lo cobrado en efectivo (facturas no anuladas) + los vouchers cargados en efectivo − los retiros (achiques)
export const MONTO_CAJA = `(
  SELECT a.monto_declarado
         + COALESCE((SELECT SUM(p.monto)
                       FROM pagos p
                       JOIN facturas f ON f.id = p.factura_id
                       JOIN medios_pago m ON m.id = p.medio_pago_id
                      WHERE f.caja_id = a.caja_id AND m.nombre = 'Efectivo' AND f.estado = 'EMITIDA' AND f.fecha_hora >= a.fecha_hora), 0)
         + COALESCE((SELECT SUM(v.monto_precargado)
                       FROM vouchers v JOIN medios_pago m ON m.id = v.medio_pago_id
                      WHERE v.caja_id = a.caja_id AND m.nombre = 'Efectivo' AND v.fecha_hora >= a.fecha_hora), 0)
         - COALESCE((SELECT SUM(x.monto) FROM retiros_efectivo x WHERE x.caja_id = a.caja_id AND x.fecha_hora >= a.fecha_hora), 0)
    FROM caja_movimientos a
   WHERE a.caja_id = c.id AND a.tipo = 'APERTURA'
   ORDER BY a.id DESC LIMIT 1)`

// Informe de un cierre: fecha, número de caja, totales por forma de pago y el arqueo
const INFORME = `SELECT m.id, m.fecha_hora, c.numero_caja, m.total_efectivo, m.total_digital, m.total_voucher, m.total_retiros,
                        m.monto_sistema, m.monto_declarado, m.diferencia
                   FROM caja_movimientos m JOIN cajas c ON c.id = m.caja_id`

// Informe del turno de una caja (desde su última apertura): total vendido por forma de pago.
// Los vouchers que se cargan (se venden) en efectivo o digital cuentan como venta de esa forma.
async function totalesDe(con, cajaId) {
  // Desde la última apertura (se resuelve en SQL para no perder los microsegundos)
  const DESDE = "(SELECT MAX(fecha_hora) FROM caja_movimientos WHERE caja_id = ? AND tipo = 'APERTURA')"
  const [filas] = await con.query(
    `SELECT forma, SUM(monto) AS monto FROM (
       SELECT ${FORMA} AS forma, p.monto
         FROM pagos p JOIN facturas f ON f.id = p.factura_id JOIN medios_pago m ON m.id = p.medio_pago_id
        WHERE f.caja_id = ? AND f.estado = 'EMITIDA' AND f.fecha_hora >= ${DESDE}
       UNION ALL
       SELECT ${FORMA}, v.monto_precargado
         FROM vouchers v JOIN medios_pago m ON m.id = v.medio_pago_id
        WHERE v.caja_id = ? AND v.fecha_hora >= ${DESDE}) t
      GROUP BY forma`,
    [cajaId, cajaId, cajaId, cajaId]
  )
  const [[r]] = await con.query(`SELECT COALESCE(SUM(monto), 0) AS retiros FROM retiros_efectivo WHERE caja_id = ? AND fecha_hora >= ${DESDE}`, [cajaId, cajaId])
  const de = (forma) => Number(filas.find((f) => f.forma === forma)?.monto ?? 0)
  return { efectivo: de('efectivo'), digital: de('digital'), voucher: de('voucher'), retiros: Number(r.retiros) }
}

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

  // Con los retiros (achiques) del turno en curso
  r.get('/caja', vende, async (req, res) => {
    const caja = await cajaDe(req.usuario)
    if (caja?.estado === 'ABIERTA') {
      ;[caja.retiros] = await db.query(
        `SELECT id, fecha_hora, monto, motivo FROM retiros_efectivo
          WHERE caja_id = ? AND fecha_hora >= (SELECT MAX(fecha_hora) FROM caja_movimientos WHERE caja_id = ? AND tipo = 'APERTURA')
          ORDER BY id DESC`,
        [caja.id, caja.id]
      )
    }
    res.json(caja)
  })

  // ACHIQUE: retiro de efectivo que no es una venta. Queda con fecha, monto y motivo, y baja el efectivo de la caja.
  r.post('/caja/retiros', vende, async (req, res) => {
    const d = validarMotivo(req.body)
    if (d.error) return res.status(400).json(d)
    const u = req.usuario
    await enTransaccion(async (con) => {
      const [[c]] = await con.query(`SELECT ${MONTO_CAJA} AS monto FROM cajas c WHERE c.id = ? AND c.estado = 'ABIERTA' FOR UPDATE`, [u.caja_id])
      if (!c) throw fallo(409, 'Tu caja no está abierta')
      if (centavos(d.monto) > centavos(c.monto)) throw fallo(409, `No podés retirar más de lo que hay en la caja (${c.monto})`)
      await con.query('INSERT INTO retiros_efectivo (caja_id, usuario_id, monto, motivo) VALUES (?, ?, ?, ?)', [u.caja_id, u.id, d.monto, d.motivo])
    })
    res.status(201).json(await cajaDe(u))
  })

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
      // Se permite una diferencia máxima: si el efectivo contado se aleja más, hay que volver a contar
      if (!diferenciaPermitida(c.monto, monto)) {
        throw fallo(409, `La diferencia con el sistema supera los $${DIFERENCIA_MAXIMA}: volvé a contar el efectivo o avisá al administrador`)
      }
      const t = await totalesDe(con, u.caja_id)
      const [x] = await con.query(
        `INSERT INTO caja_movimientos (caja_id, usuario_id, tipo, monto_sistema, monto_declarado, total_efectivo, total_digital, total_voucher, total_retiros)
         VALUES (?, ?, 'CIERRE', ?, ?, ?, ?, ?, ?)`,
        [u.caja_id, u.id, c.monto, monto, t.efectivo, t.digital, t.voucher, t.retiros]
      )
      await con.query("UPDATE cajas SET estado = 'CERRADA', usuario_id = NULL WHERE id = ?", [u.caja_id])
      const [[m]] = await con.query(`${INFORME} WHERE m.id = ?`, [x.insertId])
      return m
    })
    res.json(cierre)
  })

  // Informes de cierre: con "Reporte de ventas" los de todas las cajas; si no, los de la caja propia
  r.get('/caja/informes', autenticado, async (req, res) => {
    const u = req.usuario
    const todas = u.accesos.includes('/api/reportes')
    if (!todas && !u.accesos.includes('/api/ventas')) return res.status(403).json({ error: `El rol ${u.rol} no puede ver los informes de caja` })
    const [rows] = await db.query(`${INFORME} WHERE m.tipo = 'CIERRE' AND (? OR m.caja_id = ?) ORDER BY m.id DESC LIMIT 50`, [todas, u.caja_id])
    res.json(rows)
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

  // Crear un voucher / tarjeta de regalo: monto precargado, pagado en efectivo o digital (el efectivo entra a la caja)
  r.post('/vouchers', vende, async (req, res) => {
    const { monto, medio_pago_id } = req.body ?? {}
    if (!esMonto(monto) || monto <= 0) return res.status(400).json({ error: 'Monto inválido' })
    if (!esId(medio_pago_id)) return res.status(400).json({ error: 'Elegí cómo se paga el voucher: efectivo o digital' })
    const u = req.usuario
    const voucher = await enTransaccion(async (con) => {
      const [[caja]] = await con.query("SELECT id FROM cajas WHERE id = ? AND estado = 'ABIERTA' FOR UPDATE", [u.caja_id])
      if (!caja) throw fallo(409, 'Tu caja está cerrada: abrila para vender vouchers')
      const [[medio]] = await con.query("SELECT id FROM medios_pago WHERE id = ? AND nombre <> 'Voucher'", [medio_pago_id])
      if (!medio) throw fallo(400, 'Un voucher se paga en efectivo o digital, no con otro voucher')
      // Número de referencia legible y único; el id lo asigna la base
      const numero = `GC-${randomBytes(4).toString('hex').toUpperCase()}`
      const [x] = await con.query(
        'INSERT INTO vouchers (numero_referencia, monto_precargado, medio_pago_id, caja_id, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW(6))',
        [numero, monto, medio.id, caja.id, u.id]
      )
      return { id: x.insertId, numero_referencia: numero, monto_precargado: monto }
    })
    res.status(201).json(voucher)
  })

  // Anular una venta: no se borra, se genera una nota de crédito con el motivo. Devuelve el stock y deja de contar en la caja.
  // Solo ventas del turno actual de la caja propia (después del cierre ya no hay efectivo que devolver).
  r.post('/ventas/:id/anular', vende, async (req, res) => {
    const d = validarMotivo(req.body, false)
    if (d.error) return res.status(400).json(d)
    const u = req.usuario
    const nota = await enTransaccion(async (con) => {
      const [[caja]] = await con.query("SELECT id FROM cajas WHERE id = ? AND estado = 'ABIERTA' FOR UPDATE", [u.caja_id])
      if (!caja) throw fallo(409, 'Tu caja está cerrada: abrila para anular una venta')
      const [[f]] = await con.query(
        `SELECT id, total, estado, fecha_hora >= (SELECT MAX(fecha_hora) FROM caja_movimientos WHERE caja_id = ? AND tipo = 'APERTURA') AS del_turno
           FROM facturas WHERE id = ? AND caja_id = ? FOR UPDATE`,
        [caja.id, req.params.id, caja.id]
      )
      if (!f) throw fallo(404, 'Venta no encontrada en tu caja')
      if (f.estado === 'ANULADA') throw fallo(409, 'La venta ya está anulada')
      if (!f.del_turno) throw fallo(409, 'Solo se pueden anular ventas del turno actual')
      await con.query("UPDATE facturas SET estado = 'ANULADA' WHERE id = ?", [f.id])
      const [lineas] = await con.query('SELECT producto_id, cantidad FROM detalle_factura WHERE factura_id = ?', [f.id])
      for (const l of lineas) {
        await con.query('UPDATE productos SET stock = stock + ? WHERE id = ?', [l.cantidad, l.producto_id])
        await con.query("INSERT INTO movimientos_stock (producto_id, usuario_id, tipo_movimiento, cantidad) VALUES (?, ?, 'INGRESO', ?)", [l.producto_id, u.id, l.cantidad])
      }
      const [x] = await con.query('INSERT INTO notas_credito (factura_id, usuario_id, monto, motivo) VALUES (?, ?, ?, ?)', [f.id, u.id, f.total, d.motivo])
      return { id: x.insertId, factura_id: f.id, monto: f.total, motivo: d.motivo }
    })
    res.status(201).json(nota)
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
      let vuelto = null
      if (resto > 0) {
        const [[medio]] = await con.query("SELECT id, nombre FROM medios_pago WHERE id = ? AND nombre <> 'Voucher'", [v.medio_pago_id])
        if (!medio) throw fallo(400, 'Elegí el medio de pago: efectivo, tarjeta o transferencia')
        // Solo el efectivo da vuelto; los pagos digitales son por el monto exacto y no tocan el efectivo de la caja
        if (medio.nombre === 'Efectivo') {
          const c = calcularVuelto(v.efectivo_recibido, resto)
          if (c.error) throw fallo(400, c.error)
          vuelto = c.vuelto
        } else if (v.efectivo_recibido != null) {
          throw fallo(400, 'Los pagos digitales no generan vuelto')
        }
        await con.query('INSERT INTO pagos (factura_id, medio_pago_id, monto) VALUES (?, ?, ?)', [f.insertId, medio.id, resto])
      }
      return { id: f.insertId, total, vuelto }
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
              (SELECT n.motivo FROM notas_credito n WHERE n.factura_id = f.id) AS motivo_anulacion,
              (f.estado = 'EMITIDA' AND c.estado = 'ABIERTA'
                AND f.fecha_hora >= (SELECT MAX(a.fecha_hora) FROM caja_movimientos a WHERE a.caja_id = f.caja_id AND a.tipo = 'APERTURA')) AS anulable,
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
