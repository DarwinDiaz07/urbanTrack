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
  res.json({
    title: process.env.TITLE_NAME || "GPS Tracker"
  });
});

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

function emitir(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => client.write(payload));
}

async function escucharDB() {
  const client = await pool.connect();
  await client.query("LISTEN gps_update");
  console.log("[LISTEN] Escuchando notificaciones de PostgreSQL...");
  client.on("notification", (msg) => {
    const data = JSON.parse(msg.payload);
    console.log(`[NOTIFY] Nuevo dato: ${msg.payload}`);
    emitir(data);
  });
  client.on("error", (err) => {
    console.error("[LISTEN] Error:", err.message);
    setTimeout(escucharDB, 5000);
  });
}

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
    await escucharDB();
    if (process.env.CERT_PATH) {
      const options = {
        key: fs.readFileSync(`${process.env.CERT_PATH}/privkey.pem`),
        cert: fs.readFileSync(`${process.env.CERT_PATH}/fullchain.pem`)
      };
      https.createServer(options, app).listen(443, () => {
        console.log(`[WEB] Backend-reader corriendo en puerto 443 HTTPS`);
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