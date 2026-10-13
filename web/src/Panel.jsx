import { useEffect, useRef, useState } from 'react'
import { api, pesos } from './api.js'
import Usuarios from './Usuarios.jsx'
import Cajas from './Cajas.jsx'
import Sucursales from './Sucursales.jsx'
import Permisos from './Permisos.jsx'
import MiCaja from './MiCaja.jsx'
import Factura from './Factura.jsx'
import Ventas, { TablaVentas } from './Ventas.jsx'

// Bocetos web "Super Admin" y "Vistas caja": barra con cerrar sesión, logo y accesos, y debajo cada gestión.
// Qué se muestra depende de las opciones que el rol tiene habilitadas (tabla acceso_roles).
export default function Panel({ salir }) {
  const [datos, setDatos] = useState(null)
  const [vista, setVista] = useState('inicio') // inicio · factura · ventas
  const [aviso, setAviso] = useState(null)
  const reloj = useRef()

  function avisar(texto, esError = false) {
    setAviso({ texto, esError })
    clearTimeout(reloj.current)
    reloj.current = setTimeout(() => setAviso(null), 5000)
  }

  function ir(nueva) {
    setVista(nueva)
    window.scrollTo(0, 0)
  }

  // Sesión vencida: se vuelve al inicio de sesión
  const pedir = (...pedido) =>
    api(...pedido).catch((e) => {
      if (e.estado === 401) salir(e.message)
      throw e
    })

  async function cargar() {
    const yo = await pedir('GET', '/menu')
    const puede = (ruta) => yo.accesos.includes(ruta)
    const rutas = {
      productos: '/productos',
      ...(puede('/api/admin') && { roles: '/admin/roles', sucursales: '/admin/sucursales', usuarios: '/admin/usuarios', cajas: '/admin/cajas', permisos: '/admin/permisos' }),
      ...(puede('/api/ventas') && { caja: '/caja', medios: '/medios-pago' }),
      ...((puede('/api/ventas') || puede('/api/reportes')) && { ventas: '/ventas' }),
    }
    const listas = await Promise.all(Object.values(rutas).map((ruta) => pedir('GET', ruta)))
    setDatos({ yo, ...Object.fromEntries(Object.keys(rutas).map((clave, i) => [clave, listas[i]])) })
  }

  // Guarda un cambio en la API, vuelve a leer todo y avisa
  async function guardar(metodo, ruta, cuerpo, mensaje) {
    const respuesta = await pedir(metodo, ruta, cuerpo)
    await cargar()
    if (mensaje) avisar(mensaje)
    return respuesta
  }

  useEffect(() => {
    cargar().catch((e) => salir(e.message))
  }, [])

  if (!datos) return <p className="nota centro">Cargando...</p>

  const { yo } = datos
  const vende = 'caja' in datos
  const seccion = { datos, yo, guardar, avisar, ir }
  const tostada = aviso && <p className={aviso.esError ? 'aviso error' : 'aviso'} role="status">{aviso.texto}</p>

  if (vista === 'factura') return <><Factura {...seccion} />{tostada}</>
  if (vista === 'ventas') return <><Ventas {...seccion} />{tostada}</>

  return (
    <>
      <header>
        <button type="button" className="icono" onClick={() => salir()} title="Cerrar sesión" aria-label="Cerrar sesión">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 8l-4 4 4 4M6 12h10" />
          </svg>
        </button>
        <img src="/logo.png" alt="Juguetería" />
        <nav>
          {datos.usuarios && <a href="#usuarios">Usuarios</a>}
          <a href="#productos">Productos</a>
          {datos.ventas && <button type="button" onClick={() => ir('ventas')}>Ventas</button>}
          {datos.cajas && <a href="#cajas">Cajas</a>}
          {vende && <button type="button" onClick={() => ir('factura')}>Facturas</button>}
          {datos.sucursales && <a href="#comercio">Comercio</a>}
          {datos.permisos && <a href="#permisos">Permisos</a>}
        </nav>
      </header>

      <main>
        <h1>Bienvenido, {yo.nombre_usuario}{datos.caja && ` · Caja ${datos.caja.numero_caja}`}</h1>

        {vende && <MiCaja {...seccion} />}
        {datos.usuarios && <Usuarios {...seccion} />}

        <section id="productos">
          <div className="titulo"><h2>Gestión de productos</h2></div>
          <div className="scroll">
            <table>
              <thead>
                <tr><th>ID</th><th>Nombre</th><th>Código de barras</th><th>Precio</th><th>Stock</th></tr>
              </thead>
              <tbody>
                {datos.productos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.nombre}</td>
                    <td>{p.codigo_barras}</td>
                    <td>{pesos(p.precio)}</td>
                    <td>{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nota">Productos de tu sucursal. La carga y el ingreso de mercadería se hacen desde la app móvil.</p>
        </section>

        {datos.ventas && (
          <section id="ventas">
            <div className="titulo">
              <h2>{yo.accesos.includes('/api/reportes') ? 'Gestión de ventas' : 'Últimas ventas'}</h2>
              <button type="button" className="enlace" onClick={() => ir('ventas')}>Ver todo ›</button>
            </div>
            <TablaVentas ventas={datos.ventas.slice(0, 5)} />
          </section>
        )}

        {datos.cajas && <Cajas {...seccion} />}
        {datos.sucursales && <Sucursales {...seccion} />}
        {datos.permisos && <Permisos {...seccion} />}
      </main>

      {tostada}
    </>
  )
}
