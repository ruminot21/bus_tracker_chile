"use strict";

let companyUser = null;
let company = null;
let companyId = "";

let buses = [];
let drivers = [];
let routes = [];
let locations = {};

let companyMap = null;
const companyMarkers = {};

const cloudFunctions = firebase.functions();
const updateDriverFunction = cloudFunctions.httpsCallable("updateDriver");

const $ = id => document.getElementById(id);
const value = id => $(id).value.trim();

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function table(headers, rows) {
  const body = rows.length
    ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}" class="empty">Sin registros</td></tr>`;

  return `
    <table>
      <thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function busIcon() {
  return L.divIcon({
    className: "bus-map-marker",
    html: '<div class="bus-pin company-bus-pin"><span>🚌</span></div>',
    iconSize: [48, 48],
    iconAnchor: [24, 43],
    popupAnchor: [0, -38]
  });
}

async function loginCompany() {
  $("loginMsg").textContent = "";

  try {
    const credential = await auth.signInWithEmailAndPassword(
      value("email"),
      value("password")
    );

    const userDoc = await db.collection("usuarios").doc(credential.user.uid).get();

    if (!userDoc.exists || userDoc.data().rol !== "empresa") {
      await auth.signOut();
      throw new Error("Este usuario no tiene acceso de empresa.");
    }

    companyUser = { id: userDoc.id, ...userDoc.data() };
    companyId = companyUser.empresaId;

    const companyDoc = await db.collection("empresas").doc(companyId).get();

    if (!companyDoc.exists || companyDoc.data().activo === false) {
      await auth.signOut();
      throw new Error("La empresa no existe o está desactivada.");
    }

    company = { id: companyDoc.id, ...companyDoc.data() };

    $("loginCard").classList.add("hidden");
    $("companyPanel").classList.remove("hidden");

    $("companyName").textContent = company.nombre || "Empresa";
    $("companyContact").textContent =
      [company.correo, company.telefono].filter(Boolean).join(" · ");

    initMap();
    listenLocations();
    await loadCompanyData();
  } catch (error) {
    $("loginMsg").textContent = error.message;
  }
}

function initMap() {
  if (companyMap) return;

  companyMap = L.map("companyMap").setView([-33.4489, -70.6693], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(companyMap);
}

function listenLocations() {
  rtdb.ref("ubicaciones").on(
    "value",
    snapshot => {
      locations = snapshot.val() || {};
      renderAll();
    },
    error => {
      console.error("Error leyendo ubicaciones:", error);
    }
  );
}

async function loadCompanyData() {
  const [busSnap, userSnap, routeSnap] = await Promise.all([
    db.collection("buses").where("empresaId", "==", companyId).get(),
    db.collection("usuarios").where("empresaId", "==", companyId).get(),
    db.collection("rutas").where("empresaId", "==", companyId).get()
  ]);

  buses = busSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  drivers = userSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.rol === "conductor");

  routes = routeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  fillDriverEditor();
  renderAll();
}

function companyActiveLocations() {
  return Object.entries(locations).filter(([busId, location]) => {
    const bus = buses.find(item => item.id === busId);
    const locationCompany = location?.empresaId || bus?.empresaId;

    return (
      location?.activo === true &&
      locationCompany === companyId &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng))
    );
  });
}

function renderAll() {
  if (!company) return;

  $("countBuses").textContent = buses.length;
  $("countDrivers").textContent = drivers.length;
  $("countRoutes").textContent = routes.length;
  $("countActive").textContent = companyActiveLocations().length;

  renderBuses();
  renderDrivers();
  renderRoutes();
  renderMap();
}

function renderBuses() {
  const rows = buses.map(bus => {
    const location = locations[bus.id];

    return [
      `🚌 ${escapeHtml(bus.nombre || bus.id)}`,
      escapeHtml(bus.patente || "-"),
      escapeHtml(bus.marca || "-"),
      escapeHtml(bus.capacidad || "-"),
      escapeHtml(bus.conductorNombre || "-"),
      escapeHtml(bus.rutaNombre || "-"),
      location?.activo === true
        ? '<span class="status online">En recorrido</span>'
        : '<span class="status offline">Detenido</span>'
    ];
  });

  $("busList").innerHTML = table(
    ["Bus", "Patente", "Marca", "Capacidad", "Conductor", "Ruta", "Estado"],
    rows
  );
}

function renderDrivers() {
  const rows = drivers.map(driver => {
    const location = driver.busId ? locations[driver.busId] : null;

    return [
      escapeHtml(driver.nombre || "-"),
      escapeHtml(driver.correo || "-"),
      `🚌 ${escapeHtml(driver.busNombre || driver.busId || "-")}<br><span class="small">${escapeHtml(driver.busPatente || "-")}</span>`,
      escapeHtml(driver.rutaNombre || "-"),
      location?.activo === true
        ? '<span class="status online">En ruta</span>'
        : '<span class="status offline">Detenido</span>',
      `<button class="small-btn blue" data-edit-driver="${driver.id}">Modificar</button>`
    ];
  });

  $("driverList").innerHTML = table(
    ["Conductor", "Correo", "Bus y patente", "Ruta", "Estado", "Acción"],
    rows
  );
}

function renderRoutes() {
  const rows = routes.map(route => {
    const assigned = buses.filter(bus => bus.rutaId === route.id);

    const active = companyActiveLocations().filter(([busId, location]) => {
      const bus = buses.find(item => item.id === busId);
      return (location.rutaId || bus?.rutaId) === route.id;
    });

    const activeNames = active.length
      ? active.map(([busId, location]) => (
          `🚌 ${escapeHtml(location.busNombre || buses.find(bus => bus.id === busId)?.nombre || busId)}`
        )).join("<br>")
      : "-";

    return [
      escapeHtml(route.nombre || route.id),
      `${escapeHtml(route.origen || "-")} → ${escapeHtml(route.destino || "-")}`,
      assigned.length,
      `<span class="status ${active.length ? "online" : "offline"}">${active.length} activos</span>`,
      activeNames
    ];
  });

  $("routeList").innerHTML = table(
    ["Ruta", "Recorrido", "Buses asignados", "Activos", "Buses en ruta"],
    rows
  );
}

function renderMap() {
  if (!companyMap) return;

  const visible = companyActiveLocations();
  const activeIds = new Set();
  const points = [];

  visible.forEach(([busId, location]) => {
    const bus = buses.find(item => item.id === busId);
    const lat = Number(location.lat);
    const lng = Number(location.lng);

    activeIds.add(busId);
    points.push([lat, lng]);

    const popup = `
      <div class="bus-popup">
        <div class="bus-popup-title">🚌 ${escapeHtml(location.busNombre || bus?.nombre || busId)}</div>
        <div><b>Patente:</b> ${escapeHtml(location.busPatente || bus?.patente || "-")}</div>
        <div><b>Empresa:</b> ${escapeHtml(company.nombre || "-")}</div>
        <div><b>Ruta:</b> ${escapeHtml(location.rutaNombre || bus?.rutaNombre || "-")}</div>
        <div><b>Conductor:</b> ${escapeHtml(location.conductorNombre || bus?.conductorNombre || "-")}</div>
        <div><b>Velocidad:</b> ${Math.round((Number(location.velocidad) || 0) * 3.6)} km/h</div>
        <div><b>Actualizado:</b> ${
          location.actualizado
            ? new Date(location.actualizado).toLocaleTimeString()
            : "-"
        }</div>
      </div>
    `;

    if (companyMarkers[busId]) {
      companyMarkers[busId].setLatLng([lat, lng]).setPopupContent(popup);
    } else {
      companyMarkers[busId] = L.marker([lat, lng], { icon: busIcon() })
        .addTo(companyMap)
        .bindPopup(popup);
    }
  });

  Object.keys(companyMarkers).forEach(id => {
    if (!activeIds.has(id)) {
      companyMap.removeLayer(companyMarkers[id]);
      delete companyMarkers[id];
    }
  });

  if (points.length === 1) {
    companyMap.setView(points[0], 15);
  } else if (points.length > 1) {
    companyMap.fitBounds(points, { padding: [35, 35] });
  }

  setTimeout(() => companyMap.invalidateSize(), 80);
}

function fillDriverEditor() {
  $("editDriverSelect").innerHTML =
    '<option value="">Selecciona un conductor</option>' +
    drivers.map(driver => (
      `<option value="${driver.id}">${escapeHtml(driver.nombre)}</option>`
    )).join("");

  $("editDriverBus").innerHTML =
    '<option value="">Selecciona bus</option>' +
    buses
      .filter(bus => bus.activo !== false)
      .map(bus => (
        `<option value="${bus.id}">${escapeHtml(bus.nombre || bus.id)} · ${escapeHtml(bus.patente || "-")}</option>`
      ))
      .join("");

  $("editDriverRoute").innerHTML =
    '<option value="">Selecciona ruta</option>' +
    routes
      .filter(route => route.activo !== false)
      .map(route => (
        `<option value="${route.id}">${escapeHtml(route.nombre)}</option>`
      ))
      .join("");
}

function selectDriver(driverId) {
  const driver = drivers.find(item => item.id === driverId);

  if (!driver) {
    clearDriverForm();
    return;
  }

  $("editDriverSelect").value = driver.id;
  $("editDriverName").value = driver.nombre || "";
  $("editDriverRut").value = driver.rut || "";
  $("editDriverPhone").value = driver.telefono || "";
  $("editDriverEmail").value = driver.correo || "";
  $("editDriverBus").value = driver.busId || "";
  $("editDriverRoute").value = driver.rutaId || "";
  $("editDriverPassword").value = "";
  $("driverEditMsg").textContent = "";
}

function clearDriverForm() {
  [
    "editDriverName",
    "editDriverRut",
    "editDriverPhone",
    "editDriverEmail",
    "editDriverPassword"
  ].forEach(id => {
    $(id).value = "";
  });

  $("editDriverBus").value = "";
  $("editDriverRoute").value = "";
}

async function updateDriver() {
  const driverId = value("editDriverSelect");
  const msg = $("driverEditMsg");

  if (!driverId) {
    return alert("Selecciona un conductor.");
  }

  const payload = {
    driverId,
    nombre: value("editDriverName"),
    rut: value("editDriverRut"),
    telefono: value("editDriverPhone"),
    email: value("editDriverEmail").toLowerCase(),
    busId: value("editDriverBus"),
    rutaId: value("editDriverRoute"),
    password: value("editDriverPassword")
  };

  if (
    !payload.nombre ||
    !payload.email ||
    !payload.busId ||
    !payload.rutaId
  ) {
    return alert("Completa nombre, correo, bus y ruta.");
  }

  if (payload.password && payload.password.length < 6) {
    return alert("La nueva contraseña debe tener al menos 6 caracteres.");
  }

  msg.textContent = "Guardando cambios...";

  try {
    await updateDriverFunction(payload);
    msg.textContent = "Conductor actualizado correctamente.";
    await loadCompanyData();
    selectDriver(driverId);
  } catch (error) {
    msg.textContent = error.message;
  }
}

async function logout() {
  await auth.signOut();
  location.reload();
}

$("loginButton").addEventListener("click", loginCompany);
$("logoutButton").addEventListener("click", logout);
$("updateDriverButton").addEventListener("click", updateDriver);

$("editDriverSelect").addEventListener("change", event => {
  selectDriver(event.target.value);
});

document.querySelectorAll(".nav button[data-section]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".section").forEach(section => section.classList.add("hidden"));
    $(button.dataset.section).classList.remove("hidden");

    document.querySelectorAll(".nav button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");

    if (button.dataset.section === "dashboard" && companyMap) {
      setTimeout(() => companyMap.invalidateSize(), 100);
    }
  });
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-edit-driver]");

  if (button) {
    selectDriver(button.dataset.editDriver);

    document.querySelectorAll(".section").forEach(section => section.classList.add("hidden"));
    $("conductores").classList.remove("hidden");

    document.querySelectorAll(".nav button").forEach(item => item.classList.remove("active"));
    document.querySelector('[data-section="conductores"]').classList.add("active");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});
