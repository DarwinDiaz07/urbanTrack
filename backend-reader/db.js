const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function conectar() {
  await pool.query("SELECT 1");
  console.log("[DB] Conexion a PostgreSQL establecida.");
}

module.exports = { pool, conectar };
