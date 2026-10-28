import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarHorario, validarRango, esFecha, sumar } from './gerente.js'

const horario = { hora_apertura: '09:00', hora_cierre: '18:00', hora_limite_ventas: '17:30' }

test('horario: acepta apertura < límite <= cierre y el límite es opcional', () => {
  assert.equal(validarHorario(horario).error, undefined)
  assert.equal(validarHorario({ ...horario, hora_limite_ventas: '18:00' }).error, undefined)
  assert.equal(validarHorario({ ...horario, hora_limite_ventas: '' }).hora_limite_ventas, null)
  assert.equal(validarHorario({ ...horario, hora_limite_ventas: undefined }).hora_limite_ventas, null)
})

test('horario: rechaza horas inválidas, apertura posterior al cierre y límite fuera del horario', () => {
  assert.ok(validarHorario({ ...horario, hora_apertura: '9:00' }).error)
  assert.ok(validarHorario({ ...horario, hora_cierre: '24:00' }).error)
  assert.ok(validarHorario({ ...horario, hora_apertura: '18:00', hora_cierre: '09:00' }).error)
  assert.ok(validarHorario({ ...horario, hora_limite_ventas: '08:00' }).error)
  assert.ok(validarHorario({ ...horario, hora_limite_ventas: '19:00' }).error)
  assert.ok(validarHorario({ ...horario, hora_limite_ventas: 'tarde' }).error)
  assert.ok(validarHorario(undefined).error)
})

test('fechas: formato AAAA-MM-DD y días que existen', () => {
  assert.ok(esFecha('2026-02-28'))
  assert.ok(!esFecha('2026-02-31'))
  assert.ok(!esFecha('28/02/2026'))
  assert.ok(!esFecha(20260228))
})

test('rango: sin fechas usa el período por defecto; rechaza fechas inválidas o invertidas', () => {
  assert.deepEqual(validarRango({}), { desde: null, hasta: null })
  assert.equal(validarRango({ desde: '2026-01-01', hasta: '2026-01-31' }).error, undefined)
  assert.ok(validarRango({ desde: '2026-02-01', hasta: '2026-01-01' }).error)
  assert.ok(validarRango({ desde: 'ayer' }).error)
})

test('sumar: suma importes en centavos sin errores de decimales', () => {
  assert.equal(sumar([{ m: 0.1 }, { m: 0.2 }], 'm'), 0.3)
})
