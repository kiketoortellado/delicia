# 🍽️ Delicias — Sistema de Administración de Mesas

Sistema de gestión para restaurante con sincronización en tiempo real mediante Firebase Realtime Database.

---

## 📁 Estructura del Proyecto

```
delicias-admin/
├── index.html              # App principal (HTML + SVG sprite inline)
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline support)
├── database.rules.json     # Reglas de seguridad Firebase
├── .gitignore
│
├── css/
│   ├── variables.css       # Design tokens (colores, sombras, transiciones)
│   ├── base.css            # Reset, tipografía, animaciones
│   ├── components.css      # Botones, badges, modales, tabs, formularios
│   └── layout.css          # Header, grids, tarjetas de mesa, cocina, nav
│
├── js/
│   ├── env.example.js      # ⚠️  Template para credenciales (copiar a env.js)
│   ├── env.js              # 🔒 TUS credenciales — NO subir a Git
│   ├── firebase.js         # Inicialización Firebase + exports de métodos
│   ├── state.js            # Store centralizado con pub/sub
│   ├── ui.js               # Helpers DOM, toast, formato de fechas
│   ├── auth.js             # Login, logout, roles, presencia Firebase
│   ├── mesas.js            # Gestión de mesas, pedidos, tickets, timers
│   ├── productos.js        # CRUD de productos
│   ├── historial.js        # Historial de ventas con filtros de fecha
│   ├── actividad.js        # Log de actividad de usuarios
│   ├── usuarios.js         # Gestión de usuarios del sistema
│   ├── cocina.js           # Vista de cocina (solo pedidos de comida)
│   ├── reportes.js         # Exportación Excel con SheetJS
│   └── app.js              # Boot: carga datos, suscripciones realtime, SW
│
└── assets/
    └── icons.svg           # Sprite SVG con todos los íconos
```

---

## ⚙️ Configuración Inicial

### 1. Crear `js/env.js` con tus credenciales de Firebase

```bash
cp js/env.example.js js/env.js
```

Editar `js/env.js`:

```javascript
window.ENV = {
  apiKey:            "AIzaSy...",
  authDomain:        "tu-proyecto.firebaseapp.com",
  databaseURL:       "https://tu-proyecto-default-rtdb.firebaseio.com",
  projectId:         "tu-proyecto",
  storageBucket:     "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc",
  ADMIN_PASSWORD:    "tu_password_seguro"  // cambia esto
};
```

> 🔒 `js/env.js` está en `.gitignore` — nunca se sube al repositorio.

### 2. Donde encontrar estas credenciales

1. Ir a [Firebase Console](https://console.firebase.google.com)
2. Seleccionar tu proyecto → ⚙️ Configuración → General
3. Bajar hasta "Tu aplicación" → SDK de Firebase → Configuración
4. Copiar el objeto `firebaseConfig`

### 3. Aplicar reglas de seguridad

En Firebase Console → Realtime Database → Reglas → Pegar el contenido de `database.rules.json` → Publicar.

---

## 👥 Roles del Sistema

| Rol        | Acceso                                      |
|------------|---------------------------------------------|
| `admin`    | Todo: mesas, productos, historial, usuarios, panel admin |
| `mesero`   | Mesas y productos (sin admin)               |
| `cocinero` | Solo vista de cocina (pedidos de comida)    |

**Usuario admin master:** configurado en `window.ENV.ADMIN_PASSWORD`

**Usuarios dinámicos:** creados desde el panel Admin → Usuarios del Sistema.

---

## 🚀 Despliegue

### Opción A — GitHub Pages (gratis)

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/delicias-admin.git
git push -u origin main
```

En GitHub → Settings → Pages → Source: `main` / `/ (root)`.

> ⚠️ **No subas `js/env.js`** — usa [GitHub Secrets](https://docs.github.com/actions/security-guides/encrypted-secrets) o [Netlify Environment Variables](https://docs.netlify.com/environment-variables/overview/) para inyectar las credenciales en CI/CD.

### Opción B — Netlify (recomendado)

1. Drag & drop la carpeta `delicias-admin/` en [app.netlify.com/drop](https://app.netlify.com/drop)
2. ¡Listo! URL pública en segundos.

### Opción C — Vercel

```bash
npm i -g vercel
vercel
```

### Opción D — Servidor propio / XAMPP

Copiar la carpeta al directorio `htdocs` o `www`. Abrir en navegador.

> ⚠️ Necesita servidor HTTP (no `file://`) por los módulos ES.

---

## 📱 Características

- **Tiempo real** — Sincronización inmediata entre todos los dispositivos
- **12 mesas** con timers de alerta (90 min)
- **Pedidos** por categoría: comida, bebida, postre
- **Historial** con filtros de fecha y exportación Excel (4 hojas)
- **Vista cocina** solo comidas, hasta 5 tarjetas simultáneas
- **Tickets** formato térmico 80mm + WhatsApp móvil
- **Presencia** — ver qué usuarios están conectados en tiempo real
- **Log de actividad** — auditoría de acciones
- **PWA** — instalable en celular, funciona offline (parcialmente)
- **Cierre de caja** — resumen del día

---

## 🛠️ Desarrollo Local

Si quieres usar un servidor de desarrollo:

```bash
# Con Python (sin instalar nada)
cd delicias-admin
python3 -m http.server 3000

# Con Node.js
npx serve .

# Con VS Code Live Server
# Instalar extensión "Live Server" → click derecho en index.html → Open with Live Server
```

---

## 🔐 Seguridad — Notas Importantes

El sistema actual usa autenticación propia (no Firebase Auth). Para producción en escala:

1. **Migrar a Firebase Authentication** — elimina la necesidad de manejar contraseñas manualmente
2. **Usar Firebase App Check** — previene acceso desde apps no autorizadas
3. **Reglas de seguridad estrictas** — actualmente permiten lectura/escritura pública. Con Firebase Auth se puede restrictar a usuarios autenticados
4. **HTTPS obligatorio** — nunca servir desde HTTP en producción

---

## 📊 Exportación Excel

El archivo exportado (`ventas_FECHA.xlsx`) incluye 4 hojas:
- **Ventas Detalladas** — cada pedido individual
- **Por Mesa** — resumen agrupado por mesa
- **Por Categoría** — totales por comida/bebida/postre
- **Actividad** — log completo de acciones del día
