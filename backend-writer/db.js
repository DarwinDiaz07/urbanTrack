const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function inicializar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gps_positions (
      id         SERIAL PRIMARY KEY,
      timestamp  BIGINT NOT NULL,
      latitude   DOUBLE PRECISION NOT NULL,
      longitude  DOUBLE PRECISION NOT NULL,
      rpm        INTEGER,
      temperatura INTEGER,
      fuel_trim  REAL,
      o2_voltage REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Agregar columnas si no existen (para tablas ya creadas)
  await pool.query(`ALTER TABLE gps_positions ADD COLUMN IF NOT EXISTS rpm INTEGER`);
  await pool.query(`ALTER TABLE gps_positions ADD COLUMN IF NOT EXISTS temperatura INTEGER`);
  await pool.query(`ALTER TABLE gps_positions ADD COLUMN IF NOT EXISTS fuel_trim REAL`);
  await pool.query(`ALTER TABLE gps_positions ADD COLUMN IF NOT EXISTS o2_voltage REAL`);

  console.log("[DB] Tabla gps_positions lista (con columnas OBD-II).");
}

module.exports = { pool, inicializar };