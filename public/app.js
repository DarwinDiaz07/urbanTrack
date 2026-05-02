const ZONA = "America/Bogota";

const _fmtFecha = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const _fmtHora  = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const _fmtTick  = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function tsAFecha(ts) { return _fmtFecha.format(Number(ts)).split("/").reverse().join("-"); }
function tsAHora(ts)  { return _fmtHora.format(Number(ts)); }
function fmtTooltipTitle(ts) { return `${tsAFecha(ts)} ${tsAHora(ts)}`; }

function toLocalDatetimeString(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 19);
}

function inicioDelDia(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function finDelDia(date) { const d = new Date(date); d.setHours(23, 59, 59, 0); return d; }

// ─── Mapa ─────────────────────────────────────────────────────────────────────
const mapa = L.map("mapa").setView([4.5709, -74.2973], 6);
let marcador = null;
let polilinea = null;
let coordenadas = [];
let modoHistorial = false;
let mapaInicializado = false;

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
  if (marcador) { marcador.setLatLng(latlng); }
  else { marcador = L.marker(latlng, { icon: taxiIcon }).addTo(mapa); }
  if (!mapaInicializado) { mapa.setView(latlng, 15); mapaInicializado = true; }
  else if (!modoHistorial) { mapa.panTo(latlng); }
  if (!modoHistorial) {
    coordenadas.push(latlng);
    if (polilinea) { polilinea.setLatLngs(coordenadas); }
    else if (coordenadas.length >= 2) {
      polilinea = L.polyline(coordenadas, { color: "#000000", weight: 4, opacity: 0.9 }).addTo(mapa);
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
const cardObdLive = document.getElementById("card-obd-live");
const btnHoy = document.getElementById("btn-hoy");
const btnSemana = document.getElementById("btn-semana");
const btnMes = document.getElementById("btn-mes");
const sliderContainer = document.getElementById("slider-container");
const sliderRecorrido = document.getElementById("slider-recorrido");
const sliderInfo = document.getElementById("slider-info");
const obdSnapshot = document.getElementById("obd-snapshot");
const btnVerGraficas = document.getElementById("btn-ver-graficas");
const btnCerrarGraficas = document.getElementById("btn-cerrar-graficas");
const chartsPanel = document.getElementById("charts-panel");
const mapContainer = document.querySelector(".map-container");

// OBD live elements
const elObdRpm = document.getElementById("obd-rpm");
const elObdTemp = document.getElementById("obd-temp");
const elObdFuel = document.getElementById("obd-fuel");
const elObdO2 = document.getElementById("obd-o2");

// ─── OBD Live Update ─────────────────────────────────────────────────────────
function actualizarOBD(data) {
  elObdRpm.textContent = data.rpm != null ? `${data.rpm} RPM` : "—";
  elObdTemp.textContent = data.temperatura != null ? `${data.temperatura} °C` : "—";
  elObdFuel.textContent = data.fuel_trim != null ? `${data.fuel_trim} %` : "—";
  elObdO2.textContent = data.o2_voltage != null ? `${data.o2_voltage} V` : "—";
}

// ─── Validacion fechas ────────────────────────────────────────────────────────
elFechaInicio.addEventListener("change", () => {
  if (elFechaInicio.value) {
    elFechaFin.min = elFechaInicio.value;
    if (elFechaFin.value && elFechaFin.value < elFechaInicio.value) elFechaFin.value = elFechaInicio.value;
  }
  limpiarQuickRangeActivo();
});

elFechaFin.addEventListener("change", () => {
  if (elFechaFin.value) {
    elFechaInicio.max = elFechaFin.value;
    if (elFechaInicio.value && elFechaInicio.value > elFechaFin.value) elFechaInicio.value = elFechaFin.value;
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
    cardObdLive.style.display = "none";
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
    cardObdLive.style.display = "";
    elMapMode.textContent = "EN VIVO";
    elMapMode.className = "map-info__value map-info__value--live";
    // Cerrar graficas si estan abiertas
    chartsPanel.style.display = "none";
    mapContainer.style.display = "";
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
  actualizarOBD(data);
}

async function cargarHistorial() {
  try {
    const res = await fetch("/api/history");
    const datos = await res.json();
    if (datos.length === 0) return;
    actualizarActual(datos[0]);
  } catch (err) { console.error("[HISTORIAL] Error:", err); }
}

// ─── Limpiar capas ────────────────────────────────────────────────────────────
function limpiarPolilineaHistorial() {
  if (polilinea) { mapa.removeLayer(polilinea); polilinea = null; }
}

// ─── Slider de recorrido ──────────────────────────────────────────────────────
let datosHistorial = [];

function actualizarTrackSlider() {
  const pct = sliderRecorrido.max > 0 ? (sliderRecorrido.value / sliderRecorrido.max) * 100 : 0;
  sliderRecorrido.style.background = `linear-gradient(to right, var(--yellow-primary) ${pct}%, var(--gray-dark) ${pct}%)`;
}

function actualizarSlider(idx) {
  const d = datosHistorial[idx];
  const lat = Number(d.latitude);
  const lon = Number(d.longitude);
  const latlng = [lat, lon];

  if (marcador) { marcador.setLatLng(latlng); }
  else { marcador = L.marker(latlng, { icon: taxiIcon }).addTo(mapa); }

  const fechaStr = `${tsAFecha(d.timestamp)} ${tsAHora(d.timestamp)}`;
  const tooltipHTML = `<b>${fechaStr}</b><br>${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  if (marcador.getTooltip()) { marcador.setTooltipContent(tooltipHTML); }
  else {
    marcador.bindTooltip(tooltipHTML, {
      permanent: true, direction: "top", className: "slider-tooltip", offset: [0, -4],
    }).openTooltip();
  }

  sliderInfo.textContent = `${idx + 1} / ${datosHistorial.length}  ·  ${fechaStr}`;
  elLatitud.textContent = lat.toFixed(6);
  elLongitud.textContent = lon.toFixed(6);
  elFecha.textContent = tsAFecha(d.timestamp);
  elHora.textContent = tsAHora(d.timestamp);
  actualizarTrackSlider();
  actualizarObdSnapshot(idx);
  if (chartsPanel.style.display !== "none") {
    actualizarLineaVertical(idx);
  }
}

sliderRecorrido.addEventListener("input", (e) => {
  if (datosHistorial.length === 0) return;
  actualizarSlider(parseInt(e.target.value));
});

// ─── Consultar recorrido ──────────────────────────────────────────────────────
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

  const graficasAbiertas = chartsPanel.style.display !== "none";
  sliderContainer.style.display = "none";
  obdSnapshot.style.display = "none";
  datosHistorial = [];
  chartsPanel.style.display = "none";
  mapContainer.style.display = "";

  try {
    const res = await fetch(`/api/history/range?start=${start}&end=${end}`);
    const datos = await res.json();

    limpiarPolilineaHistorial();
    modoHistorial = true;
    actualizarModoUI();

    if (datos.length === 0) return;

    const puntos = datos.map((d) => [Number(d.latitude), Number(d.longitude)]);
    polilinea = L.polyline(puntos, { color: "#000000", weight: 4, opacity: 0.9 }).addTo(mapa);
    mapa.flyToBounds(polilinea.getBounds(), { padding: [40, 40], maxZoom: 18, duration: 0.5 });

    datosHistorial = datos;
    sliderRecorrido.min = 0;
    sliderRecorrido.max = datos.length - 1;
    sliderRecorrido.value = 0;
    sliderContainer.style.display = "";
    actualizarSlider(0);
    if (graficasAbiertas) mostrarGraficas();
  } catch (err) { console.error("[HISTORIAL] Error:", err); }
}

// ─── Volver a en vivo ─────────────────────────────────────────────────────────
async function verEnVivo() {
  modoHistorial = false;
  actualizarModoUI();
  limpiarPolilineaHistorial();

  sliderContainer.style.display = "none";
  obdSnapshot.style.display = "none";
  datosHistorial = [];

  if (marcador && marcador.getTooltip()) { marcador.unbindTooltip(); }

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
      actualizarOBD(datos[0]);
    } else {
      coordenadas = [];
    }
  } catch (err) {
    console.error("[VIVO] Error:", err);
    coordenadas = [];
  }
  polilinea = null;
}

// ─── Plugin: línea vertical sincronizada con el slider ────────────────────────
const verticalLinePlugin = {
  id: "verticalLine",
  afterDraw(chart) {
    const idx = chart.options.plugins.verticalLine?.index;
    if (idx == null) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data[idx]) return;
    const x = meta.data[idx].x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#FFD700";
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(verticalLinePlugin);

// ─── Graficas OBD historicas ──────────────────────────────────────────────────
let chartRpm = null;
let chartTemp = null;
let chartFuel = null;
let chartO2 = null;

// LTTB downsampling — preserves visual shape while reducing point count
function lttb(data, threshold) {
  const n = data.length;
  if (n <= threshold) return data;
  const result = [data[0]];
  const step = (n - 2) / (threshold - 2);
  let a = 0;
  for (let i = 1; i < threshold - 1; i++) {
    const nb0 = Math.floor((i + 1) * step) + 1;
    const nb1 = Math.min(Math.floor((i + 2) * step) + 1, n);
    let avgX = 0, avgY = 0;
    for (let j = nb0; j < nb1; j++) { avgX += data[j].x; avgY += data[j].y; }
    const cnt = nb1 - nb0 || 1;
    avgX /= cnt; avgY /= cnt;
    const b0 = Math.floor(i * step) + 1, b1 = nb0;
    let maxArea = -1, pick = b0;
    const ax = data[a].x, ay = data[a].y;
    for (let j = b0; j < b1; j++) {
      const area = Math.abs((ax - avgX) * (data[j].y - ay) - (ax - data[j].x) * (avgY - ay));
      if (area > maxArea) { maxArea = area; pick = j; }
    }
    result.push(data[pick]);
    a = pick;
  }
  result.push(data[n - 1]);
  return result;
}

const LTTB_THRESHOLD = 2000;
const GAP_MS = 5 * 60 * 1000;

// O(n) — inserts {x, y: null} sentinels between consecutive points whose
// timestamps differ by more than maxGapMs so Chart.js breaks the line there.
function procesarDatosConGaps(points, maxGapMs) {
  if (points.length < 2) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].x - points[i - 1].x > maxGapMs) {
      result.push({ x: Math.round((points[i - 1].x + points[i].x) / 2), y: null });
    }
    result.push(points[i]);
  }
  return result;
}

function crearGrafica(canvasId, label, datos, color, unit) {
  const canvas = document.getElementById(canvasId);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");

  // {x: timestamp_ms, y: value} — no string labels generated
  const points = datos.map((d) => ({ x: Number(d.timestamp), y: Number(d.value) }));
  const plotPoints = procesarDatosConGaps(lttb(points, LTTB_THRESHOLD), GAP_MS);

  let rawMin = Infinity, rawMax = -Infinity;
  for (const p of plotPoints) { if (p.y != null && p.y < rawMin) rawMin = p.y; if (p.y != null && p.y > rawMax) rawMax = p.y; }
  if (!isFinite(rawMin)) { rawMin = 0; rawMax = 1; }
  const pad = (rawMax - rawMin) * 0.1 || 1;

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label,
        data: plotPoints,
        borderColor: color,
        backgroundColor: color + "22",
        borderWidth: 2,
        // scriptable: O(1) update — only reads chart._activeIdx, no array rebuild
        pointRadius: (c) => c.dataIndex === c.chart._activeIdx ? 5 : 0,
        pointBackgroundColor: color,
        pointBorderColor: "#1A1A1A",
        pointBorderWidth: 2,
        fill: true,
        tension: 0.3,
        spanGaps: false,
        parsing: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      plugins: {
        legend: { labels: { color: "#F5F5F5", font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.raw.y} ${unit}`,
            title: (items) => fmtTooltipTitle(items[0].raw.x),
          },
        },
        verticalLine: { index: null },
      },
      scales: {
        x: {
          type: "linear",
          ticks: {
            color: "#6B6B6B",
            autoSkip: true,
            maxTicksLimit: 10,
            font: { size: 9 },
            callback: (val) => _fmtTick.format(val),
          },
          grid: { color: "#3A3A3A" },
        },
        y: {
          suggestedMin: rawMin - pad,
          suggestedMax: rawMax + pad,
          ticks: { color: "#6B6B6B", font: { size: 10 } },
          grid: { color: "#3A3A3A" },
        },
      },
    },
  });

  chart._activeIdx = null;
  return chart;
}

