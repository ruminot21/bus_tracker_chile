"use strict";

const map = L.map("map").setView([-33.4489, -70.6693], 11);
const markers = {};

let locations = {};
let companies = {};
let buses = {};
let selectedCompany = "";
let searchTerm = "";
let hasCentered = false;

const $ = id => document.getElementById(id);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const busIcon = L.divIcon({
  className: "bus-map-marker",
  html: '<div class="bus-pin"><span>🚌</span></div>',
  iconSize: [48, 48],
  iconAnchor: [24, 43],
  popupAnchor: [0, -38]
});

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadCatalogs() {
  try {
    const [companySnap, busSnap] = await Promise.all([
      db.collection("empresas").get(),
      db.collection("buses").get()
    ]);

    companies = {};
    companySnap.docs.forEach(doc => {
      companies[doc.id] = doc.data();
    });

    buses = {};
    busSnap.docs.forEach(doc => {
      buses[doc.id] = doc.data();
    });

    $("companyFilter").innerHTML =
      '<option value="">Todas las empresas</option>' +
      companySnap.docs
        .filter(doc => doc.data().activo !== false)
        .map(doc => (
          `<option value="${doc.id}">${escapeHtml(doc.data().nombre)}</option>`
        ))
        .join("");

    render();
  } catch (error) {
    console.error("Error cargando empresas y buses:", error);
    $("connectionStatus").textContent =
      "El mapa está conectado, pero no se pudieron cargar los datos de empresas.";
  }
}

$("companyFilter").addEventListener("change", event => {
  selectedCompany = event.target.value;
  hasCentered = false;
  render();
});

$("search").addEventListener("input", event => {
  searchTerm = event.target.value.toLowerCase().trim();
  hasCentered = false;
  render();
});

rtdb.ref("ubicaciones").on(
  "value",
  snapshot => {
    locations = snapshot.val() || {};
    $("connectionStatus").textContent = "Ubicación en tiempo real conectada.";
    render();
  },
  error => {
    console.error("Error leyendo ubicaciones:", error);
    $("connectionStatus").textContent =
      "No se pueden leer las ubicaciones: " + error.message;
  }
);

function visibleEntries() {
  return Object.entries(locations).filter(([busId, location]) => {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    const bus = buses[busId] || {};

    if (location.activo !== true) return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    const companyId = location.empresaId || bus.empresaId || "";

    if (selectedCompany && companyId !== selectedCompany) return false;

    const companyName =
      location.empresaNombre ||
      companies[companyId]?.nombre ||
      "";

    const text = [
      busId,
      location.busNombre || bus.nombre || "",
      location.busPatente || bus.patente || "",
      location.rutaNombre || bus.rutaNombre || "",
      companyName
    ].join(" ").toLowerCase();

    return !searchTerm || text.includes(searchTerm);
  });
}

function render() {
  const visible = visibleEntries();
  const activeIds = new Set();
  const points = [];

  visible.forEach(([busId, location]) => {
    const bus = buses[busId] || {};
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    const companyId = location.empresaId || bus.empresaId || "";

    const companyName =
      location.empresaNombre ||
      companies[companyId]?.nombre ||
      "Empresa sin nombre";

    const busName =
      location.busNombre ||
      bus.nombre ||
      busId;

    const plate =
      location.busPatente ||
      bus.patente ||
      "-";

    const route =
      location.rutaNombre ||
      bus.rutaNombre ||
      "-";

    activeIds.add(busId);
    points.push([lat, lng]);

    const popup = `
      <div class="bus-popup">
        <div class="bus-popup-title">🚌 ${escapeHtml(busName)}</div>
        <div><b>Patente:</b> ${escapeHtml(plate)}</div>
        <div><b>Empresa:</b> ${escapeHtml(companyName)}</div>
        <div><b>Ruta:</b> ${escapeHtml(route)}</div>
        <div><b>Conductor:</b> ${escapeHtml(location.conductorNombre || bus.conductorNombre || "-")}</div>
        <div><b>Velocidad:</b> ${Math.round((Number(location.velocidad) || 0) * 3.6)} km/h</div>
        <div><b>Actualizado:</b> ${
          location.actualizado
            ? new Date(location.actualizado).toLocaleTimeString()
            : "-"
        }</div>
      </div>
    `;

    if (markers[busId]) {
      markers[busId]
        .setLatLng([lat, lng])
        .setPopupContent(popup);
    } else {
      markers[busId] = L.marker([lat, lng], { icon: busIcon })
        .addTo(map)
        .bindPopup(popup);
    }
  });

  Object.keys(markers).forEach(id => {
    if (!activeIds.has(id)) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  });

  $("activeCount").textContent = visible.length;

  $("busList").innerHTML = visible.length
    ? visible.map(([busId, location]) => {
        const bus = buses[busId] || {};
        const companyId = location.empresaId || bus.empresaId || "";

        return `
          <div class="bus-card">
            <h4>🚌 ${escapeHtml(location.busNombre || bus.nombre || busId)}</h4>
            <div><b>Patente:</b> ${escapeHtml(location.busPatente || bus.patente || "-")}</div>
            <div><b>Empresa:</b> ${escapeHtml(location.empresaNombre || companies[companyId]?.nombre || "-")}</div>
            <div><b>Ruta:</b> ${escapeHtml(location.rutaNombre || bus.rutaNombre || "-")}</div>
            <div><span class="status online">En recorrido</span></div>
          </div>
        `;
      }).join("")
    : '<div class="card empty">No hay buses activos con este filtro.</div>';

  if (!hasCentered && points.length) {
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(points, { padding: [40, 40] });
    }

    hasCentered = true;
  }

  setTimeout(() => map.invalidateSize(), 100);
}

loadCatalogs();
