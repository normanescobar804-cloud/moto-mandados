# Moto Mandados

Plataforma web progresiva (PWA) para gestión de entregas en moto, viajes de pasajeros, radar de proximidad, billetera con recargas Banpro Nicaragua / Banco LAFISE y notificaciones push.

## Instalación en Teléfono o PC (PWA)

La aplicación incluye `manifest.webmanifest`, íconos adaptables (`192x192`, `512x512`, `maskable`, `apple-touch-icon`) y Service Worker (`sw.js` + `sw-push.js`):

- **Android (Chrome / Edge):** Abre la app y presiona **"Instalar App"** o Menú `⋮` → **Instalar aplicación**.
- **iPhone / iPad (Safari):** Toca **Compartir** → **Agregar a pantalla de inicio**.
- **PC / Mac (Chrome / Edge):** Haz clic en el ícono de instalación en la barra de direcciones o en el botón **"Instalar en Móvil / PC"** dentro de la app.

## Desarrollo Local

```bash
npm install
cp .env.example .env
npm run dev
```

Compilación de producción:

```bash
npm run build
npm start
```

## Publicar en GitHub

```bash
git init
git branch -M main
git add .
git commit -m "Moto Mandados PWA listo para Firebase y dispositivos"
git remote add origin https://github.com/TU_USUARIO/moto-mandados.git
git push -u origin main
```

## Despliegue en Firebase

Proyecto configurado: `trim-scarab-mdx1j` (`.firebaserc` y `firebase.json`).

### Opción A — Firebase App Hosting (Recomendada para app full-stack + GitHub)

1. En **Firebase Console → App Hosting**, conecta tu repositorio de GitHub (`main`).
2. Firebase detectará `apphosting.yaml`, ejecutará `npm run build` y levantará `npm start` (`server.ts`) automáticamente.
3. Si usas Google Maps o Web Push con claves propias, configura los secretos desde CLI:
   ```bash
   firebase apphosting:secrets:set GOOGLE_MAPS_API_KEY
   firebase apphosting:secrets:set VAPID_PUBLIC_KEY
   firebase apphosting:secrets:set VAPID_PRIVATE_KEY
   ```

### Opción B — Firebase Hosting + Reglas de Firestore

```bash
firebase login
npm run build
firebase deploy --only hosting,firestore:rules
```