function destruirGraficas() {
  if (chartRpm) { chartRpm.destroy(); chartRpm = null; }
  if (chartTemp) { chartTemp.destroy(); chartTemp = null; }
  if (chartFuel) { chartFuel.destroy(); chartFuel = null; }
  if (chartO2) { chartO2.destroy(); chartO2 = null; }
}

// O(log n) binary search on sorted {x, y} points
function binarySearchClosest(points, ts) {
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < ts) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].x - ts) < Math.abs(points[lo].x - ts)) return lo - 1;
  return lo;
}

function actualizarLineaVertical(sliderIdx) {
  const ts = Number(datosHistorial[sliderIdx].timestamp);
  [chartRpm, chartTemp, chartFuel, chartO2].forEach((chart) => {
    if (!chart) return;
    const idx = binarySearchClosest(chart.data.datasets[0].data, ts);
    chart._activeIdx = idx;
    chart.options.plugins.verticalLine.index = idx;
    chart.update("none");
  });
}

function actualizarObdSnapshot(idx) {
  const d = datosHistorial[idx];
  document.getElementById("snap-rpm").textContent = d.rpm != null ? `${d.rpm} RPM` : "—";
  document.getElementById("snap-temp").textContent = d.temperatura != null ? `${d.temperatura} °C` : "—";
  document.getElementById("snap-fuel").textContent = d.fuel_trim != null ? `${d.fuel_trim} %` : "—";
  document.getElementById("snap-o2").textContent = d.o2_voltage != null ? `${d.o2_voltage} V` : "—";
  document.getElementById("obd-snapshot").style.display = "";
}

