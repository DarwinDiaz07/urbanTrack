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

function toLocalDatetimeString(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 19);
}

function inicioDelDia(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function finDelDia(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 0);
  return d;
}

// ─── Mapa ─────────────────────────────────────────────────────────────────────
const mapa = L.map("mapa").setView([4.5709, -74.2973], 6);
let marcador = null;
let polilinea = null;
let coordenadas = [];
let modoHistorial = false;
let mapaInicializado = false;

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
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
  const latlng = [lat, lon];
  if (marcador) {
    marcador.setLatLng(latlng);
  } else {
    marcador = L.marker(latlng, { icon: taxiIcon }).addTo(mapa);
  }
  if (!mapaInicializado) {
    mapa.setView(latlng, 15);
    mapaInicializado = true;
  } else if (!modoHistorial) {
    mapa.panTo(latlng);
  }
  if (!modoHistorial) {
    coordenadas.push(latlng);
    if (polilinea) {
      polilinea.setLatLngs(coordenadas);
    } else if (coordenadas.length >= 2) {
      polilinea = L.polyline(coordenadas, {
        color: "#000000",
        weight: 4,
        opacity: 0.9,
      }).addTo(mapa);
    }
  }
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const elLatitud = document.getElementById("latitud");
const elLongitud = document.getElementById("longitud");
const elFecha = document.getElementById("fecha");
const elHora = document.getElementById("hora");
const elEstado = document.getElementById("estado");
const elStatusDot = document.getElementById("status-dot");
const elMapMode = document.getElementById("map-mode");
const elFechaInicio = document.getElementById("fecha-inicio");
const elFechaFin = document.getElementById("fecha-fin");
const btnHistorial = document.getElementById("btn-historial");
const btnVivo = document.getElementById("btn-vivo");
const btnModoHistorial = document.getElementById("btn-modo-historial");
const cardHistorial = document.getElementById("card-historial");
const btnHoy = document.getElementById("btn-hoy");
const btnSemana = document.getElementById("btn-semana");
const btnMes = document.getElementById("btn-mes");
const sliderContainer = document.getElementById("slider-container");
const sliderRecorrido = document.getElementById("slider-recorrido");
const sliderInfo = document.getElementById("slider-info");

// ─── Validacion fechas ────────────────────────────────────────────────────────
elFechaInicio.addEventListener("change", () => {
  if (elFechaInicio.value) {
    elFechaFin.min = elFechaInicio.value;
    if (elFechaFin.value && elFechaFin.value < elFechaInicio.value)
      elFechaFin.value = elFechaInicio.value;
  }
  limpiarQuickRangeActivo();
});

elFechaFin.addEventListener("change", () => {
  if (elFechaFin.value) {
    elFechaInicio.max = elFechaFin.value;
    if (elFechaInicio.value && elFechaInicio.value > elFechaFin.value)
      elFechaInicio.value = elFechaFin.value;
  }
  limpiarQuickRangeActivo();
});

// ─── Quick Range ──────────────────────────────────────────────────────────────
function limpiarQuickRangeActivo() {
  btnHoy.classList.remove("quick-range__btn--active");
  btnSemana.classList.remove("quick-range__btn--active");
  btnMes.classList.remove("quick-range__btn--active");
}

function setearRango(inicio, fin, botonActivo) {
  elFechaInicio.value = toLocalDatetimeString(inicio);
  elFechaFin.value = toLocalDatetimeString(fin);
  elFechaFin.min = elFechaInicio.value;
  elFechaInicio.max = elFechaFin.value;
  limpiarQuickRangeActivo();
  if (botonActivo) botonActivo.classList.add("quick-range__btn--active");
}

