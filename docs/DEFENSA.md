# Defensa oral — Sistema de Gestión para Juguetería

Las secciones 1 a 5 son del módulo de carga de productos; la 6, del panel de administración; la 7, de caja y ventas; la 8, de recuperar contraseña.

Guía para presentar cada módulo: qué mostrar, en qué orden, cómo se relaciona con los diagramas del informe y qué preguntas pueden hacer.

---

## 1. Antes de empezar (checklist)

- [ ] `db/schema.sql` ejecutado **justo antes** (deja 3 productos de prueba y sin movimientos extra).
- [ ] MySQL y la API corriendo (`npm start` en `backend`).
- [ ] Celular en la **misma WiFi** que la PC, app instalada y probada contra la IP de ese día (`ipconfig`).
- [ ] MySQL Workbench (o consola) abierto con esta consulta lista:
  ```sql
  USE jugueteria;
  SELECT id, nombre, codigo_barras, precio, stock FROM productos;
  SELECT * FROM movimientos_stock ORDER BY id DESC;
  ```
- [ ] Un juguete real con código de barras **que no esté cargado**, o la imagen `docs/codigos-prueba/7798765432107-producto-nuevo.png` abierta en pantalla.
- [ ] Informe abierto en: Caso de Uso 3, DER y Diagrama de Clases.

---

## 2. Guion de la demo (6–8 minutos)

Sugerencia de reparto según los roles del informe.

| Parte | Quién | Qué se muestra |
|---|---|---|
| Introducción y Caso de Uso 3 | Ortiz Morena (Analista) | Qué problema resuelve: registrar mercadería que llega al depósito sin errores y con trazabilidad |
| Interfaz y bocetos | Gomez Nayla (UX/UI · PM) | La app respeta los bocetos: paleta rosa/lila, botón "<", logo, lista id · nombre · precio · stock |
| Demo en el celular | Cora Alex (Mobile) | Pasos 1 a 5 de abajo |
| Base de datos y API | Alvarez Santiago (Backend · DBA) | Tablas, transacción, columna calculada, seguridad |

### Paso 1 — Iniciar sesión (CU1)
Entrar como `deposito@jugueteria.com / deposito123`. Mostrar que dice "BIENVENIDO DEPOSITO · Rol: Deposito".

### Paso 2 — Escanear un producto nuevo (CU3: Buscar Producto → Registrar Nuevo)
1. **Escanear Código de Barras** → apuntar al juguete nuevo.
2. Como el código no existe, la app avisa y abre **Cargar producto** con el código ya completado.
3. Completar nombre, precio de ingreso, ganancia (el IVA viene en 21) y stock inicial.
4. Mostrar que el **precio de venta se calcula en vivo** mientras escriben.
5. **Cargar producto**.
6. En Workbench: aparece el producto **y** un movimiento `INGRESO` con el usuario `deposito` (id 2).

### Paso 3 — Escanear el mismo producto otra vez (CU3: Registrar Ingreso → Actualización de Stock)
1. Volver a escanear el mismo código.
2. Ahora el producto existe: abre **Ingreso de mercadería** con el stock actual.
3. Ingresar 10 unidades → el stock sube y aparece en "Últimos movimientos" con fecha y usuario.
4. En Workbench: `stock` actualizado y un movimiento nuevo.

### Paso 4 — Producto sin código (Generar Código de Barras)
Productos → **+** → dejar el código vacío → cargar. El sistema asigna un EAN-13 interno (`2000000000…`) y lo muestra.

### Paso 5 — Errores (caso de uso "Error")
- Ingresar cantidad `0` → "Cantidad mayor a 0".
- Cargar un producto con un código que ya existe → "Ya existe un producto con ese código de barras".
- Cerrar sesión, entrar como `cajero@jugueteria.com / cajero123` e intentar un ingreso → "El rol Cajero no puede cargar productos".
- Apagar la API → "No se pudo conectar con el servidor".

---

## 3. Coherencia con los diagramas del informe

### Caso de Uso 3 — Registrar Ingreso de Mercadería

