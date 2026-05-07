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
app.get("/api/vehicles", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT vehicle_id FROM gps_positions WHERE vehicle_id IS NOT NULL ORDER BY vehicle_id"
    );
    res.json(result.rows.map((r) => r.vehicle_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/latest", async (req, res) => {
  const { vehicle_id } = req.query;
  const query = vehicle_id
    ? "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage, vehicle_id FROM gps_positions WHERE vehicle_id = $1 ORDER BY id DESC LIMIT 1"
    : "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage, vehicle_id FROM gps_positions ORDER BY id DESC LIMIT 1";
  const params = vehicle_id ? [parseInt(vehicle_id)] : [];
  const result = await pool.query(query, params);
  res.json(result.rows[0] || null);
});

app.get("/api/history", async (req, res) => {
  const { vehicle_id } = req.query;
  const query = vehicle_id
    ? "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage, vehicle_id FROM gps_positions WHERE vehicle_id = $1 ORDER BY id DESC LIMIT 1"
    : "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage, vehicle_id FROM gps_positions ORDER BY id DESC LIMIT 1";
  const params = vehicle_id ? [parseInt(vehicle_id)] : [];
  const result = await pool.query(query, params);
  res.json(result.rows);
});

app.get("/api/history/range", async (req, res) => {
  const { start, end, vehicle_id } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: "start y end son requeridos" });
  }
  let query, params;
  if (vehicle_id) {
    query =
      "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage, vehicle_id FROM gps_positions WHERE timestamp BETWEEN $1 AND $2 AND vehicle_id = $3 ORDER BY timestamp ASC";
    params = [start, end, parseInt(vehicle_id)];
  } else {
    query =
      "SELECT timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage, vehicle_id FROM gps_positions WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp ASC";
    params = [start, end];
  }
  const result = await pool.query(query, params);
  res.json(result.rows);
});

// ─── Servidor UDP ─────────────────────────────────────────────────────────────
const udpServer = dgram.createSocket("udp4");

udpServer.on("message", async (msg, rinfo) => {
  const raw = msg.toString().trim();
  console.log(`[UDP] Paquete de ${rinfo.address}:${rinfo.port} -> ${raw}`);

  const partes = raw.split(",");

  // Formatos aceptados:
  //   8 campos: vehicle_id,timestamp,lat,lon,rpm,temp,fuel_trim,o2    (principal)
  //   7 campos: timestamp,lat,lon,rpm,temp,fuel_trim,o2               (legacy sin vehicle_id)
  //   3 campos: timestamp,lat,lon                                     (legacy GPS only)
  if (![3, 7, 8].includes(partes.length)) {
    console.warn("[UDP] Formato invalido, se esperaban 3, 7 u 8 campos.");
    return;
  }

  let timestamp, latitude, longitude;
  let rpm = null, temperatura = null, fuelTrim = null, o2Voltage = null, vehicleId = null;

  if (partes.length === 8) {
    // vehicle_id,timestamp,lat,lon,rpm,temp,fuel_trim,o2
    const v = parseInt(partes[0]);
    vehicleId   = isNaN(v) ? null : v;
    timestamp   = parseInt(partes[1]);
    latitude    = parseFloat(partes[2]);
    longitude   = parseFloat(partes[3]);
    rpm         = parseInt(partes[4]);    if (isNaN(rpm))         rpm         = null;
    temperatura = parseInt(partes[5]);    if (isNaN(temperatura)) temperatura = null;
    fuelTrim    = parseFloat(partes[6]);  if (isNaN(fuelTrim))    fuelTrim    = null;
    o2Voltage   = parseFloat(partes[7]);  if (isNaN(o2Voltage))   o2Voltage   = null;
  } else if (partes.length === 7) {
    // timestamp,lat,lon,rpm,temp,fuel_trim,o2  (legacy)
    timestamp   = parseInt(partes[0]);
    latitude    = parseFloat(partes[1]);
    longitude   = parseFloat(partes[2]);
    rpm         = parseInt(partes[3]);    if (isNaN(rpm))         rpm         = null;
    temperatura = parseInt(partes[4]);    if (isNaN(temperatura)) temperatura = null;
    fuelTrim    = parseFloat(partes[5]);  if (isNaN(fuelTrim))    fuelTrim    = null;
    o2Voltage   = parseFloat(partes[6]);  if (isNaN(o2Voltage))   o2Voltage   = null;
  } else {
    // timestamp,lat,lon  (legacy GPS only)
    timestamp   = parseInt(partes[0]);
    latitude    = parseFloat(partes[1]);
    longitude   = parseFloat(partes[2]);
  }

  if (isNaN(timestamp) || isNaN(latitude) || isNaN(longitude)) {
    console.warn("[UDP] Datos no numericos, paquete descartado.");
    return;
  }

  await pool.query(
    "INSERT INTO gps_positions (timestamp, latitude, longitude, rpm, temperatura, fuel_trim, o2_voltage, vehicle_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [timestamp, latitude, longitude, rpm, temperatura, fuelTrim, o2Voltage, vehicleId]
  );

  console.log(
    `[DB] Insertado: ts=${timestamp} lat=${latitude} lon=${longitude} rpm=${rpm} temp=${temperatura} fuel=${fuelTrim} o2=${o2Voltage} vid=${vehicleId}`
  );

  emitir({ timestamp, latitude, longitude, rpm, temperatura, fuel_trim: fuelTrim, o2_voltage: o2Voltage, vehicle_id: vehicleId });
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
