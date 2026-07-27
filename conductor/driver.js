"use strict";

let watchId = null;
let currentData = null;
let companyData = null;
let busData = null;

const $ = id => document.getElementById(id);

async function login() {
  $("msg").textContent = "";

  try {
    const credential = await auth.signInWithEmailAndPassword(
      $("email").value.trim(),
      $("password").value
    );

    const snap = await db
      .collection("usuarios")
      .doc(credential.user.uid)
      .get();

    if (
      !snap.exists ||
      snap.data().rol !== "conductor" ||
      snap.data().activo === false
    ) {
      await auth.signOut();
      throw new Error("Usuario conductor no válido o desactivado.");
    }

    currentData = snap.data();

    if (currentData.empresaId) {
      const companySnap = await db
        .collection("empresas")
        .doc(currentData.empresaId)
        .get();

      companyData = companySnap.exists ? companySnap.data() : null;
    }

    if (currentData.busId) {
      const busSnap = await db
        .collection("buses")
        .doc(currentData.busId)
        .get();

      busData = busSnap.exists ? busSnap.data() : null;
    }

    $("loginCard").classList.add("hidden");
    $("driverPanel").classList.remove("hidden");

    $("driverName").textContent = currentData.nombre || "Conductor";
    $("companyName").textContent = companyData?.nombre || "-";
    $("busName").textContent =
      currentData.busNombre ||
      busData?.nombre ||
      currentData.busId ||
      "Sin bus";

    $("busPlate").textContent =
      currentData.busPatente ||
      busData?.patente ||
      "-";

    $("routeName").textContent =
      currentData.rutaNombre ||
      "Sin ruta";

    $("status").textContent = "Detenido";
    $("status").className = "status offline";
    $("gpsInfo").textContent = "GPS sin iniciar. Pulsa “Iniciar recorrido”.";
  } catch (error) {
    $("msg").textContent = error.message;
  }
}

async function publishLocation(position) {
  const payload = {
    lat: Number(position.coords.latitude),
    lng: Number(position.coords.longitude),
    velocidad: Number(position.coords.speed || 0),
    precision: Number(position.coords.accuracy || 0),

    empresaId: currentData.empresaId || "",
    empresaNombre: companyData?.nombre || "",

    conductorId: auth.currentUser.uid,
    conductorNombre: currentData.nombre || "",

    rutaId: currentData.rutaId || "",
    rutaNombre: currentData.rutaNombre || "",

    busNombre:
      currentData.busNombre ||
      busData?.nombre ||
      currentData.busId,

    busPatente:
      currentData.busPatente ||
      busData?.patente ||
      "",

    busMarca: busData?.marca || "",
    activo: true,
    actualizado: Date.now()
  };

  await rtdb
    .ref("ubicaciones/" + currentData.busId)
    .set(payload);

  $("status").textContent = "En servicio";
  $("status").className = "status online";

  $("gpsInfo").textContent =
    `Ubicación enviada: ${payload.lat.toFixed(6)}, ` +
    `${payload.lng.toFixed(6)} · precisión ${Math.round(payload.precision)} m`;
}

function gpsErrorMessage(error) {
  if (error.code === 1) {
    return "Permiso de ubicación rechazado. Activa la ubicación y permite el acceso al navegador.";
  }

  if (error.code === 2) {
    return "No se pudo obtener la ubicación. Activa el GPS o la ubicación del equipo.";
  }

  if (error.code === 3) {
    return "La ubicación tardó demasiado. Intenta nuevamente o prueba desde un teléfono.";
  }

  return error.message || "No se pudo obtener la ubicación.";
}

async function startTrip() {
  if (!currentData?.busId) {
    alert("No tienes un bus asignado.");
    return;
  }

  if (!navigator.geolocation) {
    alert("Este dispositivo no permite usar GPS.");
    return;
  }

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  $("status").textContent = "Buscando GPS";
  $("status").className = "status paused";
  $("gpsInfo").textContent =
    "Solicitando permiso y buscando la ubicación…";

  navigator.geolocation.getCurrentPosition(
    async position => {
      try {
        await publishLocation(position);

        await db
          .collection("buses")
          .doc(currentData.busId)
          .set(
            {
              estado: "en_ruta",
              ultimaActualizacion:
                firebase.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );

        watchId = navigator.geolocation.watchPosition(
          async newPosition => {
            try {
              await publishLocation(newPosition);
            } catch (error) {
              console.error("Error enviando ubicación:", error);
              $("gpsInfo").textContent =
                "No se pudo guardar la ubicación en Firebase: " +
                error.message;
            }
          },
          error => {
            console.error("Error GPS:", error);
            $("gpsInfo").textContent =
              "Error GPS: " + gpsErrorMessage(error);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 3000,
            timeout: 20000
          }
        );
      } catch (error) {
        console.error("Error publicando ubicación:", error);
        $("status").textContent = "Error";
        $("status").className = "status offline";
        $("gpsInfo").textContent =
          "No se pudo guardar la ubicación en Firebase: " +
          error.message;
      }
    },
    error => {
      console.error("Error GPS inicial:", error);
      $("status").textContent = "GPS no disponible";
      $("status").className = "status offline";
      $("gpsInfo").textContent =
        "Error GPS: " + gpsErrorMessage(error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000
    }
  );
}

async function stopTrip() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (currentData?.busId) {
    try {
      const ref = rtdb.ref("ubicaciones/" + currentData.busId);
      const snapshot = await ref.once("value");

      if (snapshot.exists()) {
        await ref.update({
          activo: false,
          actualizado: Date.now()
        });
      }

      await db
        .collection("buses")
        .doc(currentData.busId)
        .set(
          { estado: "detenido" },
          { merge: true }
        );
    } catch (error) {
      console.error("Error finalizando recorrido:", error);
    }
  }

  $("status").textContent = "Detenido";
  $("status").className = "status offline";
  $("gpsInfo").textContent = "Recorrido finalizado.";
}

async function reportIncident() {
  const detalle = prompt("Describe la incidencia:");
  if (!detalle) return;

  await db.collection("incidencias").add({
    conductorId: auth.currentUser.uid,
    conductorNombre: currentData?.nombre || "",
    empresaId: currentData?.empresaId || "",
    busId: currentData?.busId || "",
    busPatente:
      currentData?.busPatente ||
      busData?.patente ||
      "",
    rutaId: currentData?.rutaId || "",
    detalle,
    estado: "pendiente",
    creado:
      firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Incidencia enviada.");
}

async function logout() {
  await stopTrip();
  await auth.signOut();
  location.reload();
}

$("loginButton").addEventListener("click", login);
$("startButton").addEventListener("click", startTrip);
$("stopButton").addEventListener("click", stopTrip);
$("incidentButton").addEventListener("click", reportIncident);
$("logoutButton").addEventListener("click", logout);