| Elemento del diagrama | Pantalla de la app | API | Base de datos |
|---|---|---|---|
| Actor **Depósito** | Login con rol Deposito | `POST /api/login` | `usuarios`, `roles` |
| Registro Ingreso de Mercadería | Menú → Escanear Código de Barras | — | — |
| Buscar Producto «include» | Escáner (ML Kit) | `GET /api/productos/codigo/:codigo` | `SELECT` en `productos` |
| Registrar Nuevo «include» | Cargar producto | `POST /api/productos` | `INSERT` en `productos` |
| Registrar Ingreso «extend» | Ingreso de mercadería | `POST /api/productos/:id/ingreso` | `INSERT` en `movimientos_stock` |
| Actualización de Stock «extend» | automático | misma transacción | `UPDATE productos SET stock = stock + ?` |
| Generar Código de Barras «extend» | código vacío al cargar | `codigoInterno()` | `UPDATE productos.codigo_barras` |
| Modificar Información del Producto «extend» | Modificar producto | `PUT /api/productos/:id` | `UPDATE` en `productos` |
| Error | mensajes en pantalla | respuestas 400 / 401 / 403 / 404 / 409 | `CHECK` y `UNIQUE` |

### Diagrama de Clases → código

| Método del diagrama | Dónde está implementado |
|---|---|
| `productos.calcularPrecioVenta()` | Columna calculada `precio` en [schema.sql:70](../db/schema.sql) y vista previa en [ProductoActivity.kt:92](../mobile/app/src/main/java/com/jugueteria/app/ProductoActivity.kt) |
| `productos.buscarPorCodigoBarras(codigo)` | [server.js:198](../backend/server.js) |
| `productos.actualizarStock(cantidad, tipo)` y `movimientos_stock.registrarIngreso(producto_id, cantidad)` | `registrarIngreso()` en [server.js:160](../backend/server.js) |
| `movimientos_stock.obtenerTrazabilidad(producto_id)` | [server.js:254](../backend/server.js) |
| `usuarios.login(email, password)` | [server.js:51](../backend/server.js) |
| `usuarios.tieneAcceso(ruta_script)` y `acceso_roles.verificarAcceso(rol_id, ruta_script)` | `tieneAcceso()` en [server.js:74](../backend/server.js): consulta la tabla `acceso_roles` |
| `movimientos_stock.registrarEgreso()` | Lo usa Ventas: `POST /ventas` en [ventas.js:126](../backend/ventas.js) |

### Tablas usadas (DER / Clases)

Carga de productos usa `sucursales`, `roles`, `acceso_roles`, `usuarios`, `productos` y `movimientos_stock`. Con los otros módulos se sumaron `cajas`, `caja_movimientos`, `facturas`, `detalle_factura`, `medios_pago`, `pagos` y `vouchers`. Los campos y tipos siguen el **Diagrama de Clases** (es el más completo). Solo falta `retiros_efectivo`.

### Diagrama de Despliegue

- Celular → API por HTTP/JSON → MySQL por SQL: igual al diagrama.
- En la demo se usa **HTTP en la red local**. En producción iría **HTTPS**, como dice el diagrama.

---

## 4. Decisiones técnicas (para explicar si preguntan)

**¿Por qué el stock no se puede editar a mano?**
Todo cambio de stock pasa por un movimiento con usuario, fecha y cantidad. Así siempre se sabe quién ingresó qué y cuándo (trazabilidad). El stock de un producto es la suma de sus movimientos.

**¿Qué pasa si se corta la luz a mitad de una carga?**
El alta del producto, el código generado y el movimiento de stock se guardan en **una sola transacción** (`enTransaccion`, [server.js:168](../backend/server.js)). O se guarda todo o no se guarda nada: nunca queda un producto con stock sin su movimiento.

**¿Por qué el precio lo calcula MySQL?**
`precio` es una columna calculada: `precio_ingreso × (1 + ganancia/100) × (1 + IVA/100)`. Si alguien cambia el precio de ingreso, el precio de venta se actualiza solo y nunca queda desactualizado.

**¿Cómo se evitan códigos repetidos?**
`codigo_barras` es `UNIQUE` en la base. Si llega uno repetido, MySQL lo rechaza y la API responde 409 con un mensaje claro.

