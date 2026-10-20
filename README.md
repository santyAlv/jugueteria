# Sistema de Gestión para Juguetería

Trabajo Práctico anual 2026 · Modelos y Sistemas 2
Módulos entregados:

- **Carga de productos / Caso de Uso 3 "Registrar Ingreso de Mercadería"**, con lectura de código de barras desde el celular.
- **Panel de administración** (web): usuarios y roles, permisos por rol, cajas con sus cajeros y horarios, y datos del comercio.
- **Caja y ventas / Caso de Uso 2 "Realizar Venta"** (web): apertura y cierre de caja con arqueo e informe (diferencia máxima $3000), achiques, vouchers (crear y usar), crear factura (efectivo con vuelto, tarjeta, transferencia y voucher), anulación con nota de crédito y gestión de ventas con filtros.
- **Recuperar contraseña** (Caso de Uso 1) con un enlace que llega por mail.

## Usuarios de prueba (email y contraseña)

Los crea `db/schema.sql`. Sirven para la app y para la web.

| Email | Contraseña | Rol | En la app | En la web |
|---|---|---|---|---|
| admin@jugueteria.com | admin123 | Administrador | Carga productos | Todo: usuarios, permisos, cajas, comercio y ventas |
| gerente@jugueteria.com | gerente123 | Gerente | Carga productos | Ventas de todas las cajas |
| cajero@jugueteria.com | cajero123 | Cajero | Solo consulta | Su caja, crear factura y sus ventas |
| deposito@jugueteria.com | deposito123 | Deposito | Carga productos | Solo consulta de productos |

Son cuentas de prueba: en un sistema real hay que cambiar las contraseñas desde Gestión de usuarios.
Los permisos de cada rol están en la tabla `acceso_roles` y se cambian desde la pantalla **Permisos por rol**.

Vouchers de prueba (un solo uso cada uno): `REGALO-5000`, `REGALO-20000`, `REGALO-50000`.

## Arquitectura

Igual al Diagrama de Despliegue del informe:

```
Celular (App Android · Kotlin + CameraX + ML Kit) ──┐
                                                    │  HTTP + JSON (WiFi local)
PC Administrador / Cajero (Navegador · React) ──────┤
                                                    ▼
PC · Servidor web y API REST (Node.js + Express)  ──SQL──►  MySQL 8 (base "jugueteria")
        │
        └──SMTP──►  Servidor de correo (enlace para recuperar la contraseña)
```

```
jugueteria/
├── db/
│   ├── schema.sql           tablas + datos de prueba (borra y recrea la base)
│   ├── actualizar.sql       pasa una base de la versión anterior a esta sin borrar nada
│   └── iniciar-mysql.bat    levanta un MySQL local sin instalar servicio
├── backend/
│   ├── server.js            API REST (login, recuperar contraseña, permisos, productos)
│   ├── admin.js             rutas del panel de administración
│   ├── admin.test.js
│   ├── ventas.js            rutas de caja (apertura, cierre, achique, informes) y ventas (factura, pagos, vouchers, anulación)
│   ├── ventas.test.js
│   ├── codigo-barras.js     generación de EAN-13 interno
│   └── codigo-barras.test.js
├── web/                     frontend web (React + Vite)
│   └── src/
│       ├── api.js               conexión con la API + sesión + formatos
│       ├── App.jsx              Iniciar sesión · Recuperar contraseña
│       ├── Panel.jsx            barra superior + qué gestiones ve cada rol
│       ├── MiCaja.jsx           caja del usuario: abrir, cerrar (arqueo e informe), achique y vouchers
│       ├── Factura.jsx          Crear factura
│       ├── Ventas.jsx           ventas con filtros, pago y detalle
│       ├── Usuarios.jsx         usuarios, roles y caja de cada cajero
│       ├── Cajas.jsx            cajas, horarios y monto
│       ├── Sucursales.jsx       datos del comercio
│       ├── Permisos.jsx         permisos por rol
│       └── Dialogo.jsx          ventana de alta / modificación
├── mobile/                  proyecto de Android Studio
│   └── app/src/main/java/com/jugueteria/app/
│       ├── Api.kt               conexión con la API + sesión
│       ├── LoginActivity.kt     Iniciar sesión
│       ├── MenuActivity.kt      Bienvenido + "Escanear Código de Barras"
│       ├── ProductosActivity.kt Gestión de productos (lista)
│       ├── EscanerActivity.kt   cámara + ML Kit
│       ├── ProductoActivity.kt  Cargar / Modificar producto
│       └── IngresoActivity.kt   Ingreso de mercadería + movimientos
└── docs/
    ├── DEFENSA.md           guion y preguntas para la defensa oral
    ├── capturas/            pantallas de la app
    └── codigos-prueba/      códigos de barras para probar el escáner
```

