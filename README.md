# 🍽️ Delicias — Sistema de Administración de Mesas

Sistema de gestión para restaurante con sincronización en tiempo real mediante Firebase Realtime Database.

---

## 🚀 Deploy en GitHub Pages (con GitHub Actions)

Este es el método recomendado. Tus credenciales de Firebase **nunca se suben al repositorio** — se guardan como Secrets de GitHub y se inyectan automáticamente al hacer deploy.

### Paso 1 — Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/delicias-admin.git
git push -u origin main
```

### Paso 2 — Agregar los Secrets en GitHub

1. Ir a tu repositorio en GitHub
2. **Settings → Secrets and variables → Actions**
3. Click en **"New repository secret"** y agregar uno por uno:

| Nombre del Secret               | Valor                                                      |
|---------------------------------|------------------------------------------------------------|
| `FIREBASE_API_KEY`              | `AIzaSyCdKSf2g1cIyXrD6k_u1aR9TMln9HaPJro`                |
| `FIREBASE_AUTH_DOMAIN`          | `delicia-restaurante.firebaseapp.com`                      |
| `FIREBASE_DATABASE_URL`         | `https://delicia-restaurante-default-rtdb.firebaseio.com` |
| `FIREBASE_PROJECT_ID`           | `delicia-restaurante`                                      |
| `FIREBASE_STORAGE_BUCKET`       | `delicia-restaurante.firebasestorage.app`                  |
| `FIREBASE_MESSAGING_SENDER_ID`  | `653903447900`                                             |
| `FIREBASE_APP_ID`               | `1:653903447900:web:85cffda9d703e464af6399`               |
| `ADMIN_PASSWORD`                | `(tu contraseña admin del restaurante)`                   |

### Paso 3 — Activar GitHub Pages

1. En tu repositorio: **Settings → Pages**
2. En **Source** seleccionar: **"GitHub Actions"**
3. Guardar

### Paso 4 — Deploy automático

El workflow corre automáticamente con cada `git push` a `main`.
También puedes ejecutarlo manualmente: **Actions → Deploy Delicias Admin → Run workflow**

✅ Tu app estará en: `https://TU_USUARIO.github.io/delicias-admin/`

---

## 💻 Desarrollo Local

1. Crea `js/env.js` (está en `.gitignore`, no se sube):
   ```bash
   cp js/env.example.js js/env.js
   # Edita js/env.js con tus credenciales reales
   ```

2. Levanta un servidor local:
   ```bash
   python3 -m http.server 3000
   # o: npx serve .
   ```

3. Abrir `http://localhost:3000`

---

## 📁 Estructura

```
delicias-admin/
├── .github/workflows/deploy.yml  # 🤖 Deploy automático con GitHub Actions
├── index.html
├── manifest.json
├── sw.js
├── database.rules.json
├── css/ ...
└── js/
    ├── env.example.js   # Template — copiar a env.js para uso local
    ├── env.js           # 🔒 Credenciales locales — NO se sube a Git
    ├── firebase.js
    └── ...
```

---

## 👥 Roles

| Rol        | Acceso                                               |
|------------|------------------------------------------------------|
| `admin`    | Todo: mesas, productos, historial, usuarios          |
| `mesero`   | Mesas y productos                                    |
| `cocinero` | Solo vista de cocina                                 |

---

## 🔐 Seguridad

- Credenciales guardadas como **GitHub Secrets** — nunca en el código
- `js/env.js` en `.gitignore` — nunca sube al repo
- El workflow genera `env.js` en build time y lo descarta
- Aplicar reglas de `database.rules.json` en Firebase Console → Realtime Database → Reglas
