import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digitoVerificador, codigoInterno } from './codigo-barras.js'

test('dígito verificador EAN-13 de códigos reales', () => {
  assert.equal(digitoVerificador('400638133393'), '1') // 4006381333931
  assert.equal(digitoVerificador('779123456789'), '8') // 7791234567898
  assert.equal(digitoVerificador('590123412345'), '7') // 5901234123457
})

test('código interno: 13 dígitos, prefijo 20 e id al final', () => {
  const c = codigoInterno(42)
  assert.equal(c.length, 13)
  assert.match(c, /^200000000042\d$/)
  assert.equal(c, '2000000000428')
})
