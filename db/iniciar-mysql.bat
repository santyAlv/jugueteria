@echo off
REM Levanta un MySQL local con los datos en db\mysql-data (sin instalar servicio).
REM La primera vez crea la base vacía y carga schema.sql.
REM Si ya usan otro MySQL (XAMPP, Workbench, servicio MySQL80), no hace falta este script:
REM alcanza con ejecutar schema.sql en ese servidor.

set MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.0\bin
set DATA=%~dp0mysql-data

if not exist "%DATA%" (
  echo Inicializando MySQL en %DATA% ...
  "%MYSQL_BIN%\mysqld.exe" --initialize-insecure --datadir="%DATA%" --console
  start "MySQL Jugueteria" "%MYSQL_BIN%\mysqld.exe" --datadir="%DATA%" --port=3306 --console
  echo Esperando que MySQL arranque...
  timeout /t 15 /nobreak >nul
  "%MYSQL_BIN%\mysql.exe" -u root --default-character-set=utf8mb4 < "%~dp0schema.sql"
  echo Base "jugueteria" creada.
) else (
  start "MySQL Jugueteria" "%MYSQL_BIN%\mysqld.exe" --datadir="%DATA%" --port=3306 --console
)
