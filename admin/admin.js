"use strict";

let empresas = [];
let conductores = [];
let buses = [];
let rutas = [];
let ubicaciones = {};

let fleetMap = null;
const fleetMarkers = {};
let selectedFleetCompany = "";
let selectedFleetRoute = "";

const cloudFunctions = firebase.functions();
const createCompanyFunction = cloudFunctions.httpsCallable("createCompany");
const setCompanyAccessFunction = cloudFunctions.httpsCallable("setCompanyAccess");
const createDriverFunction = cloudFunctions.httpsCallable("createDriver");

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

function companyName(id) {
  return empresas.find(item => item.id === id)?.nombre || "-";
}

function clearFields(ids) {
  ids.forEach(id => {
    if ($(id)) $(id).value = "";
  });
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
    html: '<div class="bus-pin"><span>🚌</span></div>',
    iconSize: [48, 48],
    iconAnchor: [24, 43],
    popupAnchor: [0, -38]
  });
}

async function loginAdmin() {
  $("loginMsg").textContent = "";

  try {
    const credential = await auth.signInWithEmailAndPassword(
      value("loginEmail"),
      value("loginPassword")
    );

    const userDoc = await db.collection("usuarios").doc(credential.user.uid).get();

    if (!userDoc.exists || userDoc.data().rol !== "admin") {
      await auth.signOut();
      throw new Error("Este usuario no tiene permisos de administrador.");
    }

    $("loginCard").classList.add("hidden");
    $("adminPanel").classList.remove("hidden");

    initFleetMap();
    listenLocations();
    await reloadAll();
  } catch (error) {
    $("loginMsg").textContent = error.message;
  }
}

function initFleetMap() {
  if (fleetMap) return;

  fleetMap = L.map("fleetMap").setView([-33.4489, -70.6693], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(fleetMap);
}

function listenLocations() {
  rtdb.ref("ubicaciones").on("value", snapshot => {
    ubicaciones = snapshot.val() || {};
    renderAll();
  });
}

async function reloadAll() {
  const [companySnap, userSnap, busSnap, routeSnap] = await Promise.all([
    db.collection("empresas").get(),
    db.collection("usuarios").get(),
    db.collection("buses").get(),
    db.collection("rutas").get()
  ]);

  empresas = companySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  conductores = userSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.rol === "conductor");

  buses = busSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  rutas = routeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  fillSelects();
  renderAll();
}

function fillSelects() {
  const companyOptions =
    '<option value="">Selecciona empresa</option>' +
    empresas
      .filter(company => company.activo !== false)
      .map(company => `<option value="${company.id}">${escapeHtml(company.nombre)}</option>`)
      .join("");

  ["conductorEmpresa", "busEmpresa", "rutaEmpresa"].forEach(id => {
    $(id).innerHTML = companyOptions;
  });

  $("fleetCompanyFilter").innerHTML =
    '<option value="">Todas las empresas</option>' +
    empresas
      .filter(company => company.activo !== false)
      .map(company => `<option value="${company.id}">${escapeHtml(company.nombre)}</option>`)
      .join("");

  refreshDriverAssignmentSelects();
  refreshFleetRouteFilter();
}

function refreshDriverAssignmentSelects() {
  const companyId = value("conductorEmpresa");

  const companyBuses = buses.filter(
    bus => bus.empresaId === companyId && bus.activo !== false
  );

  const companyRoutes = rutas.filter(
    route => route.empresaId === companyId && route.activo !== false
  );

  $("conductorBus").innerHTML =
    '<option value="">Selecciona bus</option>' +
    companyBuses
      .map(bus => (
        `<option value="${bus.id}">${escapeHtml(bus.nombre || bus.id)} · ${escapeHtml(bus.patente || "Sin patente")}</option>`
      ))
      .join("");

  $("conductorRuta").innerHTML =
    '<option value="">Selecciona ruta</option>' +
    companyRoutes
      .map(route => `<option value="${route.id}">${escapeHtml(route.nombre)}</option>`)
      .join("");
}

function refreshFleetRouteFilter() {
  const routes = selectedFleetCompany
    ? rutas.filter(route => route.empresaId === selectedFleetCompany)
    : rutas;

  $("fleetRouteFilter").innerHTML =
    '<option value="">Todas las rutas</option>' +
    routes.map(route => `<option value="${route.id}">${escapeHtml(route.nombre)}</option>`).join("");

  $("fleetRouteFilter").value = selectedFleetRoute;
}

function activeLocations() {
  return Object.entries(ubicaciones).filter(([, location]) => {
    return (
      location?.activo === true &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng))
    );
  });
}

function renderAll() {
  renderDashboard();
  renderCompanies();
  renderDrivers();
  renderBuses();
  renderRoutes();
  renderActiveFleet();
  renderFleetMap();
}

