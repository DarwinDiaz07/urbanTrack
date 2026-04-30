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
let tabActual = "recorrido"; // "recorrido" o "lugar"

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
const inputLugar = document.getElementById("input-lugar");
const btnBuscarLugar = document.getElementById("btn-buscar-lugar");
const resultadoBusqueda = document.getElementById("resultado-busqueda");
const tabRecorrido = document.getElementById("tab-recorrido");
const tabLugar = document.getElementById("tab-lugar");
const panelRecorrido = document.getElementById("panel-recorrido");
const panelLugar = document.getElementById("panel-lugar");

// ─── Tabs ─────────────────────────────────────────────────────────────────────
tabRecorrido.addEventListener("click", () => {
  tabActual = "recorrido";
  tabRecorrido.classList.add("tab-btn--active");
  tabLugar.classList.remove("tab-btn--active");
  panelRecorrido.classList.remove("tab-content--hidden");
  panelLugar.classList.add("tab-content--hidden");
  document.getElementById("mapa").classList.remove("crosshair-cursor");
});

tabLugar.addEventListener("click", () => {
  tabActual = "lugar";
  tabLugar.classList.add("tab-btn--active");
  tabRecorrido.classList.remove("tab-btn--active");
  panelLugar.classList.remove("tab-content--hidden");
  panelRecorrido.classList.add("tab-content--hidden");
  // Activar modo historial para permitir click en mapa
  if (!modoHistorial) {
    modoHistorial = true;
    actualizarModoUI();
  }
  document.getElementById("mapa").classList.add("crosshair-cursor");
});

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
    tabRecorrido.classList.remove("tab-btn--inactive");
    tabLugar.classList.remove("tab-btn--inactive");
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
    tabRecorrido.classList.add("tab-btn--inactive");
    tabLugar.classList.add("tab-btn--inactive");
    cardHistorial.style.display = "none";
    elMapMode.textContent = "EN VIVO";
    elMapMode.className = "map-info__value map-info__value--live";
    document.getElementById("mapa").classList.remove("crosshair-cursor");
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
let marcadorBusqueda = null;
let circuloBusqueda = null;
let polilineaBusqueda = null;

function limpiarCapasBusqueda() {
  if (marcadorBusqueda) {
    mapa.removeLayer(marcadorBusqueda);
    marcadorBusqueda = null;
  }
  if (circuloBusqueda) {
    mapa.removeLayer(circuloBusqueda);
    circuloBusqueda = null;
  }
  if (polilineaBusqueda) {
    mapa.removeLayer(polilineaBusqueda);
    polilineaBusqueda = null;
  }
}

function limpiarPolilineaHistorial() {
  if (polilinea) {
    mapa.removeLayer(polilinea);
    polilinea = null;
  }
}

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

  limpiarCapasBusqueda();
  resultadoBusqueda.innerHTML = "";
  inputLugar.value = "";

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
    actualizarActual(datos[datos.length - 1]);
    mapa.flyToBounds(polilinea.getBounds(), {
      padding: [40, 40],
      maxZoom: 18,
      duration: 0.5,
    });
  } catch (err) {
    console.error("[HISTORIAL] Error:", err);
  }
}