btnHoy.addEventListener("click", () => {
  setearRango(inicioDelDia(new Date()), finDelDia(new Date()), btnHoy);
  btnHistorial.click();
});
btnSemana.addEventListener("click", () => {
  const h = new Date(); const a = new Date(h); a.setDate(a.getDate() - 7);
  setearRango(inicioDelDia(a), finDelDia(h), btnSemana);
  btnHistorial.click();
});
btnMes.addEventListener("click", () => {
  const h = new Date(); const a = new Date(h); a.setDate(a.getDate() - 30);
  setearRango(inicioDelDia(a), finDelDia(h), btnMes);
  btnHistorial.click();
});

// ─── UI del modo ──────────────────────────────────────────────────────────────
function actualizarModoUI() {
  if (modoHistorial) {
    btnVivo.classList.remove("btn--active");
    btnVivo.classList.add("btn--inactive");
    btnModoHistorial.classList.add("btn--active");
    btnModoHistorial.classList.remove("btn--inactive");
    btnHistorial.classList.add("btn--active");
    btnHistorial.classList.remove("btn--inactive");
    cardHistorial.style.display = "";
    elMapMode.textContent = "HISTORIAL";
    elMapMode.className = "map-info__value map-info__value--historial";
  } else {
    btnVivo.classList.add("btn--active");
    btnVivo.classList.remove("btn--inactive");
    btnModoHistorial.classList.remove("btn--active");
    btnModoHistorial.classList.add("btn--inactive");
    btnHistorial.classList.remove("btn--active");
    btnHistorial.classList.add("btn--inactive");
    cardHistorial.style.display = "none";
    elMapMode.textContent = "EN VIVO";
    elMapMode.className = "map-info__value map-info__value--live";
  }
}

actualizarModoUI();

// ─── Actualizar UI ────────────────────────────────────────────────────────────
function actualizarActual(data) {
  const ts = Number(data.timestamp);
  const lat = Number(data.latitude).toFixed(6);
  const lon = Number(data.longitude).toFixed(6);
  elLatitud.textContent = lat;
  elLongitud.textContent = lon;
  elFecha.textContent = tsAFecha(ts);
  elHora.textContent = tsAHora(ts);
  moverMarcador(Number(data.latitude), Number(data.longitude));
}

async function cargarHistorial() {
  try {
    const res = await fetch("/api/history");
    const datos = await res.json();
    if (datos.length === 0) return;
    actualizarActual(datos[0]);
  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
  }
}

// ─── Limpiar capas ────────────────────────────────────────────────────────────
function limpiarPolilineaHistorial() {
  if (polilinea) {
    mapa.removeLayer(polilinea);
    polilinea = null;
  }
}

// ─── Slider de recorrido ──────────────────────────────────────────────────────
let datosHistorial = [];

function actualizarTrackSlider() {
  const pct = sliderRecorrido.max > 0
    ? (sliderRecorrido.value / sliderRecorrido.max) * 100
    : 0;
  sliderRecorrido.style.background =
    `linear-gradient(to right, var(--yellow-primary) ${pct}%, var(--gray-dark) ${pct}%)`;
}