function renderDashboard() {
  $("countEmpresas").textContent = empresas.length;
  $("countConductores").textContent = conductores.length;
  $("countBuses").textContent = buses.length;
  $("countActivos").textContent = activeLocations().length;
}

function renderCompanies() {
  if (!empresas.length) {
    $("empresaList").innerHTML = '<div class="empty">Todavía no hay empresas registradas.</div>';
    return;
  }

  $("empresaList").innerHTML = empresas.map(company => {
    const companyDrivers = conductores.filter(driver => driver.empresaId === company.id);
    const companyBuses = buses.filter(bus => bus.empresaId === company.id);
    const companyRoutes = rutas.filter(route => route.empresaId === company.id);

    const companyActive = activeLocations().filter(([busId, location]) => {
      const bus = buses.find(item => item.id === busId);
      return (location.empresaId || bus?.empresaId) === company.id;
    });

    return `
      <article class="company-card">
        <div class="company-card-head">
          <div>
            <h3>${escapeHtml(company.nombre)}</h3>
            <span class="status ${company.activo === false ? "offline" : "online"}">
              ${company.activo === false ? "Inactiva" : "Activa"}
            </span>
          </div>
          <div class="company-icon">🏢</div>
        </div>

        <div class="company-data">
          <div><b>RUT:</b> ${escapeHtml(company.rut || "-")}</div>
          <div><b>Correo de contacto:</b> ${escapeHtml(company.correo || "-")}</div>
          <div><b>Correo de acceso:</b> ${escapeHtml(company.accessEmail || "Sin acceso configurado")}</div>
          <div><b>Teléfono:</b> ${escapeHtml(company.telefono || "-")}</div>
        </div>

        <div class="company-stats">
          <div><strong>${companyBuses.length}</strong><span>Buses</span></div>
          <div><strong>${companyDrivers.length}</strong><span>Conductores</span></div>
          <div><strong>${companyRoutes.length}</strong><span>Rutas</span></div>
          <div><strong>${companyActive.length}</strong><span>Activos</span></div>
        </div>

        <div class="company-actions">
          <button class="small-btn blue"
            data-company-access="${company.id}"
            data-company-email="${escapeHtml(company.accessEmail || "")}">
            Configurar acceso
          </button>

          <button class="small-btn ${company.activo === false ? "success" : "warning"}"
            data-company-toggle="${company.id}"
            data-company-state="${company.activo === false}">
            ${company.activo === false ? "Activar" : "Desactivar"}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderDrivers() {
  const rows = conductores.map(driver => {
    const location = driver.busId ? ubicaciones[driver.busId] : null;

    return [
      escapeHtml(driver.nombre || "-"),
      escapeHtml(driver.correo || "-"),
      escapeHtml(companyName(driver.empresaId)),
      `🚌 ${escapeHtml(driver.busNombre || driver.busId || "-")}<br><span class="small">${escapeHtml(driver.busPatente || "-")}</span>`,
      escapeHtml(driver.rutaNombre || "-"),
      location?.activo === true
        ? '<span class="status online">En ruta</span>'
        : '<span class="status offline">Detenido</span>'
    ];
  });

  $("conductorList").innerHTML = table(
    ["Conductor", "Correo", "Empresa", "Bus y patente", "Ruta", "Estado"],
    rows
  );
}

function renderBuses() {
  const rows = buses.map(bus => {
    const location = ubicaciones[bus.id];

    return [
      `🚌 ${escapeHtml(bus.nombre || bus.id)}`,
      escapeHtml(bus.patente || "-"),
      escapeHtml(bus.marca || "-"),
      escapeHtml(bus.capacidad || "-"),
      escapeHtml(companyName(bus.empresaId)),
      escapeHtml(bus.conductorNombre || "-"),
      location?.activo === true
        ? '<span class="status online">Activo</span>'
        : '<span class="status offline">Detenido</span>'
    ];
  });

  $("busList").innerHTML = table(
    ["Bus", "Patente", "Marca", "Capacidad", "Empresa", "Conductor", "Estado"],
    rows
  );
}

function visibleActiveLocations() {
  return activeLocations().filter(([busId, location]) => {
    const bus = buses.find(item => item.id === busId);
    const companyId = location.empresaId || bus?.empresaId || "";
    const routeId = location.rutaId || bus?.rutaId || "";

    if (selectedFleetCompany && companyId !== selectedFleetCompany) return false;
    if (selectedFleetRoute && routeId !== selectedFleetRoute) return false;

    return true;
  });
}

function renderRoutes() {
  const routesToRender = rutas.filter(route => {
    return !selectedFleetCompany || route.empresaId === selectedFleetCompany;
  });

  const rows = routesToRender.map(route => {
    const assigned = buses.filter(bus => bus.rutaId === route.id);
    const active = visibleActiveLocations().filter(([busId, location]) => {
      const bus = buses.find(item => item.id === busId);
      return (location.rutaId || bus?.rutaId) === route.id;
    });

    return [
      escapeHtml(route.nombre || route.id),
      escapeHtml(companyName(route.empresaId)),
      `${escapeHtml(route.origen || "-")} → ${escapeHtml(route.destino || "-")}`,
      assigned.length,
      `<span class="status ${active.length ? "online" : "offline"}">${active.length} activos</span>`
    ];
  });

  $("rutaList").innerHTML = table(
    ["Ruta", "Empresa", "Recorrido", "Buses asignados", "Buses en ruta"],
    rows
  );
}

function renderActiveFleet() {
  const rows = visibleActiveLocations().map(([busId, location]) => {
    const bus = buses.find(item => item.id === busId);

    return [
      `🚌 ${escapeHtml(location.busNombre || bus?.nombre || busId)}`,
      escapeHtml(location.busPatente || bus?.patente || "-"),
      escapeHtml(companyName(location.empresaId || bus?.empresaId)),
      escapeHtml(location.rutaNombre || bus?.rutaNombre || "-"),
      escapeHtml(location.conductorNombre || bus?.conductorNombre || "-"),
      `${Math.round((Number(location.velocidad) || 0) * 3.6)} km/h`,
      location.actualizado
        ? new Date(location.actualizado).toLocaleTimeString()
        : "-"
    ];
  });

  $("activeFleetList").innerHTML = table(
    ["Bus", "Patente", "Empresa", "Ruta", "Conductor", "Velocidad", "Actualizado"],
    rows
  );
}

function renderFleetMap() {
  if (!fleetMap) return;

  const visible = visibleActiveLocations();
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
        <div><b>Empresa:</b> ${escapeHtml(companyName(location.empresaId || bus?.empresaId))}</div>
        <div><b>Ruta:</b> ${escapeHtml(location.rutaNombre || bus?.rutaNombre || "-")}</div>
        <div><b>Conductor:</b> ${escapeHtml(location.conductorNombre || bus?.conductorNombre || "-")}</div>
      </div>
    `;

    if (fleetMarkers[busId]) {
      fleetMarkers[busId].setLatLng([lat, lng]).setPopupContent(popup);
    } else {
      fleetMarkers[busId] = L.marker([lat, lng], { icon: busIcon() })
        .addTo(fleetMap)
        .bindPopup(popup);
    }
  });

  Object.keys(fleetMarkers).forEach(id => {
    if (!activeIds.has(id)) {
      fleetMap.removeLayer(fleetMarkers[id]);
      delete fleetMarkers[id];
    }
  });

  if (points.length === 1) {
    fleetMap.setView(points[0], 15);
  } else if (points.length > 1) {
    fleetMap.fitBounds(points, { padding: [35, 35] });
  }

  setTimeout(() => fleetMap.invalidateSize(), 50);
}

