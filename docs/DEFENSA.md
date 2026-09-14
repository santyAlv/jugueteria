# Defensa oral — Carga de productos

Guía para presentar el módulo: qué mostrar, en qué orden, cómo se relaciona con los diagramas del informe y qué preguntas pueden hacer.

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
| `productos.calcularPrecioVenta()` | Columna calculada `precio` en [schema.sql:38](../db/schema.sql) y vista previa en [ProductoActivity.kt:92](../mobile/app/src/main/java/com/jugueteria/app/ProductoActivity.kt) |
| `productos.buscarPorCodigoBarras(codigo)` | [server.js:117](../backend/server.js) |
| `productos.actualizarStock(cantidad, tipo)` y `movimientos_stock.registrarIngreso(producto_id, cantidad)` | `registrarIngreso()` en [server.js:79](../backend/server.js) |
| `movimientos_stock.obtenerTrazabilidad(producto_id)` | [server.js:173](../backend/server.js) |
| `usuarios.login(email, password)` | [server.js:25](../backend/server.js) |
| `usuarios.tieneAcceso(ruta)` | `puedeCargar` en [server.js:50](../backend/server.js) |
| `movimientos_stock.registrarEgreso()` | No va en este módulo: lo usa Ventas |

### Tablas usadas (DER / Clases)

`sucursales`, `roles`, `usuarios`, `productos`, `movimientos_stock`. Los campos y tipos siguen el **Diagrama de Clases** (es el más completo). El resto de las tablas (cajas, facturas, pagos, vouchers…) se crean con sus módulos.

### Diagrama de Despliegue

- Celular → API por HTTP/JSON → MySQL por SQL: igual al diagrama.
- En la demo se usa **HTTP en la red local**. En producción iría **HTTPS**, como dice el diagrama.

---

## 4. Decisiones técnicas (para explicar si preguntan)

**¿Por qué el stock no se puede editar a mano?**
Todo cambio de stock pasa por un movimiento con usuario, fecha y cantidad. Así siempre se sabe quién ingresó qué y cuándo (trazabilidad). El stock de un producto es la suma de sus movimientos.

**¿Qué pasa si se corta la luz a mitad de una carga?**
El alta del producto, el código generado y el movimiento de stock se guardan en **una sola transacción** (`enTransaccion`, [server.js:87](../backend/server.js)). O se guarda todo o no se guarda nada: nunca queda un producto con stock sin su movimiento.

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
