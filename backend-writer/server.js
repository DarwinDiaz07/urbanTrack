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
  res.json({ title: process.env.TITLE_NAME });
});

// ─── SSE ──────────────────────────────────────────────────────────────────────
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

// ─── Servidor UDP ─────────────────────────────────────────────────────────────
const udpServer = dgram.createSocket("udp4");

udpServer.on("message", async (msg, rinfo) => {
  const raw = msg.toString().trim();
  console.log(`[UDP] Paquete de ${rinfo.address}:${rinfo.port} -> ${raw}`);

  const partes = raw.split(",");

  // Aceptar 3 campos (legacy) o 7 campos (con OBD-II)
  if (partes.length !== 3 && partes.length !== 7) {
    console.warn("[UDP] Formato invalido, se esperaban 3 o 7 campos.");
    return;
  }

  const timestamp = parseInt(partes[0]);
  const latitude = parseFloat(partes[1]);
  const longitude = parseFloat(partes[2]);

  if (isNaN(timestamp) || isNaN(latitude) || isNaN(longitude)) {
    console.warn("[UDP] Datos no numericos, paquete descartado.");
    return;
  }

  let rpm = null;
  let temperatura = null;
  let fuelTrim = null;
  let o2Voltage = null;

  if (partes.length === 7) {
    rpm = parseInt(partes[3]);
    temperatura = parseInt(partes[4]);
    fuelTrim = parseFloat(partes[5]);
    o2Voltage = parseFloat(partes[6]);

    if (isNaN(rpm)) rpm = null;
    if (isNaN(temperatura)) temperatura = null;
    if (isNaN(fuelTrim)) fuelTrim = null;
    if (isNaN(o2Voltage)) o2Voltage = null;
  }

  await pool.query(
    "INSERT INTO gps_positions (timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [timestamp, latitude, longitude, rpm, temperatura, fuelTrim, o2Voltage]
  );

  console.log(
    `[DB] Insertado: ts=${timestamp} lat=${latitude} lon=${longitude} rpm=${rpm} temp=${temperatura} fuel=${fuelTrim} o2=${o2Voltage}`
  );

  const data = { timestamp, latitude, longitude, rpm, temperatura, fuel_trim: fuelTrim, o2_voltage: o2Voltage };
  emitir(data);
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
        console.log(`[WEB] Backend-writer corriendo en puerto ${WEB_PORT} HTTPS`);
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