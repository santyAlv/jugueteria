-- Sistema de Gestión para Juguetería - Módulo: Carga de productos / Ingreso de mercadería
-- Tablas tomadas del Diagrama de Clases y del DER del informe.
-- Solo se crean las tablas que usa este módulo; cajas, facturas, pagos, etc.
-- se agregan con sus respectivos módulos.

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

CREATE TABLE usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nombre_usuario VARCHAR(50)  NOT NULL UNIQUE,
  email          VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  rol_id         INT NOT NULL,
  sucursal_id    INT NOT NULL,
  caja_id        INT NULL, -- la FK a cajas(id) se agrega con el módulo de Caja
  FOREIGN KEY (rol_id)      REFERENCES roles(id),
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id)
);

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

-- ---------------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------------
INSERT INTO sucursales (razon_social, domicilio, telefono)
VALUES ('Juguetería Central', 'Av. Siempre Viva 742', '11-4444-5555');

-- Actores del Caso de Uso 1
INSERT INTO roles (nombre) VALUES ('Administrador'), ('Gerente'), ('Cajero'), ('Deposito');

-- Contraseñas: admin123 / deposito123 / cajero123 (hash bcrypt)
INSERT INTO usuarios (nombre_usuario, email, password_hash, rol_id, sucursal_id) VALUES
  ('admin',    'admin@jugueteria.com',    '$2b$10$Dk23j8lrUeTy7dUuh2mbZuzlBy8iOikaELH51sTys.TdiPETyyVNy', 1, 1),
  ('deposito', 'deposito@jugueteria.com', '$2b$10$j4.NnuZsrUx/F0i1Ztm8pe0CVGfopwTGat0QfaYcSO17u1YnQ0NQO', 4, 1),
  ('cajero',   'cajero@jugueteria.com',   '$2b$10$QLc7LhCyPpbitSOlaNT1Ree/anacykS1domXMDksU38Yumjq5W38u', 3, 1);

INSERT INTO productos (nombre, codigo_barras, precio_ingreso, porcentaje_ganancia, iva, sucursal_id, stock) VALUES
  ('Tren de madera',       '2000000000015', 8000.00, 60.00, 21.00, 1, 12),
  ('Apilable de aros',     '2000000000022', 3500.00, 50.00, 21.00, 1, 20),
  ('Elefante de encastre', '2000000000039', 5200.00, 55.00, 21.00, 1, 7);

INSERT INTO movimientos_stock (producto_id, usuario_id, tipo_movimiento, cantidad) VALUES
  (1, 2, 'INGRESO', 12),
  (2, 2, 'INGRESO', 20),
  (3, 2, 'INGRESO', 7);