function actualizarSlider(idx) {
  const d = datosHistorial[idx];
  const lat = Number(d.latitude);
  const lon = Number(d.longitude);
  const latlng = [lat, lon];

  if (marcador) {
    marcador.setLatLng(latlng);
  } else {
    marcador = L.marker(latlng, { icon: taxiIcon }).addTo(mapa);
  }

  const fechaStr = `${tsAFecha(d.timestamp)} ${tsAHora(d.timestamp)}`;
  const tooltipHTML = `<b>${fechaStr}</b><br>${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  if (marcador.getTooltip()) {
    marcador.setTooltipContent(tooltipHTML);
  } else {
    marcador.bindTooltip(tooltipHTML, {
      permanent: true,
      direction: "top",
      className: "slider-tooltip",
      offset: [0, -4],
    }).openTooltip();
  }

  sliderInfo.textContent = `${idx + 1} / ${datosHistorial.length}  ·  ${fechaStr}`;
  elLatitud.textContent = lat.toFixed(6);
  elLongitud.textContent = lon.toFixed(6);
  elFecha.textContent = tsAFecha(d.timestamp);
  elHora.textContent = tsAHora(d.timestamp);
  actualizarTrackSlider();
}

sliderRecorrido.addEventListener("input", (e) => {
  if (datosHistorial.length === 0) return;
  actualizarSlider(parseInt(e.target.value));
});

// ─── Consultar recorrido por fecha ────────────────────────────────────────────
async function consultarHistorial() {
  let inicio = elFechaInicio.value;
  let fin = elFechaFin.value;

  if (!inicio || !fin) {
    setearRango(inicioDelDia(new Date()), finDelDia(new Date()), btnHoy);
    inicio = elFechaInicio.value;
    fin = elFechaFin.value;
  }

  const start = new Date(inicio).getTime();
  const end = new Date(fin).getTime();
  if (start >= end) return;

  sliderContainer.style.display = "none";
  datosHistorial = [];

  try {
    const res = await fetch(`/api/history/range?start=${start}&end=${end}`);
    const datos = await res.json();

    limpiarPolilineaHistorial();
    modoHistorial = true;
    actualizarModoUI();

    if (datos.length === 0) return;

    const puntos = datos.map((d) => [Number(d.latitude), Number(d.longitude)]);
    polilinea = L.polyline(puntos, {
      color: "#000000",
      weight: 4,
      opacity: 0.9,
    }).addTo(mapa);

    mapa.flyToBounds(polilinea.getBounds(), {
      padding: [40, 40],
      maxZoom: 18,
      duration: 0.5,
    });

    datosHistorial = datos;
    sliderRecorrido.min = 0;
    sliderRecorrido.max = datos.length - 1;
    sliderRecorrido.value = 0;
    sliderContainer.style.display = "";
    actualizarSlider(0);
  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
  }
}

// ─── Volver a en vivo ─────────────────────────────────────────────────────────
async function verEnVivo() {
  modoHistorial = false;
  actualizarModoUI();
  limpiarPolilineaHistorial();

  sliderContainer.style.display = "none";
  datosHistorial = [];

  if (marcador && marcador.getTooltip()) {
    marcador.unbindTooltip();
  }

  elFechaInicio.value = "";
  elFechaFin.value = "";
  elFechaInicio.max = "";
  elFechaFin.min = "";
  limpiarQuickRangeActivo();

  try {
    const res = await fetch("/api/history");
    const datos = await res.json();
    if (datos.length > 0) {
      const lat = Number(datos[0].latitude);
      const lon = Number(datos[0].longitude);
      coordenadas = [[lat, lon]];
      if (marcador) { marcador.setLatLng([lat, lon]); }
      else { marcador = L.marker([lat, lon], { icon: taxiIcon }).addTo(mapa); }
      mapa.setView([lat, lon], 15);
      elLatitud.textContent = lat.toFixed(6);
      elLongitud.textContent = lon.toFixed(6);
      elFecha.textContent = tsAFecha(datos[0].timestamp);
      elHora.textContent = tsAHora(datos[0].timestamp);
    } else {
      coordenadas = [];
    }
  } catch (err) {
    console.error("[VIVO] Error:", err);
    coordenadas = [];
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────
async function cargarConfig() {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    document.title = config.title;
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
  };
  source.onmessage = (event) => {
    try {
      if (modoHistorial) return;
      actualizarActual(JSON.parse(event.data));
    } catch (e) {
      console.error("[SSE] Error:", e);
    }
  };
  source.onerror = () => {
    elEstado.textContent = "Desconectado";
    elStatusDot.classList.remove("status-dot--connected");
    source.close();
    setTimeout(conectarSSE, 3000);
  };
}

// ─── Eventos ──────────────────────────────────────────────────────────────────
btnHistorial.addEventListener("click", consultarHistorial);
btnVivo.addEventListener("click", verEnVivo);
btnModoHistorial.addEventListener("click", () => {
  modoHistorial = true;
  actualizarModoUI();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
cargarConfig();
cargarHistorial();
conectarSSE();
