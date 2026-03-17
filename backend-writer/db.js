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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("[DB] Tabla gps_positions lista.");
}

module.exports = { pool, inicializar };
