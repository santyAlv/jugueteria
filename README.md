# Sistema de Gestión para Juguetería — Carga de productos

Trabajo Práctico anual 2026 · Modelos y Sistemas 2
Módulo entregado: **carga de productos / Caso de Uso 3 "Registrar Ingreso de Mercadería"**, con lectura de código de barras desde el celular.

Arquitectura (igual al Diagrama de Despliegue del informe):

```
Celular (App Android · Kotlin + CameraX + ML Kit)
        │  HTTP + JSON (WiFi local)
        ▼
PC · API REST (Node.js + Express)  ──SQL──►  MySQL 8 (base "jugueteria")
```

```
jugueteria/
├── db/
│   ├── schema.sql           tablas + datos de prueba
│   └── iniciar-mysql.bat    levanta un MySQL local sin instalar servicio
├── backend/
│   ├── server.js            API REST
│   ├── codigo-barras.js     generación de EAN-13 interno
│   └── codigo-barras.test.js
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
- Node.js 20 o superior
- Android Studio (probado con 2025.3) y un celular Android 7.0+ con cámara
- PC y celular **en la misma red WiFi**

## 1. Base de datos

Opción A — usar el script (crea la base la primera vez):

```bash
db\iniciar-mysql.bat
```

Opción B — si ya tienen un MySQL andando (Workbench, XAMPP, servicio MySQL80): abrir y ejecutar `db/schema.sql`.

> `schema.sql` **borra y vuelve a crear** la base `jugueteria`. Sirve para dejarla limpia antes de la defensa.

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

## 3. App Android

1. Android Studio → **Open** → carpeta `mobile`.
2. Esperar que termine el "Gradle Sync".
3. En el celular activar **Opciones de desarrollador → Depuración USB** y conectarlo.
4. Botón **Run ▶**.

También se puede instalar el APK ya compilado: `mobile/app/build/outputs/apk/debug/app-debug.apk`.

En la pantalla de inicio de sesión, en **Servidor** poner `http://IP-DE-LA-PC:3000`.

## Usuarios de prueba

| Email | Contraseña | Rol | ¿Puede cargar productos? |
|---|---|---|---|
| deposito@jugueteria.com | deposito123 | Deposito | Sí |
| admin@jugueteria.com | admin123 | Administrador | Sí |
| cajero@jugueteria.com | cajero123 | Cajero | No (solo consulta) |

## API REST

Todas las rutas (menos login) piden el header `Authorization: Bearer <token>`.

| Método | Ruta | Qué hace | Caso de uso |
|---|---|---|---|
| POST | `/api/login` | Devuelve token y datos del usuario | CU1 Iniciar sesión |
| GET | `/api/productos` | Lista productos de la sucursal | Gestión de productos |
| GET | `/api/productos/:id` | Un producto | — |
| GET | `/api/productos/codigo/:codigo` | Busca por código de barras (404 si no existe) | Buscar Producto |
| POST | `/api/productos` | Alta + stock inicial + código generado si viene vacío | Registrar Nuevo · Generar Código de Barras |
| PUT | `/api/productos/:id` | Modifica datos (no el stock) | Modificar Información del Producto |
| POST | `/api/productos/:id/ingreso` | Suma stock y registra el movimiento | Registrar Ingreso · Actualización de Stock |
| GET | `/api/productos/:id/movimientos` | Historial de movimientos | obtenerTrazabilidad() |

## Probar el escáner sin juguetes

Abrir en la PC las imágenes de `docs/codigos-prueba/` y apuntarles con el celular:

- `2000000000015`, `2000000000022`, `2000000000039`: ya cargados, abre **Ingreso de mercadería**.
- `7798765432107`: no existe, abre **Cargar producto** con el código completado.
