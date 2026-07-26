const map = L.map("map").setView([-33.4489, -70.6693], 12);
const markers = {};

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

rtdb.ref("ubicaciones").on("value", snapshot => {
  const data = snapshot.val() || {};
  const activeIds = new Set();

  Object.entries(data).forEach(([busId, bus]) => {
    if (!bus.activo || typeof bus.lat !== "number" || typeof bus.lng !== "number") return;

    activeIds.add(busId);
    const text = `
      <strong>Bus ${busId}</strong><br>
      Estado: En servicio<br>
      Velocidad: ${Math.round((bus.velocidad || 0) * 3.6)} km/h<br>
      Actualizado: ${new Date(bus.actualizado).toLocaleTimeString()}
    `;

    if (markers[busId]) {
      markers[busId].setLatLng([bus.lat, bus.lng]).setPopupContent(text);
    } else {
      markers[busId] = L.marker([bus.lat, bus.lng]).addTo(map).bindPopup(text);
    }
  });

  Object.keys(markers).forEach(id => {
    if (!activeIds.has(id)) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  });
});
