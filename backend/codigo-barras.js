// Caso de uso "Generar Código de Barras": si el producto llega sin código,
// se le asigna un EAN-13 interno. El prefijo 20-29 está reservado por GS1
// para uso interno del comercio, así nunca choca con un código de fábrica.

export function digitoVerificador(doceDigitos) {
  const suma = [...doceDigitos].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0)
  return String((10 - (suma % 10)) % 10)
}

export function codigoInterno(productoId) {
  const base = '20' + String(productoId).padStart(10, '0')
  return base + digitoVerificador(base)
}
