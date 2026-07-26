async function loginAdmin() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const msg = document.getElementById("msg");

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const snap = await db.collection("usuarios").doc(cred.user.uid).get();

    if (!snap.exists || snap.data().rol !== "admin") {
      await auth.signOut();
      msg.textContent = "No tienes permisos de administrador.";
      return;
    }

    document.getElementById("adminLogin").classList.add("hidden");
    document.getElementById("adminPanel").classList.remove("hidden");
    loadBuses();
  } catch (error) {
    msg.textContent = error.message;
  }
}

async function saveBus() {
  const id = document.getElementById("busId").value.trim();
  const patente = document.getElementById("busPatente").value.trim();
  const numeroInterno = document.getElementById("busNumero").value.trim();

  if (!id || !patente) return alert("Completa ID y patente.");

  await db.collection("buses").doc(id).set({
    patente,
    numeroInterno,
    estado: "fuera_servicio",
    creado: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  alert("Bus guardado.");
  loadBuses();
}

async function saveRoute() {
  const id = document.getElementById("routeId").value.trim();
  const nombre = document.getElementById("routeName").value.trim();
  const origen = document.getElementById("routeOrigin").value.trim();
  const destino = document.getElementById("routeDestination").value.trim();

  if (!id || !nombre) return alert("Completa ID y nombre.");

  await db.collection("rutas").doc(id).set({
    nombre, origen, destino,
    creado: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  alert("Ruta guardada.");
}

async function loadBuses() {
  const snap = await db.collection("buses").get();
  const rows = snap.docs.map(doc => {
    const b = doc.data();
    return `<tr><td>${doc.id}</td><td>${b.patente || ""}</td><td>${b.numeroInterno || ""}</td></tr>`;
  }).join("");

  document.getElementById("busList").innerHTML =
    `<table><thead><tr><th>ID</th><th>Patente</th><th>Número</th></tr></thead><tbody>${rows}</tbody></table>`;
}
