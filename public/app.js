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
let coordenadas = [];
let modoHistorial = false;

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 14,
}).addTo(mapa);

const taxiIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="12" fill="#1A1A1A" stroke="#FFD700" stroke-width="3"/>
    <circle cx="14" cy="14" r="5" fill="#FFD700"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function moverMarcador(lat, lon) {
  if (marcador) {
    marcador.setLatLng([lat, lon]);
  } else {
    marcador = L.marker([lat, lon], { icon: taxiIcon }).addTo(mapa);
  }
  mapa.setView([lat, lon]);

  if (!modoHistorial) {
    coordenadas.push([lat, lon]);
    if (polilinea) {
      polilinea.setLatLngs(coordenadas);
    } else {
      polilinea = L.polyline(coordenadas, {
        color: "#000000",
        weight: 4,
        opacity: 0.9,
      }).addTo(mapa);
    }
  }
}

// ─── Referencias DOM ──────────────────────────────────────────────────────────
const elLatitud    = document.getElementById("latitud");
const elLongitud   = document.getElementById("longitud");
const elFecha      = document.getElementById("fecha");
const elHora       = document.getElementById("hora");
const elEstado     = document.getElementById("estado");
const elStatusDot  = document.getElementById("status-dot");
const elMapTime    = document.getElementById("map-time");
const elMapCoords  = document.getElementById("map-coords");
const elFechaInicio = document.getElementById("fecha-inicio");
const elFechaFin   = document.getElementById("fecha-fin");
const btnHistorial = document.getElementById("btn-historial");
const btnVivo      = document.getElementById("btn-vivo");

// ─── Actualizar posicion actual ───────────────────────────────────────────────
function actualizarActual(data) {
  const ts  = Number(data.timestamp);
  const lat = Number(data.latitude).toFixed(6);
  const lon = Number(data.longitude).toFixed(6);
  const hora = tsAHora(ts);

  elLatitud.textContent  = lat;
  elLongitud.textContent = lon;
  elFecha.textContent    = tsAFecha(ts);
  elHora.textContent     = hora;
  elMapTime.textContent  = hora;
  elMapCoords.textContent = `${lat}, ${lon}`;

  moverMarcador(Number(data.latitude), Number(data.longitude));
}

// ─── Cargar historial inicial (solo último punto) ─────────────────────────────
async function cargarHistorial() {
  try {
    const res   = await fetch("/api/history");
    const datos = await res.json();
    if (datos.length === 0) return;
    actualizarActual(datos[0]);
  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
  }
}

// ─── Consultar recorrido por ventana de tiempo ────────────────────────────────
async function consultarHistorial() {
  const inicio = elFechaInicio.value;
  const fin    = elFechaFin.value;

  if (!inicio || !fin) {
    alert("Selecciona una fecha y hora de inicio y fin.");
    return;
  }

  const start = new Date(inicio).getTime();
  const end   = new Date(fin).getTime();

  if (start >= end) {
    alert("La fecha de inicio debe ser anterior a la fecha de fin.");
    return;
  }

  try {
    const res   = await fetch(`/api/history/range?start=${start}&end=${end}`);
    const datos = await res.json();

    if (datos.length === 0) {
      alert("No hay registros en ese rango de tiempo.");
      return;
    }

    // Limpiar polilínea actual
    if (polilinea) {
      mapa.removeLayer(polilinea);
      polilinea = null;
    }

    modoHistorial = true;

    const puntos = datos.map((d) => [Number(d.latitude), Number(d.longitude)]);

    polilinea = L.polyline(puntos, {
      color: "#FF6B00",
      weight: 4,
      opacity: 0.9,
    }).addTo(mapa);

    const ultimo = datos[datos.length - 1];
    actualizarActual(ultimo);

    mapa.fitBounds(polilinea.getBounds(), { padding: [40, 40] });

  } catch (err) {
    console.error("[HISTORIAL RANGE] Error:", err);
  }
}

// ─── Volver a vista en vivo ───────────────────────────────────────────────────
function verEnVivo() {
  modoHistorial = false;

  if (polilinea) {
    mapa.removeLayer(polilinea);
    polilinea = null;
  }

  coordenadas = [];
  elFechaInicio.value = "";
  elFechaFin.value    = "";

  cargarHistorial();
}

// ─── Config ───────────────────────────────────────────────────────────────────
async function cargarConfig() {
  try {
    const res    = await fetch("/api/config");
    const config = await res.json();
    document.title = config.title;
    document.querySelector(".header__title").textContent = config.title;
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
    if (modoHistorial) return;
    const data = JSON.parse(event.data);
    actualizarActual(data);
  };

  source.onerror = () => {
    elEstado.textContent = "Desconectado";
    elStatusDot.classList.remove("status-dot--connected");
    console.warn("[SSE] Conexion perdida, reintentando...");
    source.close();
    setTimeout(conectarSSE, 3000);
  };
}

// ─── Eventos botones ──────────────────────────────────────────────────────────
btnHistorial.addEventListener("click", consultarHistorial);
btnVivo.addEventListener("click", verEnVivo);

// ─── Init ─────────────────────────────────────────────────────────────────────
cargarConfig();
cargarHistorial();
conectarSSE();