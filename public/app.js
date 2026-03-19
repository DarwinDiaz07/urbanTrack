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

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "OpenStreetMap",
}).addTo(mapa);

function moverMarcador(lat, lon) {
  if (marcador) {
    marcador.setLatLng([lat, lon]);
  } else {
    marcador = L.marker([lat, lon]).addTo(mapa);
  }
  mapa.setView([lat, lon], 14);
}

// ─── Referencias DOM ──────────────────────────────────────────────────────────
const elLatitud = document.getElementById("latitud");
const elLongitud = document.getElementById("longitud");
const elFecha = document.getElementById("fecha");
const elHora = document.getElementById("hora");
const elTabla = document.getElementById("tabla-body");
const elEstado = document.getElementById("estado");

// ─── Actualizar posicion actual ───────────────────────────────────────────────
function actualizarActual(data) {
  const ts = Number(data.timestamp);
  elLatitud.textContent = Number(data.latitude).toFixed(6);
  elLongitud.textContent = Number(data.longitude).toFixed(6);
  elFecha.textContent = tsAFecha(ts);
  elHora.textContent = tsAHora(ts);
  moverMarcador(Number(data.latitude), Number(data.longitude));
}

// ─── Agregar fila al historial ────────────────────────────────────────────────
function agregarFila(data, inicio = true) {
  const vacio = elTabla.querySelector("td[colspan]");
  if (vacio) vacio.parentElement.remove();

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
  if (filas.length > 50) filas[filas.length - 1].remove();
}

// ─── Cargar historial inicial ─────────────────────────────────────────────────
async function cargarHistorial() {
  try {
    const res = await fetch("/api/history");
    const datos = await res.json();
    if (datos.length === 0) return;
    actualizarActual(datos[0]);
    datos.forEach((d) => agregarFila(d, false));
  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
  }
}

// ─── SSE ──────────────────────────────────────────────────────────────────────
function conectarSSE() {
  const source = new EventSource("/api/stream");

  source.onopen = () => {
    elEstado.textContent = "Conectado";
    console.log("[SSE] Conexion establecida");
  };

  source.onmessage = (event) => {
    const data = JSON.parse(event.data);
    actualizarActual(data);
    agregarFila(data, true);
  };

  source.onerror = () => {
    elEstado.textContent = "Desconectado (reintentando...)";
    console.warn("[SSE] Conexion perdida, reintentando...");
    source.close();
    setTimeout(conectarSSE, 3000);
  };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
cargarHistorial();
conectarSSE();