async function saveEmpresa() {
  const msg = $("empresaMsg");
  msg.textContent = "Creando empresa y acceso...";

  const payload = {
    nombre: value("empresaNombre"),
    rut: value("empresaRut"),
    telefono: value("empresaTelefono"),
    correo: value("empresaCorreo"),
    direccion: value("empresaDireccion"),
    encargadoNombre: value("empresaAccessName"),
    accessEmail: value("empresaAccessEmail").toLowerCase(),
    password: value("empresaAccessPassword")
  };

  if (!payload.nombre || !payload.encargadoNombre || !payload.accessEmail || payload.password.length < 6) {
    msg.textContent = "";
    return alert("Completa nombre de empresa, encargado, correo de acceso y contraseña de al menos 6 caracteres.");
  }

  try {
    await createCompanyFunction(payload);

    clearFields([
      "empresaNombre",
      "empresaRut",
      "empresaTelefono",
      "empresaCorreo",
      "empresaDireccion",
      "empresaAccessName",
      "empresaAccessEmail",
      "empresaAccessPassword"
    ]);

    msg.textContent = "Empresa y acceso creados correctamente.";
    await reloadAll();
  } catch (error) {
    msg.textContent = error.message;
  }
}

async function configureCompanyAccess(companyId, currentEmail) {
  const email = prompt(
    "Correo con el que la empresa entrará al sistema:",
    currentEmail || ""
  );

  if (!email) return;

  const password = prompt(
    "Escribe la nueva contraseña. Debe tener al menos 6 caracteres:"
  );

  if (!password || password.length < 6) {
    return alert("La contraseña debe tener al menos 6 caracteres.");
  }

  try {
    await setCompanyAccessFunction({
      companyId,
      accessEmail: email.trim().toLowerCase(),
      password
    });

    alert("Acceso de empresa actualizado.");
    await reloadAll();
  } catch (error) {
    alert(error.message);
  }
}