## Requisitos

- MySQL 8 (ya instalado en `C:\Program Files\MySQL\MySQL Server 8.0`)
- Node.js 22 o superior
- Android Studio (probado con 2025.3) y un celular Android 7.0+ con cámara
- PC y celular **en la misma red WiFi**

## 1. Base de datos

Opción A — usar el script (crea la base la primera vez):

```bash
db\iniciar-mysql.bat
```

Opción B — si ya tienen un MySQL andando (Workbench, XAMPP, servicio MySQL80): abrir y ejecutar `db/schema.sql`.

> `schema.sql` **borra y vuelve a crear** la base `jugueteria`. Sirve para dejarla limpia antes de la defensa.

Opción C — si ya tenían la base de la versión anterior (solo carga de productos) y no quieren perder lo cargado: ejecutar `db/actualizar.sql`. Agrega las tablas y columnas nuevas, no borra nada y se puede correr más de una vez.

## 2. API (backend)

```bash
cd backend
npm install
npm start
```

Queda escuchando en `http://localhost:3000`. Si MySQL tiene contraseña, copiar `.env.example` como `.env` y completar `DB_PASSWORD`.

La primera vez Windows pregunta si Node puede usar la red: **permitir en redes privadas**. Si el celular no conecta, crear la regla a mano desde una consola como administrador:

```bash
netsh advfirewall firewall add rule name="API Jugueteria" dir=in action=allow protocol=TCP localport=3000
```

La IP de la PC se ve con `ipconfig` ("Dirección IPv4", por ejemplo `192.168.0.37`).

Pruebas automáticas:

```bash
npm test
```

### Mail para recuperar la contraseña

Sin configurar nada, el mail no se envía: el enlace aparece en la consola donde corre la API (alcanza para probar).

Para verlo como un mail de verdad sin mandarlo a nadie se puede usar **Mailpit**, que viene con Laragon (`C:\laragon\bin\mailpit`): se ejecuta `mailpit.exe`, y en `backend/.env` se pone `SMTP_HOST=localhost` y `SMTP_PORT=1025`. Los mails se leen en `http://localhost:8025`.

