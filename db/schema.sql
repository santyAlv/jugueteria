-- Sistema de Gestión para Juguetería
-- Módulos: Carga de productos / Ingreso de mercadería, Panel de administración, Caja y Ventas
-- Tablas tomadas del Diagrama de Clases y del DER del informe.
-- Falta retiros_efectivo: se agrega con su módulo.

DROP DATABASE IF EXISTS jugueteria;
CREATE DATABASE jugueteria CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;
USE jugueteria;

CREATE TABLE sucursales (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  razon_social VARCHAR(100) NOT NULL,
  domicilio    VARCHAR(150),
  telefono     VARCHAR(50)
);

CREATE TABLE roles (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

-- Permisos: qué opciones del sistema puede usar cada rol (usuarios.tieneAcceso)
CREATE TABLE acceso_roles (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  rol_id        INT NOT NULL,
  nombre_opcion VARCHAR(150) NOT NULL,
  ruta_script   VARCHAR(150) NOT NULL,
  visible       TINYINT NOT NULL DEFAULT 1, -- 0 = opción deshabilitada para ese rol
  FOREIGN KEY (rol_id) REFERENCES roles(id),
  UNIQUE (rol_id, ruta_script)
);

-- Cajas disponibles para la venta
CREATE TABLE cajas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  numero_caja   VARCHAR(50) NOT NULL,
  sucursal_id   INT NOT NULL,
  usuario_id    INT NULL, -- quién la tiene abierta: lo completa abrirCaja() en el módulo de Caja
  estado        VARCHAR(20) NOT NULL DEFAULT 'CERRADA',
  -- Horario de atención que configura el administrador (no está en el Diagrama de Clases)
  hora_apertura TIME NOT NULL,
  hora_cierre   TIME NOT NULL,
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
  UNIQUE (sucursal_id, numero_caja),
  CHECK (estado IN ('ABIERTA', 'CERRADA')),
  CHECK (hora_apertura < hora_cierre)
);

CREATE TABLE usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nombre_usuario VARCHAR(50)  NOT NULL UNIQUE,
  email          VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  rol_id         INT NOT NULL,
  sucursal_id    INT NOT NULL,
  caja_id        INT NULL, -- caja asignada al cajero (asignarCaja)
  -- Baja lógica (no está en el Diagrama de Clases): no se borra para no perder la trazabilidad
  activo         TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (rol_id)      REFERENCES roles(id),
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
  FOREIGN KEY (caja_id)     REFERENCES cajas(id) ON DELETE SET NULL
);

ALTER TABLE cajas ADD FOREIGN KEY (usuario_id) REFERENCES usuarios(id);

CREATE TABLE productos (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nombre              VARCHAR(50) NOT NULL,
  -- calcularPrecioVenta(): lo calcula el propio MySQL, nunca queda desactualizado
  precio              DECIMAL(10,2) AS (ROUND(precio_ingreso * (1 + porcentaje_ganancia / 100) * (1 + iva / 100), 2)) STORED,
  stock               INT NOT NULL DEFAULT 0,
  codigo_barras       VARCHAR(50) UNIQUE,
  precio_ingreso      DECIMAL(10,2) NOT NULL,
  porcentaje_ganancia DECIMAL(5,2)  NOT NULL,
  iva                 DECIMAL(5,2)  NOT NULL DEFAULT 21.00,
  sucursal_id         INT NOT NULL,
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
  CHECK (stock >= 0),
  CHECK (precio_ingreso >= 0),
  CHECK (porcentaje_ganancia >= 0),
  CHECK (iva BETWEEN 0 AND 100)
);

-- Trazabilidad: el stock solo cambia a través de un movimiento
CREATE TABLE movimientos_stock (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  producto_id     INT NOT NULL,
  usuario_id      INT NOT NULL,
  tipo_movimiento VARCHAR(20) NOT NULL,
  cantidad        INT NOT NULL,
  fecha_hora      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id),
  CHECK (tipo_movimiento IN ('INGRESO', 'EGRESO')),
  CHECK (cantidad > 0)
);

-- Apertura y cierre de caja: lo que el sistema calcula contra lo que declara el cajero
CREATE TABLE caja_movimientos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  caja_id         INT NOT NULL,
  usuario_id      INT NOT NULL,
  tipo            VARCHAR(20) NOT NULL,
  monto_sistema   DECIMAL(10,2) NOT NULL,
  monto_declarado DECIMAL(10,2) NOT NULL,
  -- calcularDiferencia(): positivo = sobrante, negativo = faltante
  diferencia      DECIMAL(10,2) AS (monto_declarado - monto_sistema) STORED,
  -- Con microsegundos: el arqueo separa las ventas de antes y de después de cada apertura
  fecha_hora      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (caja_id)    REFERENCES cajas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CHECK (tipo IN ('APERTURA', 'CIERRE')),
  CHECK (monto_declarado >= 0)
);

CREATE TABLE facturas (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  caja_id    INT NOT NULL,
  fecha_hora DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  total      DECIMAL(10,2) NOT NULL,
  estado     VARCHAR(20) NOT NULL DEFAULT 'EMITIDA',
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (caja_id)    REFERENCES cajas(id),
  CHECK (estado IN ('EMITIDA', 'ANULADA'))
);