// ─── Volver a en vivo ─────────────────────────────────────────────────────────
async function verEnVivo() {
  modoHistorial = false;
  actualizarModoUI();
  limpiarPolilineaHistorial();
  limpiarCapasBusqueda();

  // Restaurar tab a recorrido
  tabActual = "recorrido";
  tabRecorrido.classList.add("tab-btn--active");
  tabLugar.classList.remove("tab-btn--active");
  panelRecorrido.classList.remove("tab-content--hidden");
  panelLugar.classList.add("tab-content--hidden");

  elFechaInicio.value = "";
  elFechaFin.value = "";
  elFechaInicio.max = "";
  elFechaFin.min = "";
  limpiarQuickRangeActivo();
  resultadoBusqueda.innerHTML = "";
  inputLugar.value = "";

  // Limpiar polilinea existente del mapa
  if (polilinea) { mapa.removeLayer(polilinea); }
  polilinea = null;

  // Cargar ultimo punto real de la DB como unico origen
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
// ─── Busqueda por lugar ───────────────────────────────────────────────────────
async function buscarPorCoordenadas(lat, lon, nombreLugar) {
  const radio = 150;

  limpiarPolilineaHistorial();
  limpiarCapasBusqueda();

  circuloBusqueda = L.circle([lat, lon], {
    radius: radio,
    color: "#F44336",
    fillColor: "#F44336",
    fillOpacity: 0.12,
    weight: 2,
    dashArray: "6 4",
  }).addTo(mapa);

  marcadorBusqueda = L.marker([lat, lon]).addTo(mapa);
  mapa.setView([lat, lon], 16);

  // SIN filtro de fecha — busca todos los registros
  const url = `/api/history/near?lat=${lat}&lon=${lon}&radius=${radio}`;

  try {
    const nearRes = await fetch(url);
    const datos = await nearRes.json();

    let html = `<div class="search-result__lugar">${nombreLugar}</div>`;

    if (datos.length === 0) {
      html +=
        '<span class="search-result--empty">El vehiculo nunca paso por esta zona.</span>';
      resultadoBusqueda.innerHTML = html;
      marcadorBusqueda
        .bindPopup(`<b>${nombreLugar}</b><br>Sin registros.`)
        .openPopup();
      return;
    }

    html += `<div class="search-result__count">${datos.length} registro(s) — selecciona uno para ver el recorrido</div>`;
    html += '<div class="search-result__list">';
    datos.forEach((d, i) => {
      html += `<div class="search-result__item" data-index="${i}" data-ts="${d.timestamp}">
        ${tsAFecha(d.timestamp)}  ${tsAHora(d.timestamp)}
      </div>`;
    });
    html += "</div>";

    resultadoBusqueda.innerHTML = html;

    // Popup
    let popup = `<b>${nombreLugar}</b><br><b>${datos.length}</b> paso(s)<br>`;
    datos.slice(0, 3).forEach((d) => {
      popup += `${tsAFecha(d.timestamp)} ${tsAHora(d.timestamp)}<br>`;
    });
    if (datos.length > 3) popup += `<i>Selecciona en la lista</i>`;
    marcadorBusqueda.bindPopup(popup).openPopup();

    // Click en cada item -> graficar ventana 30 min
    const items = resultadoBusqueda.querySelectorAll(".search-result__item");
    items.forEach((item) => {
      item.addEventListener("click", () => {
        items.forEach((el) =>
          el.classList.remove("search-result__item--selected"),
        );
        item.classList.add("search-result__item--selected");
        graficarVentana(parseInt(item.dataset.ts));
      });
    });
  } catch (err) {
    console.error("[BUSQUEDA] Error:", err);
    resultadoBusqueda.innerHTML =
      '<span class="search-result--empty">Error al buscar.</span>';
  }
}

async function graficarVentana(ts) {
  const VENTANA = 15 * 60 * 1000;
  const start = ts - VENTANA;
  const end = ts + VENTANA;

  if (polilineaBusqueda) {
    mapa.removeLayer(polilineaBusqueda);
    polilineaBusqueda = null;
  }
  limpiarPolilineaHistorial();

  try {
    const res = await fetch(`/api/history/range?start=${start}&end=${end}`);
    const datos = await res.json();
    if (datos.length === 0) return;

    const puntos = datos.map((d) => [Number(d.latitude), Number(d.longitude)]);
    polilineaBusqueda = L.polyline(puntos, {
      color: "#000",
      weight: 4,
      opacity: 0.85,
      dashArray: "8 4",
    }).addTo(mapa);

    const bounds = polilineaBusqueda.getBounds();
    if (circuloBusqueda) bounds.extend(circuloBusqueda.getBounds());
    mapa.fitBounds(bounds, { padding: [50, 50] });

    const punto =
      datos.find((d) => Number(d.timestamp) === ts) || datos[datos.length - 1];
    actualizarActual(punto);
  } catch (err) {
    console.error("[VENTANA] Error:", err);
  }
}

async function buscarLugar() {
  const texto = inputLugar.value.trim();
  if (!texto) return;

  resultadoBusqueda.innerHTML =
    '<span class="search-result__loading">Buscando...</span>';

  try {
    const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto + ", Barranquilla, Colombia")}&limit=1`;
    const geoRes = await fetch(geoUrl, {
      headers: { "Accept-Language": "es" },
    });
    const geoData = await geoRes.json();

    if (geoData.length === 0) {
      resultadoBusqueda.innerHTML =
        '<span class="search-result--empty">No se encontro el lugar.</span>';
      return;
    }

    const lugar = geoData[0];
    const nombreLugar = lugar.display_name.split(",").slice(0, 3).join(",");
    await buscarPorCoordenadas(
      parseFloat(lugar.lat),
      parseFloat(lugar.lon),
      nombreLugar,
    );
  } catch (err) {
    console.error("[GEOCODE] Error:", err);
    resultadoBusqueda.innerHTML =
      '<span class="search-result--empty">Error al buscar.</span>';
  }
}

// Click en mapa -> buscar (solo en tab lugar)
mapa.on("click", async (e) => {
  if (tabActual !== "lugar") return;
  const { lat, lng } = e.latlng;
  inputLugar.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  await buscarPorCoordenadas(
    lat,
    lng,
    `Punto: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  );
});

inputLugar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarLugar();
});
btnBuscarLugar.addEventListener("click", buscarLugar);

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
