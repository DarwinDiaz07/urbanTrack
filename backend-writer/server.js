require("dotenv").config();
const express = require("express");
const https = require("https");
const fs = require("fs");
const dgram = require("dgram");
const path = require("path");
const { pool, inicializar } = require("./db");

const app = express();
const UDP_PORT = process.env.UDP_PORT;
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
    title: process.env.TITLE_NAME || "GPS Tracker",
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

// ─── Servidor UDP ─────────────────────────────────────────────────────────────
const udpServer = dgram.createSocket("udp4");

udpServer.on("message", async (msg, rinfo) => {
  const raw = msg.toString().trim();
  console.log(`[UDP] Paquete de ${rinfo.address}:${rinfo.port} -> ${raw}`);

  const partes = raw.split(",");
  if (partes.length !== 3) {
    console.warn("[UDP] Formato invalido, se esperaban 3 campos.");
    return;
  }

  const timestamp = parseInt(partes[0]);
  const latitude = parseFloat(partes[1]);
  const longitude = parseFloat(partes[2]);

  if (isNaN(timestamp) || isNaN(latitude) || isNaN(longitude)) {
    console.warn("[UDP] Datos no numericos, paquete descartado.");
    return;
  }

  await pool.query(
    "INSERT INTO gps_positions (timestamp, latitude, longitude) VALUES ($1, $2, $3)",
    [timestamp, latitude, longitude],
  );

  console.log(
    `[DB] Insertado: timestamp=${timestamp} lat=${latitude} lon=${longitude}`,
  );

  await pool.query("SELECT pg_notify('gps_update', $1)", [
    JSON.stringify({ timestamp, latitude, longitude }),
  ]);

  emitir({ timestamp, latitude, longitude });
});

udpServer.on("error", (err) => {
  console.error(`[UDP] Error: ${err.message}`);
  udpServer.close();
});

udpServer.bind(UDP_PORT, () => {
  console.log(`[UDP] Escuchando en puerto ${UDP_PORT}`);
});

// ─── Iniciar servidor web ─────────────────────────────────────────────────────
inicializar()
  .then(() => {
    if (process.env.CERT_PATH) {
      const options = {
        key: fs.readFileSync(`${process.env.CERT_PATH}/privkey.pem`),
        cert: fs.readFileSync(`${process.env.CERT_PATH}/fullchain.pem`),
      };
      https.createServer(options, app).listen(WEB_PORT, () => {
        console.log(`[WEB] Backend-writer corriendo en puerto 443 HTTPS`);
      });
    } else {
      app.listen(WEB_PORT, () => {
        console.log(`[WEB] Backend-writer corriendo en puerto ${WEB_PORT}`);
      });
    }
  })
  .catch((err) => {
    console.error("[DB] Error al conectar:", err.message);
  });
