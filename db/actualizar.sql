-- Actualiza una base "jugueteria" creada con el schema.sql anterior (solo carga de productos)
-- a la versión con panel de administración, caja y ventas, SIN borrar lo que ya está cargado.
-- Se puede ejecutar más de una vez: cada paso se saltea si ya está hecho.
-- Para una base nueva o para dejarla limpia se sigue usando schema.sql.

USE jugueteria;

-- ---------------------------------------------------------------------------
-- Tablas nuevas (las mismas definiciones que schema.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acceso_roles (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  rol_id        INT NOT NULL,
  nombre_opcion VARCHAR(150) NOT NULL,
  ruta_script   VARCHAR(150) NOT NULL,
  visible       TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (rol_id) REFERENCES roles(id),
  UNIQUE (rol_id, ruta_script)
);

CREATE TABLE IF NOT EXISTS cajas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  numero_caja   VARCHAR(50) NOT NULL,
  sucursal_id   INT NOT NULL,
  usuario_id    INT NULL,
  estado        VARCHAR(20) NOT NULL DEFAULT 'CERRADA',
  hora_apertura TIME NOT NULL,
  hora_cierre   TIME NOT NULL,
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id),
  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id),
  UNIQUE (sucursal_id, numero_caja),
  CHECK (estado IN ('ABIERTA', 'CERRADA')),
  CHECK (hora_apertura < hora_cierre)
);

-- usuarios: baja lógica y clave foránea de la caja asignada.
-- MySQL no tiene "ADD COLUMN IF NOT EXISTS": se arma la sentencia solo si la columna falta.
SET @falta = (SELECT COUNT(*) = 0 FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'activo');
SET @sql = IF(@falta,
  'ALTER TABLE usuarios ADD COLUMN activo TINYINT NOT NULL DEFAULT 1, ADD FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE SET NULL',
  'DO 0');
PREPARE paso FROM @sql;
EXECUTE paso;
DEALLOCATE PREPARE paso;

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  caja_id         INT NOT NULL,
  usuario_id      INT NOT NULL,
  tipo            VARCHAR(20) NOT NULL,
  monto_sistema   DECIMAL(10,2) NOT NULL,
  monto_declarado DECIMAL(10,2) NOT NULL,
  diferencia      DECIMAL(10,2) AS (monto_declarado - monto_sistema) STORED,
  fecha_hora      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (caja_id)    REFERENCES cajas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CHECK (tipo IN ('APERTURA', 'CIERRE')),
  CHECK (monto_declarado >= 0)
);

CREATE TABLE IF NOT EXISTS facturas (
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

CREATE TABLE IF NOT EXISTS detalle_factura (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  factura_id      INT NOT NULL,
  producto_id     INT NOT NULL,
  cantidad        INT NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal        DECIMAL(10,2) AS (cantidad * precio_unitario) STORED,
  FOREIGN KEY (factura_id)  REFERENCES facturas(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  CHECK (cantidad > 0)
);

CREATE TABLE IF NOT EXISTS medios_pago (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS vouchers (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  numero_referencia VARCHAR(50) NOT NULL UNIQUE,
  monto_precargado  DECIMAL(10,2) NOT NULL,
  estado            VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE',
  CHECK (estado IN ('DISPONIBLE', 'USADO')),
  CHECK (monto_precargado > 0)
);

CREATE TABLE IF NOT EXISTS pagos (
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
-- Datos iniciales de los módulos nuevos (INSERT IGNORE: lo que ya existe no se toca)
-- ---------------------------------------------------------------------------
-- Roles: 1 Administrador · 2 Gerente · 3 Cajero · 4 Deposito
INSERT IGNORE INTO acceso_roles (nombre_opcion, ruta_script, rol_id, visible) VALUES
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

INSERT IGNORE INTO medios_pago (nombre) VALUES ('Efectivo'), ('Tarjeta'), ('Voucher');

INSERT IGNORE INTO vouchers (numero_referencia, monto_precargado) VALUES
  ('REGALO-5000', 5000.00),
  ('REGALO-20000', 20000.00),
  ('REGALO-50000', 50000.00);

INSERT IGNORE INTO cajas (numero_caja, sucursal_id, hora_apertura, hora_cierre)
VALUES ('1', 1, '07:00', '23:00');

-- Usuario de prueba para el rol Gerente (contraseña: gerente123)
INSERT IGNORE INTO usuarios (nombre_usuario, email, password_hash, rol_id, sucursal_id)
VALUES ('gerente', 'gerente@jugueteria.com', '$2b$10$aPcxP8MTKsYa2uRhiDhGPOVp4mTLrpJhGvYc8NqIjoeXb6hK1Oi.q', 2, 1);

-- El cajero de prueba queda en la caja 1, como en schema.sql
UPDATE usuarios SET caja_id = (SELECT id FROM cajas WHERE sucursal_id = 1 AND numero_caja = '1')
 WHERE email = 'cajero@jugueteria.com' AND caja_id IS NULL;
