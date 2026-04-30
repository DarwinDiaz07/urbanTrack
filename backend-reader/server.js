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

// ─── SSE ──────────────────────────────────────────────────────────────────────
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
      "SELECT id, timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage FROM gps_positions ORDER BY id DESC LIMIT 1"
    );
    if (result.rows.length === 0) return;
    const row = result.rows[0];
    if (row.id > ultimoId) {
      ultimoId = row.id;
      console.log(`[POLL] Nuevo dato id=${row.id} lat=${row.latitude} lon=${row.longitude} rpm=${row.rpm}`);
      emitir(row);
    }
  } catch (err) {
    console.error("[POLL] Error:", err.message);
  }
}

// ─── API REST ─────────────────────────────────────────────────────────────────
app.get("/api/latest", async (req, res) => {
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage FROM gps_positions ORDER BY id DESC LIMIT 1"
  );
  res.json(result.rows[0] || null);
});

app.get("/api/history", async (req, res) => {
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage FROM gps_positions ORDER BY id DESC LIMIT 1"
  );
  res.json(result.rows);
});

app.get("/api/history/range", async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: "start y end son requeridos" });
  }
  const result = await pool.query(
    "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage FROM gps_positions WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp ASC",
    [start, end]
  );
  res.json(result.rows);
});

app.get("/api/history/near", async (req, res) => {
  const { lat, lon, radius, start, end } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "lat y lon son requeridos" });
  }
  const r = parseFloat(radius) || 100;
  const delta = r / 111320;
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  let query = `
    SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage
    FROM gps_positions
    WHERE latitude BETWEEN $1 AND $2
      AND longitude BETWEEN $3 AND $4
  `;
  const params = [latNum - delta, latNum + delta, lonNum - delta, lonNum + delta];

  if (start && end) {
    query += ` AND timestamp BETWEEN $5 AND $6`;
    params.push(start, end);
  }

  query += ` ORDER BY timestamp DESC`;

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
conectar()
  .then(() => {
    pool.query("SELECT id FROM gps_positions ORDER BY id DESC LIMIT 1")
      .then((r) => {
        if (r.rows.length > 0) {
          ultimoId = r.rows[0].id;
          console.log(`[POLL] ultimoId inicializado en ${ultimoId}`);
        }
      });

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