**¿Por qué el código generado empieza con 20?**
GS1 (el organismo de los códigos de barras) reserva los prefijos 20 a 29 para uso interno de los comercios. Así un código generado nunca coincide con el de un producto de fábrica. El último dígito es el **dígito verificador** EAN-13: se suman los 12 dígitos alternando pesos 1 y 3, y se completa hasta la decena siguiente. Está probado en `backend/codigo-barras.test.js`.

**¿Cómo lee el código el celular?**
CameraX muestra la cámara y le pasa cada cuadro a **ML Kit** (librería de Google). ML Kit detecta el código **dentro del celular, sin internet** (el modelo viene incluido en la app). Lee EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 y QR ([EscanerActivity.kt:49](../mobile/app/src/main/java/com/jugueteria/app/EscanerActivity.kt)).

**¿Por qué la app no se conecta directo a MySQL?**
Por seguridad y por la arquitectura del informe: la base no queda expuesta en la red, y las reglas de negocio (validaciones, permisos, transacciones) están en un solo lugar, la API.

**¿Cómo se guardan las contraseñas?**
Con **bcrypt** (hash con sal). Nunca en texto plano. Al iniciar sesión la API entrega un **token JWT** válido por 8 horas que la app manda en cada pedido.

**¿Y la inyección SQL?**
Todas las consultas usan parámetros (`?`): los datos del usuario nunca se pegan dentro del SQL.

**¿Se valida en la app o en el servidor?**
En los dos. La app valida para avisar rápido; la API vuelve a validar porque nunca se confía en lo que llega del cliente. Además la base tiene `CHECK` (stock ≥ 0, cantidad > 0, IVA entre 0 y 100).

**¿Cómo se relaciona con el Modelo en V?**
Cada nivel tiene su prueba:
- Diseño de detalle → prueba unitaria (`npm test`, dígito verificador).
- Diseño de la arquitectura → prueba de integración (API + MySQL: alta, ingreso, duplicado, permisos).
- Requerimientos (CU3) → prueba de aceptación: la demo con el celular.

---

## 5. Diferencias encontradas entre documentos (conviene corregirlas antes)

Mejor detectarlas ustedes que el profesor. En el código se tomó como referencia el **Diagrama de Clases**.

1. **DER, tabla `productos` duplicada**: arriba a la derecha hay otra `productos` con `nombre_caja`, `sucursal_id` e `iva` conectada a cajas y facturas. Parece un error; hay que borrarla o renombrarla.
2. **DER, `productos` incompleta**: le faltan `precio`, `stock` y `sucursal_id`, que sí están en el Diagrama de Clases.
3. **DER, `usuarios` sin `email`**: el login es por email y el Diagrama de Clases lo tiene.
4. **Boceto "Modificar producto"**: tiene **Descripción**, que no existe en DER ni en Clases, y deja editar **Stock** directamente. En la app el stock cambia solo por ingreso (trazabilidad). Opciones: sacar esos campos del boceto, o agregar `descripcion` a la tabla.
5. **Boceto "Gestión de productos"**: tiene un botón para **desactivar** productos, pero la tabla no tiene un campo `activo` o `estado`. No se implementó; si lo quieren, se agrega `activo TINYINT DEFAULT 1`.
6. **Diagrama de Despliegue**: dice "Back-End Node / React" (React es frontend; el backend es Node/Express) y no aparece el **celular con la App Android** conectado a la API. Conviene agregar ese nodo.
7. **Nombres distintos**: `factura_detalle` en el DER y `detalle_factura` en Clases (no afecta este módulo).

Las que aparecieron con el panel de administración:

8. **Horario de las cajas**: el requisito pide configurar apertura y cierre, pero `cajas` no tiene esos campos en el DER ni en Clases. Se agregaron `hora_apertura` y `hora_cierre` (TIME): hay que sumarlos a los dos diagramas.
9. **Baja de usuarios**: el boceto móvil "Gestión de usuarios" tiene un botón ⊗ por usuario, pero `usuarios` no tiene con qué marcar la baja. Se agregó `activo` (TINYINT): sumarlo a los diagramas.
10. **`cajas` distinta en cada diagrama**: en el DER `numero_caja` es int y no hay `usuario_id`; en Clases es VARCHAR(50) y sí está `usuario_id`. Se siguió Clases.
11. **`acceso_roles`** está en Clases pero no en el DER: agregarla al DER.
12. **Sucursal sin nombre**: el boceto web deja elegir "sucursal" en un desplegable, pero la tabla solo tiene razón social, domicilio y teléfono. El panel las muestra como "Sucursal 1 · domicilio".
13. **¿Quién gestiona usuarios?** El informe dice "Administrador / Gerente"; el requisito del panel dice solo Administrador. Se implementó solo Administrador (cambiarlo es agregar una fila en `acceso_roles`).
14. **Bocetos móviles sin hacer**: el menú del boceto móvil tiene Generar Factura, Cajas, Ventas y Usuarios; eso está hecho en la web, no en la app. También tiene "Crear cuenta", pero los usuarios los crea el administrador.
15. **HTTPS**: el Diagrama de Despliegue dice HTTPS y el sistema corre en HTTP en la red local.

