require("dotenv").config();

const express = require("express");
const path = require("path");
const { pool, conectar } = require("./db");

const app = express();
const WEB_PORT = 80;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ─── Servir frontend estático ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ─── SSE: lista de clientes conectados ───────────────────────────────────────
const sseClients = [];

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20000);
  sseClients.push(res);
  console.log(`[SSE] Cliente conectado. Total: ${sseClients.length}`);

  req.on("close", () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
    console.log(`[SSE] Cliente desconectado. Total: ${sseClients.length}`);
  });
});

// Polling a la DB cada 10s para detectar nuevos registros y notificar por SSE
let ultimoId = 0;

async function inicializarUltimoId() {
  const result = await pool.query(
    "SELECT id FROM gps_positions ORDER BY id DESC LIMIT 1",
  );
  if (result.rows.length > 0) {
    ultimoId = result.rows[0].id;
  }
}

setInterval(async () => {
  if (sseClients.length === 0) return;
  try {
    const result = await pool.query(
      "SELECT id, timestamp, latitude, longitude FROM gps_positions WHERE id > $1 ORDER BY id ASC",
      [ultimoId],
    );
    for (const row of result.rows) {
      ultimoId = row.id;
      const payload = `data: ${JSON.stringify({
        timestamp: row.timestamp,
        latitude: row.latitude,
        longitude: row.longitude,
      })}\n\n`;
      sseClients.forEach((client) => client.write(payload));
    }
  } catch (err) {
    console.error("[POLL] Error:", err.message);
  }
}, 10000);

// ─── API REST ─────────────────────────────────────────────────────────────────
app.get("/api/latest", async (req, res) => {
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude FROM gps_positions ORDER BY id DESC LIMIT 1",
  );
  res.json(result.rows[0] || null);
});

app.get("/api/history", async (req, res) => {
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude FROM gps_positions ORDER BY id DESC LIMIT 50",
  );
  res.json(result.rows);
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
conectar()
  .then(async () => {
    await inicializarUltimoId();
    app.listen(WEB_PORT, () => {
      console.log(`[WEB] Backend-reader corriendo en puerto ${WEB_PORT}`);
    });
  })
  .catch((err) => {
    console.error("[DB] Error al conectar:", err.message);
  });
