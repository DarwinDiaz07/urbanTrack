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

// ─── Helpers de fecha ─────────────────────────────────────────────────────────
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

// ─── Mapa Leaflet ─────────────────────────────────────────────────────────────
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

// ─── Referencias DOM ──────────────────────────────────────────────────────────
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
const btnHoy = document.getElementById("btn-hoy");
const btnSemana = document.getElementById("btn-semana");
const btnMes = document.getElementById("btn-mes");
const inputLugar = document.getElementById("input-lugar");
const btnBuscarLugar = document.getElementById("btn-buscar-lugar");
const resultadoBusqueda = document.getElementById("resultado-busqueda");

// ─── Validacion de fechas via min/max ─────────────────────────────────────────
elFechaInicio.addEventListener("change", () => {
  if (elFechaInicio.value) {
    elFechaFin.min = elFechaInicio.value;
    if (elFechaFin.value && elFechaFin.value < elFechaInicio.value) {
      elFechaFin.value = elFechaInicio.value;
    }
  }
  limpiarQuickRangeActivo();
});

elFechaFin.addEventListener("change", () => {
  if (elFechaFin.value) {
    elFechaInicio.max = elFechaFin.value;
    if (elFechaInicio.value && elFechaInicio.value > elFechaFin.value) {
      elFechaInicio.value = elFechaFin.value;
    }
  }
  limpiarQuickRangeActivo();
});

// ─── Quick Range helpers ──────────────────────────────────────────────────────
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
  const ahora = new Date();
  setearRango(inicioDelDia(ahora), finDelDia(ahora), btnHoy);
});

btnSemana.addEventListener("click", () => {
  const ahora = new Date();
  const hace7 = new Date(ahora);
  hace7.setDate(hace7.getDate() - 7);
  setearRango(inicioDelDia(hace7), finDelDia(ahora), btnSemana);
});

btnMes.addEventListener("click", () => {
  const ahora = new Date();
  const hace30 = new Date(ahora);
  hace30.setDate(hace30.getDate() - 30);
  setearRango(inicioDelDia(hace30), finDelDia(ahora), btnMes);
});

// ─── Estado de botones (activo/inactivo) ──────────────────────────────────────
function actualizarBotones() {
  if (modoHistorial) {
    btnHistorial.classList.add("btn--active");
    btnHistorial.classList.remove("btn--inactive");
    btnVivo.classList.add("btn--inactive");
    btnVivo.classList.remove("btn--active");
    elMapMode.textContent = "HISTORIAL";
    elMapMode.className = "map-info__value map-info__value--historial";
  } else {
    btnVivo.classList.add("btn--active");
    btnVivo.classList.remove("btn--inactive");
    btnHistorial.classList.add("btn--inactive");
    btnHistorial.classList.remove("btn--active");
    elMapMode.textContent = "EN VIVO";
    elMapMode.className = "map-info__value map-info__value--live";
  }
}

actualizarBotones();

// ─── Actualizar UI + mapa ─────────────────────────────────────────────────────
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

// ─── Cargar ultimo punto desde DB ─────────────────────────────────────────────
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