Las que aparecieron con caja y ventas:

16. **`detalle_factura` / `factura_detalle`**: se usó el nombre de Clases (`detalle_factura`).
17. **Retiros de efectivo**: `retiros_efectivo` está en los dos diagramas pero ningún boceto ni caso de uso lo muestra. No se implementó; el arqueo hoy es apertura + ventas en efectivo.
18. **Vouchers**: el diagrama no dice si un voucher se usa una vez o guarda saldo. Se implementó de un solo uso (`estado` pasa a USADO); si es mayor que la compra, el resto se pierde. Tampoco hay boceto para crearlos: se cargan por SQL.
19. **Anular factura**: `facturas.anularFactura()` está en Clases pero no en el Caso de Uso 2 ni en los bocetos. No se implementó (el estado ANULADA existe en la tabla).
20. **Horario de la caja**: se usa para algo que el informe no define: la caja solo se puede **abrir** dentro de ese horario.
21. **Boceto "Crear Factura"**: muestra tres medios de pago excluyentes. Como `pagos` permite varios por factura, el voucher se combina con efectivo o tarjeta cuando no alcanza.

---

## 6. Panel de administración (web)

Es la "App Administrativa" de la "PC Administrador" del Diagrama de Despliegue y sigue el boceto web "Super Admin": cerrar sesión arriba a la izquierda, logo al centro, accesos y una tabla por cada gestión. Hecho en **React** (como dice "Tecnologías a utilizar"), compilado a HTML/CSS/JS y servido por el mismo servidor Node.

### Antes de empezar

- [ ] `npm run build` hecho en `web` y la API corriendo.
- [ ] Navegador en `http://localhost:3000`.

### Guion de la demo (4–5 minutos)

1. **Iniciar sesión** como `cajero@jugueteria.com / cajero123`: solo ve su caja, productos y ventas (no aparecen Usuarios, Cajas, Comercio ni Permisos). Cerrar sesión y entrar como `admin@jugueteria.com / admin123`.
2. **Crear un usuario**: Gestión de usuarios → **+ Nuevo usuario** (nombre, correo, contraseña, rol Cajero, sucursal). Repetir el correo de otro → "Ya existe un usuario con ese email".
3. **Asignar roles**: cambiar el desplegable **Rol** de un usuario a Gerente, Deposito o Cajero. Se guarda al elegir.
4. **Crear una caja y su horario**: Gestión de cajas → **+ Nueva caja** (número, sucursal, hora de apertura y de cierre). Poner la apertura después del cierre → error.
5. **Asignar el cajero a la caja**: en Gestión de usuarios, desplegable **Caja** del cajero. En Gestión de cajas aparece en la columna "Cajeros".
   - **Permisos**: en Permisos por rol, tildar "Facturación y caja" para Gerente: al gerente le aparece el desplegable Caja. Destildarlo.
6. **Datos del comercio**: Editar la sucursal (razón social, domicilio, teléfono) o crear otra con **+ Nueva sucursal**.
7. **Dar de baja**: **Desactivar** un usuario y mostrar en el celular que ya no puede iniciar sesión ni seguir usando la app.

### Requisitos → pantalla, API y base de datos