Para enviar mails reales, completar en `.env` los datos SMTP del proveedor (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`). `URL_WEB` es la dirección que va en el enlace: en la red local, `http://IP-DE-LA-PC:3000`.

## 3. Web (panel de administración, caja y ventas)

```bash
cd web
npm install
npm run build
```

Con la API corriendo, la web queda en `http://localhost:3000` (la sirve el mismo servidor). Cada usuario ve las pantallas que su rol tiene habilitadas:

- **admin**: todo (usuarios, permisos, cajas, datos del comercio, ventas de todas las cajas y, si se asigna una caja, facturar).
- **cajero**: su caja (abrir, cerrar, crear factura) y las ventas de su caja.
- **Gerente**: ventas de todas las cajas.

La caja solo se puede abrir dentro de su horario: si la demo es fuera de ese horario, cambiarlo en Gestión de cajas.

Para modificar la web, `npm run dev` lo abre en `http://localhost:5173` y recarga solo con cada cambio (la API tiene que estar corriendo).

## 4. App Android

1. Android Studio → **Open** → carpeta `mobile`. Si al compilar el único error es `25.0.3`, el proyecto está usando Java 25 y Gradle 8.14 no lo soporta: en Settings → Build Tools → Gradle elegir un JDK 21.
2. Esperar que termine el "Gradle Sync".
3. En el celular activar **Opciones de desarrollador → Depuración USB** y conectarlo.
4. Botón **Run ▶**.

También se puede instalar el APK ya compilado: `mobile/app/build/outputs/apk/debug/app-debug.apk`.

En la primera pantalla cargar la **IP de la PC** y el **puerto** (3000) y tocar **Probar conexión**.

## API REST

Todas las rutas (menos login y recuperar) piden el header `Authorization: Bearer <token>`.

| Método | Ruta | Qué hace | Caso de uso |
|---|---|---|---|
| POST | `/api/login` | Devuelve token y datos del usuario | CU1 Iniciar sesión |
| POST | `/api/recuperar` | Manda por mail el enlace para cambiar la contraseña | CU1 Recuperar Contraseña |
| POST | `/api/recuperar/confirmar` | Cambia la contraseña con el token del enlace | CU1 Recuperar Contraseña |
| GET | `/api/menu` | Datos del usuario y opciones habilitadas para su rol | tieneAcceso() |
| GET | `/api/productos` | Lista productos de la sucursal | Gestión de productos |
| GET | `/api/productos/:id` | Un producto | — |
| GET | `/api/productos/codigo/:codigo` | Busca por código de barras (404 si no existe) | Buscar Producto |
| POST | `/api/productos` | Alta + stock inicial + código generado si viene vacío | Registrar Nuevo · Generar Código de Barras |
| PUT | `/api/productos/:id` | Modifica datos (no el stock) | Modificar Información del Producto |
| POST | `/api/productos/:id/ingreso` | Suma stock y registra el movimiento | Registrar Ingreso · Actualización de Stock |
| GET | `/api/productos/:id/movimientos` | Historial de movimientos | obtenerTrazabilidad() |

Panel de administración (solo roles con acceso a `/api/admin`):

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/admin/roles` | Roles para asignar |
| GET | `/api/admin/permisos` | Permisos de cada rol |
| PUT | `/api/admin/permisos/:id` | Habilita o deshabilita una opción para un rol |
| GET · POST | `/api/admin/usuarios` | Lista y crea usuarios |
| PUT | `/api/admin/usuarios/:id` | Modifica datos, contraseña, rol, sucursal, caja y estado (activo) |
| GET · POST | `/api/admin/cajas` | Lista (con estado y monto) y crea cajas con su horario |
| PUT · DELETE | `/api/admin/cajas/:id` | Modifica número y horario · elimina la caja |
| GET · POST | `/api/admin/sucursales` | Datos del comercio |
| PUT | `/api/admin/sucursales/:id` | Modifica razón social, domicilio y teléfono |

Caja y ventas (roles con "Facturación y caja"; la lista de ventas también con "Reporte de ventas"):

| Método | Ruta | Qué hace | Caso de uso |
|---|---|---|---|
| GET | `/api/caja` | La caja del usuario, su estado y el efectivo que calcula el sistema | getEstado() |
| POST | `/api/caja/apertura` | Abre la caja con el efectivo declarado (dentro del horario) | abrirCaja() |
| POST | `/api/caja/cierre` | Cierra la caja y devuelve sistema, declarado y diferencia | cerrarCaja() |
| GET | `/api/medios-pago` | Efectivo, Tarjeta, Voucher | — |
| GET | `/api/vouchers/:numero` | Valida un voucher y devuelve su monto | Aplicar Voucher |
| POST | `/api/caja/retiros` | Achique: retira efectivo con motivo | Manejo de efectivo |
| GET | `/api/caja/informes` | Informes de cierre | Cierre de caja |
| POST | `/api/vouchers` | Crea un voucher (efectivo o digital) | Voucher |
| POST | `/api/ventas/:id/anular` | Anula la venta y genera la nota de crédito | Anulación |
| POST | `/api/ventas` | Emite la factura: detalle, pagos, voucher y baja de stock | CU2 Realizar Venta |
| GET | `/api/ventas` | Ventas con detalle y pagos (todas, o las de la caja propia) | Gestión de ventas |

## Probar el escáner sin juguetes

Abrir en la PC las imágenes de `docs/codigos-prueba/` y apuntarles con el celular:

- `2000000000015`, `2000000000022`, `2000000000039`: ya cargados, abre **Ingreso de mercadería**.
- `7798765432107`: no existe, abre **Cargar producto** con el código completado.