CREATE TABLE detalle_factura (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  factura_id      INT NOT NULL,
  producto_id     INT NOT NULL,
  cantidad        INT NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL, -- el precio del momento de la venta
  subtotal        DECIMAL(10,2) AS (cantidad * precio_unitario) STORED, -- calcularSubtotal()
  FOREIGN KEY (factura_id)  REFERENCES facturas(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  CHECK (cantidad > 0)
);

CREATE TABLE medios_pago (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE vouchers (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  numero_referencia VARCHAR(50) NOT NULL UNIQUE,
  monto_precargado  DECIMAL(10,2) NOT NULL,
  estado            VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
  CHECK (estado IN ('DISPONIBLE', 'USADO')),
  CHECK (monto_precargado > 0)
);

CREATE TABLE pagos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  factura_id    INT NOT NULL,
  medio_pago_id INT NOT NULL,
  monto         DECIMAL(10,2) NOT NULL,
  voucher_id    INT NULL,
  FOREIGN KEY (factura_id)    REFERENCES facturas(id),
  FOREIGN KEY (medio_pago_id) REFERENCES medios_pago(id),
  FOREIGN KEY (voucher_id)    REFERENCES vouchers(id),
  CHECK (monto > 0)
);

-- ---------------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------------
INSERT INTO sucursales (razon_social, domicilio, telefono)
VALUES ('Juguetería Central', 'Av. Siempre Viva 742', '11-4444-5555');

-- Actores del Caso de Uso 1
INSERT INTO roles (nombre) VALUES ('Administrador'), ('Gerente'), ('Cajero'), ('Deposito');

-- Una fila por rol y por opción; ruta_script es la ruta de la API que habilita.
-- El administrador prende y apaga `visible` desde la pantalla Permisos.
-- Roles: 1 Administrador · 2 Gerente · 3 Cajero · 4 Deposito
INSERT INTO acceso_roles (nombre_opcion, ruta_script, rol_id, visible) VALUES
  ('Panel de administración', '/api/admin',     1, 1),
  ('Panel de administración', '/api/admin',     2, 0),
  ('Panel de administración', '/api/admin',     3, 0),
  ('Panel de administración', '/api/admin',     4, 0),
  ('Carga de productos',      '/api/productos', 1, 1),
  ('Carga de productos',      '/api/productos', 2, 1),
  ('Carga de productos',      '/api/productos', 3, 0),
  ('Carga de productos',      '/api/productos', 4, 1),
  ('Facturación y caja',      '/api/ventas',    1, 1),
  ('Facturación y caja',      '/api/ventas',    2, 0),
  ('Facturación y caja',      '/api/ventas',    3, 1),
  ('Facturación y caja',      '/api/ventas',    4, 0),
  ('Reporte de ventas',       '/api/reportes',  1, 1),
  ('Reporte de ventas',       '/api/reportes',  2, 1),
  ('Reporte de ventas',       '/api/reportes',  3, 0),
  ('Reporte de ventas',       '/api/reportes',  4, 0);

INSERT INTO medios_pago (nombre) VALUES ('Efectivo'), ('Tarjeta'), ('Voucher');

-- Vouchers de regalo para probar el pago con voucher
INSERT INTO vouchers (numero_referencia, monto_precargado) VALUES
  ('REGALO-5000', 5000.00),
  ('REGALO-20000', 20000.00),
  ('REGALO-50000', 50000.00);

-- El horario es amplio para poder abrir la caja en cualquier demo: se cambia desde el panel
INSERT INTO cajas (numero_caja, sucursal_id, hora_apertura, hora_cierre)
VALUES ('1', 1, '07:00', '23:00');

-- Contraseñas: admin123 / deposito123 / cajero123 / gerente123 (hash bcrypt)
INSERT INTO usuarios (nombre_usuario, email, password_hash, rol_id, sucursal_id, caja_id) VALUES
  ('admin',    'admin@jugueteria.com',    '$2b$10$Dk23j8lrUeTy7dUuh2mbZuzlBy8iOikaELH51sTys.TdiPETyyVNy', 1, 1, NULL),
  ('deposito', 'deposito@jugueteria.com', '$2b$10$j4.NnuZsrUx/F0i1Ztm8pe0CVGfopwTGat0QfaYcSO17u1YnQ0NQO', 4, 1, NULL),
  ('cajero',   'cajero@jugueteria.com',   '$2b$10$QLc7LhCyPpbitSOlaNT1Ree/anacykS1domXMDksU38Yumjq5W38u', 3, 1, 1),
  ('gerente',  'gerente@jugueteria.com',  '$2b$10$aPcxP8MTKsYa2uRhiDhGPOVp4mTLrpJhGvYc8NqIjoeXb6hK1Oi.q', 2, 1, NULL);

INSERT INTO productos (nombre, codigo_barras, precio_ingreso, porcentaje_ganancia, iva, sucursal_id, stock) VALUES
  ('Tren de madera',       '2000000000015', 8000.00, 60.00, 21.00, 1, 12),
  ('Apilable de aros',     '2000000000022', 3500.00, 50.00, 21.00, 1, 20),
  ('Elefante de encastre', '2000000000039', 5200.00, 55.00, 21.00, 1, 7);

INSERT INTO movimientos_stock (producto_id, usuario_id, tipo_movimiento, cantidad) VALUES
  (1, 2, 'INGRESO', 12),
  (2, 2, 'INGRESO', 20),
  (3, 2, 'INGRESO', 7);