function mostrarGraficas() {
  if (datosHistorial.length === 0) return;

  destruirGraficas();

  const rpmData = datosHistorial.filter((d) => d.rpm != null).map((d) => ({ timestamp: d.timestamp, value: d.rpm }));
  const tempData = datosHistorial.filter((d) => d.temperatura != null).map((d) => ({ timestamp: d.timestamp, value: d.temperatura }));
  const fuelData = datosHistorial.filter((d) => d.fuel_trim != null).map((d) => ({ timestamp: d.timestamp, value: d.fuel_trim }));
  const o2Data = datosHistorial.filter((d) => d.o2_voltage != null).map((d) => ({ timestamp: d.timestamp, value: d.o2_voltage }));

  mapContainer.style.display = "none";
  chartsPanel.style.display = "";

  setTimeout(() => {
    chartRpm = crearGrafica("chart-rpm", "RPM", rpmData, "#FFD700", "RPM");
    chartTemp = crearGrafica("chart-temp", "Temperatura", tempData, "#F44336", "°C");
    chartFuel = crearGrafica("chart-fuel", "Fuel Trim", fuelData, "#4CAF50", "%");
    chartO2 = crearGrafica("chart-o2", "O₂ Voltaje", o2Data, "#2196F3", "V");
    actualizarLineaVertical(parseInt(sliderRecorrido.value));
  }, 100);
}

btnVerGraficas.addEventListener("click", mostrarGraficas);
btnCerrarGraficas.addEventListener("click", () => {
  chartsPanel.style.display = "none";
  mapContainer.style.display = "";
  mapa.invalidateSize();
});

// ─── Config ───────────────────────────────────────────────────────────────────
async function cargarConfig() {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    document.title = config.title;
  } catch (err) { console.error("[CONFIG] Error:", err); }
}

// ─── SSE ──────────────────────────────────────────────────────────────────────
function conectarSSE() {
  const source = new EventSource("/api/stream");
  source.onopen = () => { elEstado.textContent = "Conectado"; elStatusDot.classList.add("status-dot--connected"); };
  source.onmessage = (event) => {
    try {
      if (modoHistorial) return;
      const data = JSON.parse(event.data);
      actualizarActual(data);
    } catch (e) { console.error("[SSE] Error:", e); }
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