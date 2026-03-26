require("dotenv").config();
const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { pool, conectar } = require("./db");

const app = express();
const WEB_PORT = process.env.WEB_PORT;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ─── Servir frontend estático ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../public")));

// ─── API Config ───────────────────────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  res.json({ title: process.env.TITLE_NAME });
});

// ─── SSE: lista de clientes conectados ───────────────────────────────────────
const sseClients = [];

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  sseClients.push(res);
  console.log(`[SSE] Cliente conectado. Total: ${sseClients.length}`);
  req.on("close", () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
    console.log(`[SSE] Cliente desconectado. Total: ${sseClients.length}`);
  });
});

function emitir(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => client.write(payload));
}

// ─── Polling cada 2 segundos ──────────────────────────────────────────────────
let ultimoId = 0;

async function polling() {
  try {
    const result = await pool.query(
      "SELECT id, timestamp, latitude, longitude FROM gps_positions ORDER BY id DESC LIMIT 1"
    );
    if (result.rows.length === 0) return;
    const row = result.rows[0];
    if (row.id > ultimoId) {
      ultimoId = row.id;
      console.log(`[POLL] Nuevo dato id=${row.id} lat=${row.latitude} lon=${row.longitude}`);
      emitir(row);
    }
  } catch (err) {
    console.error("[POLL] Error:", err.message);
  }
}

// ─── API REST ─────────────────────────────────────────────────────────────────
app.get("/api/latest", async (req, res) => {
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude FROM gps_positions ORDER BY id DESC LIMIT 1"
  );
  res.json(result.rows[0] || null);
});

app.get("/api/history", async (req, res) => {
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude FROM gps_positions ORDER BY id DESC LIMIT 1"
  );
  res.json(result.rows);
});

app.get("/api/history/range", async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: "start y end son requeridos" });
  }
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude FROM gps_positions WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp ASC",
    [start, end]
  );
  res.json(result.rows);
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
conectar()
  .then(() => {
    // Inicializar ultimoId con el último registro actual
    pool.query("SELECT id FROM gps_positions ORDER BY id DESC LIMIT 1")
      .then((r) => {
        if (r.rows.length > 0) {
          ultimoId = r.rows[0].id;
          console.log(`[POLL] ultimoId inicializado en ${ultimoId}`);
        }
      });

    // Arrancar polling cada 2 segundos
    setInterval(polling, 2000);
    console.log("[POLL] Polling iniciado cada 2 segundos");

    if (process.env.CERT_PATH) {
      const options = {
        key: fs.readFileSync(`${process.env.CERT_PATH}/privkey.pem`),
        cert: fs.readFileSync(`${process.env.CERT_PATH}/fullchain.pem`),
      };
      https.createServer(options, app).listen(WEB_PORT, () => {
        console.log(`[WEB] Backend-reader corriendo en puerto ${WEB_PORT} HTTPS`);
      });
    } else {
      app.listen(WEB_PORT, () => {
        console.log(`[WEB] Backend-reader corriendo en puerto ${WEB_PORT}`);
      });
    }
  })
  .catch((err) => {
    console.error("[DB] Error al conectar:", err.message);
  });