| Función del Administrador | En el panel | API | Base de datos |
|---|---|---|---|
| Crear y administrar usuarios | Gestión de usuarios: + Nuevo usuario, Editar, Desactivar | `POST` y `PUT /api/admin/usuarios` | `usuarios` (`activo` para la baja) |
| Asignar roles (Gerente, Deposito, Cajero) | Desplegable **Rol** | `PUT /api/admin/usuarios/:id` | `usuarios.rol_id` → `roles` |
| Configurar datos del comercio | Datos del comercio | `GET`, `POST` y `PUT /api/admin/sucursales` | `sucursales` |
| Crear las cajas disponibles para la venta | Gestión de cajas: + Nueva caja | `POST /api/admin/cajas` | `cajas` |
| Asignar cajeros a cada caja | Desplegable **Caja** del cajero | `PUT /api/admin/usuarios/:id` | `usuarios.caja_id` → `cajas` |
| Configurar horarios de apertura y cierre | Nueva caja / Editar caja | `POST` y `PUT /api/admin/cajas` | `cajas.hora_apertura`, `hora_cierre` |

### Diagrama de Clases → código

| Método del diagrama | Dónde está implementado |
|---|---|
| `usuarios.tieneAcceso(ruta_script)` · `acceso_roles.verificarAcceso()` | `tieneAcceso()` en [server.js:74](../backend/server.js) |
| `acceso_roles.cambiarVisibilidad(visible)` | Pantalla **Permisos por rol**: cada casilla cambia `visible` de una fila (`PUT /permisos/:id` en [admin.js:100](../backend/admin.js)) |
| `usuarios.cambiarPassword()` · `asignarSucursal()` · `asignarCaja()` | `PUT /usuarios/:id` en [admin.js:141](../backend/admin.js) |
| `sucursales.actualizarDatos()` | `PUT /sucursales/:id` en [admin.js:72](../backend/admin.js) |
| `roles.listarUsuariosAsignados()` · `sucursales.listarUsuarios()` | `GET /usuarios` en [admin.js:114](../backend/admin.js) (trae rol y sucursal de cada uno) |
| `cajas.getEstado()` | Columna "Estado" de Gestión de cajas |
| `cajas.abrirCaja()` · `cerrarCaja()` · `registrarMovimiento()` | Módulo de Caja: ver sección 7 |

### Decisiones técnicas (para explicar si preguntan)

**¿Cómo se controla quién entra al panel?**
Con la tabla `acceso_roles`: hay una fila por rol y por opción, y `visible` dice si la puede usar. La API la consulta en cada pedido y le informa a la web qué opciones tiene el usuario (`GET /api/menu`): la web solo muestra esas pantallas, y aunque alguien las fuerce la API responde 403. El administrador las cambia desde Permisos por rol.

**¿Qué pasa si le cambio el rol a alguien que está usando el sistema?**
Rige al instante. El token solo dice quién es el usuario; el rol y si está activo se leen de la base en cada pedido ([server.js:63](../backend/server.js)).

**¿Por qué no se borran los usuarios?**
Porque sus movimientos de stock (y después sus ventas) apuntan a ellos. Se desactivan: no pueden iniciar sesión, pero la trazabilidad queda.

**¿Puede quedar el sistema sin administrador?**
No: el administrador no puede desactivarse ni sacarse su propio rol.

**¿Puede un cajero quedar en una caja de otra sucursal?**
No. La caja solo se guarda si el rol del usuario puede facturar (permiso "Facturación y caja"), está activo y la caja es de su sucursal. Si cambia a un rol que no factura o cambia de sucursal, la caja se le quita sola (una sola sentencia `UPDATE`, [admin.js:141](../backend/admin.js)).

**¿Qué valida la base y qué la API?**
La API valida formato y reglas (email, contraseña de 6 a 72 caracteres, horario HH:MM). La base lo vuelve a asegurar: `UNIQUE` en email, nombre de usuario y número de caja por sucursal; `CHECK` de apertura anterior al cierre; claves foráneas.

**¿Por qué React?**
Es lo que define el informe para el frontend web. Se usa sin librerías extra: componentes, `fetch` y formularios HTML. `npm run build` genera HTML/CSS/JS que sirve el mismo Node, como en el Diagrama de Despliegue.

**Pruebas (Modelo en V)**
- Unitaria: `npm test` en `backend` (validaciones de usuario, caja y sucursal).
- Integración: API + MySQL (permisos por rol, duplicados, asignación de caja, baja).
- Aceptación: el guion de arriba en el navegador.

---

## 7. Caja y ventas (web)

