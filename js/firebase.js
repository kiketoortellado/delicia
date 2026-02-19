/**
 * firebase.js — Inicialización de Firebase
 *
 * ⚠️  SEGURIDAD: Nunca subas tu config real a un repo público.
 *
 *  OPCIÓN A (GitHub Pages / hosting estático sin build):
 *    Crea un archivo `js/env.js` con:
 *      window.ENV = { FIREBASE_API_KEY: "...", ... };
 *    Y agrégalo al .gitignore.
 *    Luego usa window.ENV.FIREBASE_API_KEY aquí abajo.
 *
 *  OPCIÓN B (con Vite / bundler):
 *    Usa import.meta.env.VITE_FIREBASE_API_KEY desde .env.local
 *
 *  OPCIÓN C (GitHub Actions deploy):
 *    Inyecta secretos en el workflow y genera env.js en build time.
 */

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, set, get,
  onValue, runTransaction, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Lee la configuración desde window.ENV (ver env.example.js) ──
const ENV = window.ENV || {};

const firebaseConfig = {
  apiKey:            ENV.FIREBASE_API_KEY            || "",
  authDomain:        ENV.FIREBASE_AUTH_DOMAIN        || "",
  databaseURL:       ENV.FIREBASE_DATABASE_URL       || "",
  projectId:         ENV.FIREBASE_PROJECT_ID         || "",
  storageBucket:     ENV.FIREBASE_STORAGE_BUCKET     || "",
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID|| "",
  appId:             ENV.FIREBASE_APP_ID             || ""
};

if (!firebaseConfig.apiKey) {
  console.error(
    "⚠ Firebase no configurado. Crea js/env.js con tus credenciales (ver env.example.js)."
  );
}

const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

export {
  db, ref, set, get,
  onValue, runTransaction, onDisconnect, serverTimestamp
};
