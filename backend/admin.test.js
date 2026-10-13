import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarUsuario, validarCaja, validarSucursal } from './admin.js'

const usuario = { nombre_usuario: 'ana', email: 'ana@jugueteria.com', password: 'secreta1', rol_id: 3, sucursal_id: 1 }
const caja = { numero_caja: '2', sucursal_id: 1, hora_apertura: '09:00', hora_cierre: '18:00' }

test('usuario: la contraseña es obligatoria al crear y opcional al modificar', () => {
  assert.equal(validarUsuario(usuario, true).error, undefined)
  assert.ok(validarUsuario({ ...usuario, password: '' }, true).error)
  assert.equal(validarUsuario({ ...usuario, password: '' }, false).error, undefined)
  assert.ok(validarUsuario({ ...usuario, password: '123' }, false).error)
})

test('usuario: rechaza email, rol, sucursal y caja inválidos', () => {
  assert.ok(validarUsuario({ ...usuario, email: 'ana@' }, true).error)
  assert.ok(validarUsuario({ ...usuario, rol_id: '3' }, true).error)
  assert.ok(validarUsuario({ ...usuario, sucursal_id: 0 }, true).error)
  assert.ok(validarUsuario({ ...usuario, caja_id: 'x' }, false).error)
  assert.ok(validarUsuario({ ...usuario, nombre_usuario: '   ' }, true).error)
})

test('usuario: activo acepta true/false y el 1/0 que devuelve MySQL', () => {
  assert.equal(validarUsuario(usuario, true).activo, true)
  assert.equal(validarUsuario({ ...usuario, activo: 1 }, false).activo, true)
  assert.equal(validarUsuario({ ...usuario, activo: 0 }, false).activo, false)
  assert.equal(validarUsuario({ ...usuario, activo: false }, false).activo, false)
})

test('caja: el horario tiene que ser HH:MM y la apertura anterior al cierre', () => {
  assert.deepEqual(validarCaja(caja), caja)
  assert.ok(validarCaja({ ...caja, hora_apertura: '18:00', hora_cierre: '09:00' }).error)
  assert.ok(validarCaja({ ...caja, hora_cierre: '24:00' }).error)
  assert.ok(validarCaja({ ...caja, hora_apertura: ['09:00'] }).error)
  assert.ok(validarCaja({ ...caja, numero_caja: '' }).error)
})

test('sucursal: razón social y domicilio son obligatorios', () => {
  const s = { razon_social: 'Juguetería SRL', domicilio: 'Av. Siempre Viva 742' }
  assert.deepEqual(validarSucursal(s), { ...s, telefono: '' })
  assert.ok(validarSucursal({ ...s, domicilio: '' }).error)
  assert.ok(validarSucursal({ ...s, razon_social: undefined }).error)
})