async function saveBus() {
  const id = value("busId");

  const data = {
    nombre: value("busNombre"),
    patente: value("busPatente").toUpperCase(),
    marca: value("busMarca"),
    capacidad: Number(value("busCapacidad") || 0),
    empresaId: value("busEmpresa"),
    activo: true,
    estado: "detenido",
    creado: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (
    !id ||
    !data.nombre ||
    !data.patente ||
    !data.marca ||
    data.capacidad < 1 ||
    !data.empresaId
  ) {
    return alert("Completa código, nombre, patente, marca, capacidad y empresa.");
  }

  await db.collection("buses").doc(id).set(data, { merge: true });

  clearFields([
    "busId",
    "busNombre",
    "busPatente",
    "busMarca",
    "busCapacidad",
    "busEmpresa"
  ]);

  await reloadAll();
}

async function saveRuta() {
  const id = value("rutaId");

  const data = {
    nombre: value("rutaNombre"),
    origen: value("rutaOrigen"),
    destino: value("rutaDestino"),
    empresaId: value("rutaEmpresa"),
    activo: true,
    creado: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (!id || !data.nombre || !data.empresaId) {
    return alert("Completa código, nombre y empresa.");
  }

  await db.collection("rutas").doc(id).set(data, { merge: true });

  clearFields([
    "rutaId",
    "rutaNombre",
    "rutaOrigen",
    "rutaDestino",
    "rutaEmpresa"
  ]);

  await reloadAll();
}

async function saveConductor() {
  const msg = $("conductorMsg");
  msg.textContent = "Creando conductor...";

  const payload = {
    nombre: value("conductorNombre"),
    rut: value("conductorRut"),
    telefono: value("conductorTelefono"),
    empresaId: value("conductorEmpresa"),
    busId: value("conductorBus"),
    rutaId: value("conductorRuta"),
    email: value("conductorCorreo").toLowerCase(),
    password: value("conductorPassword")
  };

  if (
    !payload.nombre ||
    !payload.empresaId ||
    !payload.busId ||
    !payload.rutaId ||
    !payload.email ||
    payload.password.length < 6
  ) {
    msg.textContent = "";
    return alert("Completa nombre, empresa, bus, ruta, correo y contraseña de al menos 6 caracteres.");
  }

  try {
    await createDriverFunction(payload);

    clearFields([
      "conductorNombre",
      "conductorRut",
      "conductorTelefono",
      "conductorEmpresa",
      "conductorBus",
      "conductorRuta",
      "conductorCorreo",
      "conductorPassword"
    ]);

    msg.textContent = "Conductor y acceso creados correctamente.";
    await reloadAll();
  } catch (error) {
    msg.textContent = error.message;
  }
}

async function toggleCompany(companyId, active) {
  await db.collection("empresas").doc(companyId).set(
    { activo: active },
    { merge: true }
  );

  await reloadAll();
}

async function logout() {
  await auth.signOut();
  location.reload();
}

$("loginButton").addEventListener("click", loginAdmin);
$("logoutButton").addEventListener("click", logout);
$("saveEmpresaButton").addEventListener("click", saveEmpresa);
$("saveBusButton").addEventListener("click", saveBus);
$("saveRutaButton").addEventListener("click", saveRuta);
$("saveConductorButton").addEventListener("click", saveConductor);

$("conductorEmpresa").addEventListener("change", refreshDriverAssignmentSelects);

$("fleetCompanyFilter").addEventListener("change", event => {
  selectedFleetCompany = event.target.value;
  selectedFleetRoute = "";
  refreshFleetRouteFilter();
  renderRoutes();
  renderActiveFleet();
  renderFleetMap();
});

$("fleetRouteFilter").addEventListener("change", event => {
  selectedFleetRoute = event.target.value;
  renderRoutes();
  renderActiveFleet();
  renderFleetMap();
});

document.querySelectorAll(".nav button[data-section]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".section").forEach(section => section.classList.add("hidden"));
    $(button.dataset.section).classList.remove("hidden");

    document.querySelectorAll(".nav button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");

    if (button.dataset.section === "rutas" && fleetMap) {
      setTimeout(() => fleetMap.invalidateSize(), 100);
    }
  });
});

document.addEventListener("click", async event => {
  const accessButton = event.target.closest("[data-company-access]");

  if (accessButton) {
    await configureCompanyAccess(
      accessButton.dataset.companyAccess,
      accessButton.dataset.companyEmail
    );
  }

  const toggleButton = event.target.closest("[data-company-toggle]");

  if (toggleButton) {
    await toggleCompany(
      toggleButton.dataset.companyToggle,
      toggleButton.dataset.companyState === "true"
    );
  }
});
