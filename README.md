# Bus Tracker Chile

Primera versión de un sistema web para mostrar la ubicación GPS de buses en tiempo real.

## Incluye

- Panel de conductor con inicio de sesión.
- Envío automático de ubicación GPS.
- Mapa público para clientes.
- Panel básico de administración.
- Registro de buses y rutas.
- Reglas iniciales para Firestore y Realtime Database.

## 1. Crear proyecto Firebase

1. Entra a Firebase Console.
2. Crea un proyecto.
3. Activa Authentication con correo y contraseña.
4. Crea Firestore Database.
5. Crea Realtime Database.
6. Copia la configuración web en `firebase-config.js`.

## 2. Crear usuarios

Los usuarios se crean primero en Firebase Authentication.

Después crea un documento en Firestore:

Colección: `usuarios`

ID del documento: UID del usuario de Authentication.

Ejemplo de administrador:

```json
{
  "nombre": "Administrador",
  "rol": "admin"
}
```

Ejemplo de conductor:

```json
{
  "nombre": "Juan Pérez",
  "rol": "conductor",
  "busId": "BUS-01",
  "busNombre": "Bus 01",
  "rutaId": "RUTA-01",
  "rutaNombre": "Centro - Terminal"
}
```

## 3. Reglas

- Copia `firestore.rules` en las reglas de Firestore.
- Copia `database.rules.json` en las reglas de Realtime Database.

## 4. Publicación

Puedes publicar con Firebase Hosting:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

Usa esta carpeta como carpeta pública o copia sus archivos dentro de `public`.

## Aviso importante

El GPS del navegador funciona mejor cuando la página está publicada con HTTPS.
En algunos teléfonos, el sistema puede detener la ubicación si se apaga la pantalla.
Para una versión profesional conviene desarrollar una aplicación Android dedicada.
