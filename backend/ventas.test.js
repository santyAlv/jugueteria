import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarVenta, totalDe, calcularVuelto, diferenciaPermitida, validarMotivo } from './ventas.js'

test('total de la factura: suma exacta aunque los precios tengan centavos', () => {
  assert.equal(totalDe([{ precio_unitario: 6352.5, cantidad: 3 }, { precio_unitario: 9752.6, cantidad: 1 }]), 28810.1)
  assert.equal(totalDe([{ precio_unitario: 0.1, cantidad: 3 }]), 0.3) // 0.1 * 3 en JavaScript da 0.30000000000000004
})

test('venta: necesita al menos un producto y cantidades enteras positivas', () => {
  const item = { producto_id: 1, cantidad: 2 }
  assert.deepEqual(validarVenta({ items: [item], medio_pago_id: 1 }), { items: [item], medio_pago_id: 1, voucher: '', efectivo_recibido: null })
  assert.equal(validarVenta({ items: [item], voucher: ' REGALO-5000 ' }).voucher, 'REGALO-5000')
  assert.ok(validarVenta({ items: [] }).error)
  assert.ok(validarVenta({}).error)
  assert.ok(validarVenta({ items: [{ producto_id: 1, cantidad: 0 }] }).error)
  assert.ok(validarVenta({ items: [{ producto_id: 1, cantidad: 1.5 }] }).error)
  assert.ok(validarVenta({ items: [{ producto_id: '1', cantidad: 1 }] }).error)
  assert.ok(validarVenta({ items: [item], medio_pago_id: 'efectivo' }).error)
})

test('vuelto: efectivo recibido menos lo que se cobra; no puede ser menor', () => {
  assert.deepEqual(calcularVuelto(10000, 6352.5), { vuelto: 3647.5 })
  assert.deepEqual(calcularVuelto(500, 500), { vuelto: 0 })
  assert.deepEqual(calcularVuelto(undefined, 500), { vuelto: null })
  assert.ok(calcularVuelto(400, 500).error)
  assert.ok(calcularVuelto('mucho', 500).error)
})

test('venta: el efectivo recibido tiene que ser un monto válido', () => {
  assert.ok(validarVenta({ items: [{ producto_id: 1, cantidad: 1 }], efectivo_recibido: -5 }).error)
})

test('cierre: se tolera una diferencia de hasta $3000, en más o en menos', () => {
  assert.ok(diferenciaPermitida(10000, 10000))
  assert.ok(diferenciaPermitida(10000, 13000))
  assert.ok(diferenciaPermitida(10000, 7000))
  assert.ok(!diferenciaPermitida(10000, 13000.01))
  assert.ok(!diferenciaPermitida(10000, 6999.99))
})

test('achique y anulación: el motivo es obligatorio; el achique además necesita un monto positivo', () => {
  assert.deepEqual(validarMotivo({ monto: 500, motivo: ' Pago a proveedor ' }), { motivo: 'Pago a proveedor', monto: 500 })
  assert.ok(validarMotivo({ monto: 500, motivo: '  ' }).error)
  assert.ok(validarMotivo({ monto: 0, motivo: 'x' }).error)
  assert.ok(validarMotivo({ monto: -1, motivo: 'x' }).error)
  assert.deepEqual(validarMotivo({ motivo: 'Cliente se arrepintió' }, false), { motivo: 'Cliente se arrepintió' })
  assert.ok(validarMotivo({}, false).error)
})
