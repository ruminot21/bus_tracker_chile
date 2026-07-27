# Bus Tracker Chile v5 — Acceso para empresas

## Cambios incluidos

### Administrador general
- Crea una empresa junto con su correo y contraseña de acceso.
- Muestra las empresas agregadas en tarjetas separadas.
- Cada tarjeta muestra:
  - buses;
  - conductores;
  - rutas;
  - buses activos;
  - correo de contacto;
  - correo de acceso.
- Puede configurar o cambiar el acceso de una empresa existente.
- Crea conductores con correo y contraseña.
- Mantiene la gestión de buses, rutas y flota activa.

### Panel de empresa
La nueva dirección es:

```text
/empresa/
```

Cada empresa puede:
- iniciar sesión con el acceso creado por el administrador;
- ver únicamente sus buses;
- ver sus buses activos en el mapa;
- revisar sus conductores;
- cambiar nombre, RUT, teléfono, correo, bus y ruta del conductor;
- establecer una nueva contraseña para el conductor;
- revisar sus rutas y los buses activos en cada ruta.

### Seguridad
- Las contraseñas nunca se guardan en Firestore.
- Firebase no permite consultar una contraseña existente.
- La empresa puede establecer una nueva contraseña, pero no ver la anterior.
- Los cambios de correo y contraseña se realizan desde Cloud Functions usando Firebase Admin SDK.

## Paso obligatorio: desplegar Cloud Functions

La creación y modificación segura de usuarios requiere Cloud Functions.

Desde esta carpeta ejecuta:

```bash
npm install -g firebase-tools
firebase login
firebase use bus-tracker-chile
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules,database
```

Después puedes ejecutar la aplicación localmente:

```bash
python3 -m http.server 8000
```

Direcciones:

```text
http://localhost:8000/admin/
http://localhost:8000/empresa/
http://localhost:8000/conductor/
http://localhost:8000/cliente/
```

## Importante sobre el plan de Firebase

Firebase exige el plan Blaze para desplegar Cloud Functions en producción.
El plan Blaze es pago por uso y Cloud Functions mantiene cuotas de uso sin costo,
pero debes vincular una cuenta de facturación antes de desplegar.

## Empresas que ya existían

En el administrador abre **Empresas** y pulsa **Configurar acceso** en la tarjeta
de la empresa. Allí puedes crear su correo y contraseña sin volver a registrar
la empresa.

## Configuración de Firebase

Esta versión conserva `firebase-config.js`. Si aparece el error
`auth/api-key-not-valid`, copia dentro de esta carpeta el archivo
`firebase-config.js` de la versión que ya te funciona.
