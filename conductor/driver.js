let watchId = null;
let currentUserData = null;

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const msg = document.getElementById("loginMsg");

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const snap = await db.collection("usuarios").doc(cred.user.uid).get();

    if (!snap.exists || snap.data().rol !== "conductor") {
      await auth.signOut();
      msg.textContent = "Este usuario no tiene rol de conductor.";
      return;
    }

    currentUserData = snap.data();
    document.getElementById("loginCard").classList.add("hidden");
    document.getElementById("driverPanel").classList.remove("hidden");
    document.getElementById("busName").textContent = currentUserData.busNombre || "Sin asignar";
    document.getElementById("routeName").textContent = currentUserData.rutaNombre || "Sin asignar";
  } catch (error) {
    msg.textContent = error.message;
  }
}

async function startTrip() {
  if (!auth.currentUser || !currentUserData?.busId) {
    alert("No tienes un bus asignado.");
    return;
  }

  if (!navigator.geolocation) {
    alert("Este dispositivo no permite usar GPS.");
    return;
  }

  document.getElementById("status").textContent = "En servicio";
  document.getElementById("status").className = "status online";

  watchId = navigator.geolocation.watchPosition(async position => {
    const payload = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      velocidad: position.coords.speed || 0,
      precision: position.coords.accuracy || 0,
      conductorId: auth.currentUser.uid,
      rutaId: currentUserData.rutaId || "",
      activo: true,
      actualizado: Date.now()
    };

    await rtdb.ref("ubicaciones/" + currentUserData.busId).set(payload);
    document.getElementById("gpsInfo").textContent =
      `Ubicación enviada: ${payload.lat.toFixed(6)}, ${payload.lng.toFixed(6)} · Precisión ${Math.round(payload.precision)} m`;
  }, error => {
    document.getElementById("gpsInfo").textContent = "Error GPS: " + error.message;
  }, {
    enableHighAccuracy: true,
    maximumAge: 3000,
    timeout: 10000
  });
}

async function stopTrip() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  if (currentUserData?.busId) {
    await rtdb.ref("ubicaciones/" + currentUserData.busId + "/activo").set(false);
    await rtdb.ref("ubicaciones/" + currentUserData.busId + "/actualizado").set(Date.now());
  }

  document.getElementById("status").textContent = "Detenido";
  document.getElementById("status").className = "status offline";
  document.getElementById("gpsInfo").textContent = "Recorrido finalizado.";
}

async function logout() {
  await stopTrip();
  await auth.signOut();
  location.reload();
}