// ─── Consultar recorrido por ventana de tiempo ────────────────────────────────
async function consultarHistorial() {
  const inicio = elFechaInicio.value;
  const fin = elFechaFin.value;

  if (!inicio || !fin) {
    const ahora = new Date();
    setearRango(inicioDelDia(ahora), finDelDia(ahora), btnHoy);
    return consultarHistorial();
  }

  const start = new Date(inicio).getTime();
  const end = new Date(fin).getTime();

  if (start >= end) return;

  try {
    const res = await fetch(`/api/history/range?start=${start}&end=${end}`);
    const datos = await res.json();

    if (datos.length === 0) {
      modoHistorial = true;
      actualizarBotones();
      return;
    }

    if (polilinea) {
      mapa.removeLayer(polilinea);
      polilinea = null;
    }

    modoHistorial = true;
    actualizarBotones();

    const puntos = datos.map((d) => [Number(d.latitude), Number(d.longitude)]);

    polilinea = L.polyline(puntos, {
      color: "#000000",
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
  actualizarBotones();

  if (polilinea) {
    mapa.removeLayer(polilinea);
    polilinea = null;
  }

  if (coordenadas.length >= 2) {
    polilinea = L.polyline(coordenadas, {
      color: "#000000",
      weight: 4,
      opacity: 0.9,
    }).addTo(mapa);
  }

  elFechaInicio.value = "";
  elFechaFin.value = "";
  elFechaInicio.max = "";
  elFechaFin.min = "";
  limpiarQuickRangeActivo();
  limpiarBusqueda();

  if (coordenadas.length > 0) {
    const ultimo = coordenadas[coordenadas.length - 1];
    mapa.setView(ultimo, 15);
  }
}

// ─── Busqueda por lugar (Nominatim + API /near) ───────────────────────────────
let marcadorBusqueda = null;
let circuloBusqueda = null;

function limpiarBusqueda() {
  if (marcadorBusqueda) {
    mapa.removeLayer(marcadorBusqueda);
    marcadorBusqueda = null;
  }
  if (circuloBusqueda) {
    mapa.removeLayer(circuloBusqueda);
    circuloBusqueda = null;
  }
  resultadoBusqueda.innerHTML = "";
  inputLugar.value = "";
}

async function buscarLugar() {
  const texto = inputLugar.value.trim();
  if (!texto) return;

  resultadoBusqueda.innerHTML =
    '<span class="search-result__loading">Buscando...</span>';

  // 1. Geocodificar con Nominatim (priorizar Barranquilla)
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto + ", Barranquilla, Colombia")}&limit=1`;
    const geoRes = await fetch(geoUrl, {
      headers: { "Accept-Language": "es" },
    });
    const geoData = await geoRes.json();

    if (geoData.length === 0) {
      resultadoBusqueda.innerHTML =
        '<span class="search-result--empty">No se encontro el lugar. Intenta con otro nombre o direccion.</span>';
      return;
    }

    const lugar = geoData[0];
    const lat = parseFloat(lugar.lat);
    const lon = parseFloat(lugar.lon);
    const nombreLugar = lugar.display_name.split(",").slice(0, 3).join(",");
    const radio = 150; // metros

    // 2. Dibujar en el mapa
    if (marcadorBusqueda) mapa.removeLayer(marcadorBusqueda);
    if (circuloBusqueda) mapa.removeLayer(circuloBusqueda);

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

    // 3. Consultar API /near
    let url = `/api/history/near?lat=${lat}&lon=${lon}&radius=${radio}`;

    const inicio = elFechaInicio.value;
    const fin = elFechaFin.value;
    if (inicio && fin) {
      url += `&start=${new Date(inicio).getTime()}&end=${new Date(fin).getTime()}`;
    }

    const nearRes = await fetch(url);
    const datos = await nearRes.json();

    // 4. Mostrar resultados en el sidebar
    let html = `<div class="search-result__lugar">${nombreLugar}</div>`;

    if (datos.length === 0) {
      html +=
        '<span class="search-result--empty">El vehiculo no paso por esta zona en el rango seleccionado.</span>';
    } else {
      html += `<strong>${datos.length} registro(s) encontrados:</strong>`;
      const mostrar = datos.slice(0, 8);
      mostrar.forEach((d) => {
        html += `<div class="search-result__item">${tsAFecha(d.timestamp)}  ${tsAHora(d.timestamp)}</div>`;
      });
      if (datos.length > 8) {
        html += `<div class="search-result__more">...y ${datos.length - 8} registros mas</div>`;
      }
    }

    resultadoBusqueda.innerHTML = html;

    // 5. Popup en el mapa
    let popupContent = `<b>${nombreLugar}</b><br>`;
    if (datos.length === 0) {
      popupContent += "Sin registros en esta zona.";
    } else {
      popupContent += `<b>${datos.length}</b> paso(s) registrados<br>`;
      const primeros = datos.slice(0, 3);
      primeros.forEach((d) => {
        popupContent += `${tsAFecha(d.timestamp)} ${tsAHora(d.timestamp)}<br>`;
      });
      if (datos.length > 3) {
        popupContent += `<i>...y ${datos.length - 3} mas</i>`;
      }
    }
    marcadorBusqueda.bindPopup(popupContent).openPopup();
  } catch (err) {
    console.error("[BUSQUEDA] Error:", err);
    resultadoBusqueda.innerHTML =
      '<span class="search-result--empty">Error al buscar. Verifica tu conexion.</span>';
  }
}

// Enter para buscar
inputLugar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarLugar();
});

btnBuscarLugar.addEventListener("click", buscarLugar);

// ─── Config dinamica ──────────────────────────────────────────────────────────
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
    console.log("[SSE] Conexion establecida");
  };

  source.onmessage = (event) => {
    try {
      if (modoHistorial) return;
      const data = JSON.parse(event.data);
      actualizarActual(data);
    } catch (e) {
      console.error("[SSE] Error parseando evento:", e);
    }
  };

  source.onerror = () => {
    elEstado.textContent = "Desconectado";
    elStatusDot.classList.remove("status-dot--connected");
    console.warn("[SSE] Conexion perdida, reintentando en 3s...");
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