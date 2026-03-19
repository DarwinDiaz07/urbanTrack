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

// ─── Mapa Leaflet (Dark Tiles) ───────────────────────────────────────────────
const mapa = L.map("mapa").setView([4.5709, -74.2973], 6);
let marcador = null;
let polilinea = null;
const coordenadas = [];

// CartoDB Dark Matter tiles
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(mapa);

// Yellow circle marker icon
const taxiIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="12" fill="#FFD700" stroke="#1A1A1A" stroke-width="3"/>
    <circle cx="14" cy="14" r="5" fill="#1A1A1A"/>
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
  mapa.setView([lat, lon], 14);

  coordenadas.push([lat, lon]);

  if (polilinea) {
    polilinea.setLatLngs(coordenadas);
  } else {
    polilinea = L.polyline(coordenadas, {
      color: "#FFD700",
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
const elTabla = document.getElementById("tabla-body");
const elEstado = document.getElementById("estado");
const elStatusDot = document.getElementById("status-dot");
const elMapTime = document.getElementById("map-time");
const elMapCoords = document.getElementById("map-coords");

// ─── Row selection ────────────────────────────────────────────────────────────
elTabla.addEventListener("click", (e) => {
  const row = e.target.closest("tr");
  if (!row || row.classList.contains("empty-row")) return;

  const prev = elTabla.querySelector("tr.selected");
  if (prev) prev.classList.remove("selected");
  row.classList.toggle("selected");
});

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

  // Map info overlay
  elMapTime.textContent = hora;
  elMapCoords.textContent = `${lat}, ${lon}`;

  moverMarcador(Number(data.latitude), Number(data.longitude));
}

// ─── Agregar fila al historial ────────────────────────────────────────────────
function agregarFila(data, inicio = true) {
  const vacio = elTabla.querySelector(".empty-row");
  if (vacio) vacio.remove();

  const ts = Number(data.timestamp);
  const fila = document.createElement("tr");
  fila.innerHTML = `
    <td>${tsAFecha(ts)}</td>
    <td>${tsAHora(ts)}</td>
    <td>${Number(data.latitude).toFixed(6)}</td>
    <td>${Number(data.longitude).toFixed(6)}</td>
  `;

  if (inicio) {
    elTabla.insertBefore(fila, elTabla.firstChild);
  } else {
    elTabla.appendChild(fila);
  }

  const filas = elTabla.querySelectorAll("tr");
  if (filas.length > 5) filas[filas.length - 1].remove();
}

// ─── Cargar historial inicial ─────────────────────────────────────────────────
async function cargarHistorial() {
  try {
    const res = await fetch("/api/history");
    const datos = await res.json();
    if (datos.length === 0) return;

    // Invertir: la API devuelve DESC, necesitamos de más antiguo a más reciente
    datos.reverse().forEach((d) => {
      coordenadas.push([Number(d.latitude), Number(d.longitude)]);
      agregarFila(d, false);
    });

    // Dibujar la polilínea con todos los puntos históricos de una vez
    polilinea = L.polyline(coordenadas, {
      color: "#FFD700",
      weight: 4,
      opacity: 0.9,
    }).addTo(mapa);

    // Mostrar el punto más reciente como posición actual y poner el marcador
    const ultimo = datos[datos.length - 1];
    actualizarActual(ultimo);

    // Ajustar el mapa para ver todo el recorrido
    if (coordenadas.length > 1) {
      mapa.fitBounds(polilinea.getBounds(), { padding: [40, 40] });
    }
  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
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
  };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
cargarHistorial();
conectarSSE();
