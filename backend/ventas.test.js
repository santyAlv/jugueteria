import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarVenta, totalDe } from './ventas.js'

test('total de la factura: suma exacta aunque los precios tengan centavos', () => {
  assert.equal(totalDe([{ precio_unitario: 6352.5, cantidad: 3 }, { precio_unitario: 9752.6, cantidad: 1 }]), 28810.1)
  assert.equal(totalDe([{ precio_unitario: 0.1, cantidad: 3 }]), 0.3) // 0.1 * 3 en JavaScript da 0.30000000000000004
})

test('venta: necesita al menos un producto y cantidades enteras positivas', () => {
  const item = { producto_id: 1, cantidad: 2 }
  assert.deepEqual(validarVenta({ items: [item], medio_pago_id: 1 }), { items: [item], medio_pago_id: 1, voucher: '' })
  assert.equal(validarVenta({ items: [item], voucher: ' REGALO-5000 ' }).voucher, 'REGALO-5000')
  assert.ok(validarVenta({ items: [] }).error)
  assert.ok(validarVenta({}).error)
  assert.ok(validarVenta({ items: [{ producto_id: 1, cantidad: 0 }] }).error)
  assert.ok(validarVenta({ items: [{ producto_id: 1, cantidad: 1.5 }] }).error)
  assert.ok(validarVenta({ items: [{ producto_id: '1', cantidad: 1 }] }).error)
  assert.ok(validarVenta({ items: [item], medio_pago_id: 'efectivo' }).error)
})