Caso de Uso 2 "Realizar Venta" y los bocetos web "Vistas caja", "Ventas" y "Crear Factura". Las pantallas son las mismas para el cajero y para el administrador: cada uno ve lo que su rol tiene habilitado.

### Antes de empezar

- [ ] El cajero tiene una caja asignada y **la hora actual está dentro del horario de esa caja** (si no, cambiarlo en Gestión de cajas).
- [ ] Un voucher sin usar: `REGALO-5000`, `REGALO-20000` o `REGALO-50000` (vuelven a estar disponibles al ejecutar `schema.sql`).

### Guion de la demo (5–6 minutos)

1. **Entrar como cajero** (`cajero@jugueteria.com / cajero123`): "Bienvenido, cajero · Caja 1", la caja cerrada y las últimas ventas.
2. **Abrir caja**: declarar el efectivo inicial (por ejemplo 10000). Queda "Abierta" y muestra el efectivo que calcula el sistema.
3. **+ Nueva factura**: buscar un producto por nombre y otro escribiendo el código de barras + Enter (así funciona un lector de códigos). Cambiar una cantidad: el total se recalcula.
4. **Voucher**: tocar Voucher, escribir `REGALO-5000` y Aplicar: muestra el descuento y lo que falta cobrar. Elegir **Efectivo** y **Emitir factura**.
5. Al volver: bajó el stock en Gestión de productos, subió el efectivo de la caja (solo la parte en efectivo) y la venta aparece en Últimas ventas.
6. **Ver todo ›**: filtros Día / Semana / Mes, orden por total, cantidad de ventas y total. Desplegar **Pago** y **Detalle**.
7. **Cerrar caja**: declarar un monto distinto al del sistema. Muestra lo calculado, lo declarado y el faltante o sobrante.
8. **Errores**: emitir sin medio de pago, usar otra vez el mismo voucher, pedir más unidades que el stock, abrir la caja fuera de horario.
9. **Como administrador**: Gestión de ventas muestra las ventas de todas las cajas; Gestión de cajas muestra el estado y el monto de cada una.

### Caso de Uso 2 — Realizar Venta

| Elemento del diagrama | Pantalla | API | Base de datos |
|---|---|---|---|
| Actor **Cajero** · Iniciar Sesión «extend» | Inicio de sesión | `POST /api/login` | `usuarios`, `acceso_roles` |
| Realizar Venta | Mi caja → + Nueva factura | `POST /api/ventas` | una transacción |
| Buscar Producto «include» | Buscador por nombre o código | `GET /api/productos` | `productos` |
| Agregar Producto «include» | Tabla Detalles | — | `detalle_factura` |
| Calcular Stock «include» | No deja pasar el stock | `UPDATE … WHERE stock >= ?` | `productos.stock`, `movimientos_stock` (EGRESO) |
| Calcular Total «include» | Total | `totalDe()` en [ventas.js:28](../backend/ventas.js) | `facturas.total` |
| Aplicar Voucher «extend» | Botón Voucher + código | `GET /api/vouchers/:numero` | `vouchers`, `pagos.voucher_id` |
| Registrar Venta «include» | Emitir factura | `POST /api/ventas` | `facturas`, `detalle_factura`, `pagos` |
| Error | Mensajes en pantalla | 400 / 403 / 404 / 409 | `CHECK` y claves foráneas |

### Diagrama de Clases → código

| Método del diagrama | Dónde está implementado |
|---|---|
| `cajas.abrirCaja(usuario_id)` · `caja_movimientos.registrarApertura(monto_declarado)` | `POST /caja/apertura` en [ventas.js:65](../backend/ventas.js) |
| `cajas.cerrarCaja()` · `caja_movimientos.registrarCierre(monto_declarado)` | `POST /caja/cierre` en [ventas.js:92](../backend/ventas.js) |
| `caja_movimientos.calcularDiferencia()` | Columna calculada `diferencia` en [schema.sql:107](../db/schema.sql) |
| `cajas.getEstado()` | `GET /caja` en [ventas.js:62](../backend/ventas.js) |
| `cajas.registrarMovimiento(tipo, monto)` | Los `INSERT` en `caja_movimientos` de apertura y cierre |
| `facturas.generarFactura()` · `detalle_factura.agregarProducto()` · `pagos.registrarPago()` | `POST /ventas` en [ventas.js:126](../backend/ventas.js) |
| `facturas.calcularTotal()` | `totalDe()` en [ventas.js:28](../backend/ventas.js) |
| `detalle_factura.calcularSubtotal()` | Columna calculada `subtotal` en [schema.sql:134](../db/schema.sql) |
| `vouchers.validarVoucher()` | `GET /vouchers/:numero` en [ventas.js:117](../backend/ventas.js) |
| `vouchers.aplicarAPago()` · `actualizarEstado()` · `pagos.aplicarVoucher()` | Dentro de `POST /ventas` |
| `movimientos_stock.registrarEgreso()` | Dentro de `POST /ventas` |
| `facturas.anularFactura()` · `cambiarEstado()` · `retiros_efectivo.*` | No implementados (ver sección 5) |

