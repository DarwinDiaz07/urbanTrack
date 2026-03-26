// ─── Zona horaria Bogota ──────────────────────────────────────────────────────
const ZONA = "America/Bogota";

function tsAFecha(ts) {
  return new Date(Number(ts))
    .toLocaleDateString("es-CO", {
      timeZone: ZONA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/")
    .reverse()
    .join("-");
}

function tsAHora(ts) {
  return new Date(Number(ts)).toLocaleTimeString("es-CO", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ─── Mapa Leaflet ─────────────────────────────────────────────────────────────
const mapa = L.map("mapa").setView([4.5709, -74.2973], 6);
let marcador = null;
let polilinea = null;
let ultimoPunto = null;
const coordenadas = [];

// OpenStreetMap tiles
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 14,
}).addTo(mapa);

// Yellow circle marker icon
const taxiIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="12" fill="#1A1A1A" stroke="#FFD700" stroke-width="3"/>
    <circle cx="14" cy="14" r="5" fill="#FFD700"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// ─── OSRM: obtener ruta real por calles ───────────────────────────────────────
async function obtenerRutaOSRM(desde, hasta) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${desde[1]},${desde[0]};${hasta[1]},${hasta[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes.length) return null;
    // Devuelve array de [lat, lon]
    return data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  } catch (err) {
    console.warn("[OSRM] Error al consultar ruta:", err);
    return null;
  }
}

// ─── Mover marcador y extender polilínea por calles ──────────────────────────
async function moverMarcador(lat, lon) {
  if (marcador) {
    marcador.setLatLng([lat, lon]);
  } else {
    marcador = L.marker([lat, lon], { icon: taxiIcon }).addTo(mapa);
  }
  mapa.setView([lat, lon]);

  const puntoActual = [lat, lon];

  if (ultimoPunto) {
    // Consultar OSRM para obtener la ruta real entre el punto anterior y el actual
    const rutaCalles = await obtenerRutaOSRM(ultimoPunto, puntoActual);

    if (rutaCalles) {
      // Agregar todos los puntos de la ruta real
      coordenadas.push(...rutaCalles);
    } else {
      // Si OSRM falla, caer a línea recta
      coordenadas.push(puntoActual);
    }
  } else {
    // Primer punto, solo agregarlo
    coordenadas.push(puntoActual);
  }

  ultimoPunto = puntoActual;

  if (polilinea) {
    polilinea.setLatLngs(coordenadas);
  } else {
    polilinea = L.polyline(coordenadas, {
      color: "#1A1A1A",
      weight: 4,
      opacity: 0.9,
    }).addTo(mapa);
  }
}

// ─── Referencias DOM ──────────────────────────────────────────────────────────
const elLatitud = document.getElementById("latitud");
const elLongitud = document.getElementById("longitud");
const elFecha = document.getElementById("fecha");
const elHora = document.getElementById("hora");
const elEstado = document.getElementById("estado");
const elStatusDot = document.getElementById("status-dot");
const elMapTime = document.getElementById("map-time");
const elMapCoords = document.getElementById("map-coords");



// ─── Actualizar posicion actual ───────────────────────────────────────────────
function actualizarActual(data) {
  const ts = Number(data.timestamp);
  const lat = Number(data.latitude).toFixed(6);
  const lon = Number(data.longitude).toFixed(6);
  const hora = tsAHora(ts);

  elLatitud.textContent = lat;
  elLongitud.textContent = lon;
  elFecha.textContent = tsAFecha(ts);
  elHora.textContent = hora;

  elMapTime.textContent = hora;
  elMapCoords.textContent = `${lat}, ${lon}`;

  moverMarcador(Number(data.latitude), Number(data.longitude));
}


// ─── Cargar historial inicial ─────────────────────────────────────────────────
async function cargarHistorial() {
  try {
    const res = await fetch("/api/history");
    const datos = await res.json();
    if (datos.length === 0) return;

    // Llenar la tabla con el historial
    datos.forEach((d) => agregarFila(d, false));

    // Solo colocar el marcador en el último punto, sin dibujar polilínea
    const ultimo = datos[0];
    const lat = Number(ultimo.latitude);
    const lon = Number(ultimo.longitude);

    if (marcador) {
      marcador.setLatLng([lat, lon]);
    } else {
      marcador = L.marker([lat, lon], { icon: taxiIcon }).addTo(mapa);
    }
    mapa.setView([lat, lon], 14);

    // Guardar el último punto conocido para que el SSE arranque desde ahí
    ultimoPunto = [lat, lon];

    // Actualizar panel de información
    const ts = Number(ultimo.timestamp);
    const latStr = lat.toFixed(6);
    const lonStr = lon.toFixed(6);
    const hora = tsAHora(ts);
    elLatitud.textContent = latStr;
    elLongitud.textContent = lonStr;
    elFecha.textContent = tsAFecha(ts);
    elHora.textContent = hora;
    elMapTime.textContent = hora;
    elMapCoords.textContent = `${latStr}, ${lonStr}`;

  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
  }
}

async function cargarConfig() {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    document.title = config.title;
    document.querySelector("h1") && (document.querySelector("h1").textContent = config.title);
  } catch (err) {
    console.error("[CONFIG] Error:", err);
  }
}

// ─── SSE ──────────────────────────────────────────────────────────────────────
function conectarSSE() {
  const source = new EventSource("/api/stream");

  source.onopen = () => {
    elEstado.textContent = "Conectado";
    elStatusDot.classList.add("status-dot--connected");
    console.log("[SSE] Conexion establecida");
  };

  source.onmessage = (event) => {
    const data = JSON.parse(event.data);
    actualizarActual(data);
    agregarFila(data, true);
  };

  source.onerror = () => {
    elEstado.textContent = "Desconectado";
    elStatusDot.classList.remove("status-dot--connected");
    console.warn("[SSE] Conexion perdida, reintentando...");
    source.close();
    setTimeout(conectarSSE, 3000);
  };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
cargarConfig();
cargarHistorial();
conectarSSE();