### Decisiones técnicas (para explicar si preguntan)

**¿Qué pasa si falla algo a mitad de una venta?**
Factura, detalle, pagos, baja de stock, movimientos y voucher van en **una sola transacción**. Si no hay stock de un producto o el voucher ya fue usado, no se guarda nada: ni la factura ni la baja de stock de los otros productos.

**¿Dos cajas pueden vender la última unidad al mismo tiempo?**
No. El stock se descuenta con `UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?`: la base atiende de a una y la segunda no encuentra stock.

**¿De dónde sale el precio de la venta?**
De la base, en el momento de emitir. La web manda solo producto y cantidad; el precio que muestra es informativo. En `detalle_factura.precio_unitario` queda el precio de ese momento, así una factura vieja no cambia si después cambia el producto.

**¿Cómo se calcula el arqueo?**
Monto del sistema = efectivo declarado en la apertura + ventas en efectivo desde esa apertura. Tarjeta y voucher no entran porque no son billetes en la caja. Diferencia = declarado − sistema (la calcula MySQL). El resultado queda en `caja_movimientos`.

**¿Por qué los totales se calculan en centavos?**
Porque con decimales `0.1 × 3` da `0.30000000000000004`. Se multiplica por 100, se suma con enteros y se divide al final. Está probado en `backend/ventas.test.js`.

**¿Quién puede ver las ventas?**
Con el permiso "Reporte de ventas" (Administrador y Gerente) se ven todas. Con "Facturación y caja" (Cajero) solo las de la caja propia. Los filtros y el orden se hacen en la web sobre esa lista.

**¿Para qué sirve el horario de la caja?**
La caja solo se puede abrir dentro del horario que configuró el administrador. Lo controla la base en la misma sentencia que la abre.

---

## 8. Recuperar contraseña (Caso de Uso 1)

"Recuperar Contraseña «extend»" del Caso de Uso 1 y "Enviar Token → Servidor SMTP" del Diagrama de Despliegue.

### Guion de la demo (2 minutos)

Con Mailpit abierto (viene con Laragon; ver README) para ver el mail sin mandarlo de verdad:

1. En Iniciar sesión, **¿Olvidaste tu contraseña?** → escribir el email → "Si el email está registrado, te enviamos un enlace…".
2. Abrir el mail y entrar al enlace: pantalla **Nueva contraseña**.
3. Elegir la contraseña, volver a Iniciar sesión y entrar con la nueva.
4. Volver a abrir el mismo enlace: "El enlace no es válido o ya venció".

### Decisiones técnicas

**¿Qué es el token?**
Un JWT de 15 minutos firmado con el secreto del servidor **más el hash de la contraseña actual** ([server.js:105](../backend/server.js)). Al cambiar la contraseña el hash cambia y el enlace deja de servir: se usa una sola vez sin tener que guardar nada en la base.

**¿Por qué responde lo mismo si el email no existe?**
Para que nadie pueda averiguar qué emails están registrados probando en esa pantalla.

**¿De dónde sale la dirección del enlace?**
De la configuración del servidor (`URL_WEB`), nunca de lo que manda el navegador. Si saliera del pedido, alguien podría hacer que el mail lleve a otro sitio.

**¿Y desde el celular?**
El mail se abre en el celular y el enlace abre la web en su navegador; para eso `URL_WEB` tiene que ser la IP de la PC. La app no tiene todavía el botón para pedir el enlace.
