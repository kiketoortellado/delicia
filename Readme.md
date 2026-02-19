# 🍽️ Delicias — Sistema de Gestión de Restaurante

Sistema web completo para gestión de mesas, pedidos y administración de restaurante. Construido con HTML/CSS/JS puro + Firebase Realtime Database.

## 📁 Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Interfaz pública para clientes — ver menú y consultar pedido por mesa |
| `admin.html` | Panel de administración — meseros, cocineros y admin |

## 🔥 Stack

- **Frontend:** HTML5 + CSS3 + JavaScript (ES Modules)
- **Base de datos:** Firebase Realtime Database
- **Autenticación:** Sistema propio con roles (Admin / Mesero / Cocinero)
- **Impresión:** Ticket 80mm integrado

## 👥 Roles

| Rol | Acceso |
|-----|--------|
| `admin` | Todo — mesas, productos, historial, usuarios, cierre de caja |
| `mesero` | Mesas y productos (sin admin ni cierre de caja) |
| `cocinero` | Vista de cocina exclusiva — pedidos activos en tiempo real |

## ✅ Correcciones aplicadas (v2)

### `index.html`
- **Bug CSS corregido:** `display:none` y `display:flex` duplicados en `.error-msg` — ahora solo `display:none` en la regla base y `display:flex` en `.visible`
- **Bug QR corregido:** `DOMContentLoaded` dentro de un módulo ES nunca dispara — eliminado, el código corre directamente
- **`window.$` movido al inicio** del script para evitar referencias temporales
- **Firebase:** Suscripción por mesa individual (`onValue(ref(db,'mesas/N'))`) en lugar de toda la colección — reduce tráfico de datos
- **Badge "pedido actualizado"** en tiempo real cuando el mesero agrega items mientras el cliente está viendo su pedido
- **Búsqueda de productos** en el menú con filtro en tiempo real
- **Memoria de última mesa** usada en `localStorage` (precarga el input en la próxima visita)

### `admin.html`
- **`window.$` movido al inicio** del script
- **Imports de Firebase ampliados:** `runTransaction`, `onDisconnect`, `serverTimestamp`
- **Transacciones atómicas** en `confirmarPedido()` via `runTransaction` — evita condición de carrera si dos meseros abren la misma mesa simultáneamente
- **Manejo de errores en todas las operaciones Firebase** — feedback visible al usuario si falla la escritura, con reintento automático en `saveMesa`
- **Presencia en tiempo real:** Al iniciar sesión se registra el usuario en `/presencia/` con `onDisconnect().remove()` — Firebase lo borra automáticamente si el tab se cierra o pierde internet
- **Panel "Usuarios Conectados Ahora"** en el tab Admin — visible solo para el admin, muestra quién está online en este momento
- **Confirmación antes del Cierre de Caja** con resumen de clientes y total
- **Logout limpia la presencia** antes de cerrar sesión

## 🔐 Seguridad recomendada (Firebase Rules)

Agregar en la consola de Firebase → Realtime Database → Rules:

```json
{
  "rules": {
    "productos": {
      ".read": true,
      ".write": "auth != null"
    },
    "mesas": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "historial": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "usuarios": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "actividad": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "presencia": {
      "$uid": {
        ".read": "auth != null",
        ".write": true
      }
    }
  }
}
```

> ⚠️ **Importante:** Las contraseñas están guardadas en texto plano en Firebase. Se recomienda migrar a Firebase Authentication para producción real.

## 🚀 Deploy en GitHub Pages

1. Subir `index.html`, `admin.html` y `README.md` a un repositorio
2. Ir a Settings → Pages → Branch: `main` → Save
3. Acceder en `https://tuusuario.github.io/tu-repo/`

## 📱 URLs de acceso por QR

Para que los clientes consulten su pedido directamente:
```
https://tudominio.com/index.html?mesa=5
```
El sistema detecta el parámetro `?mesa=N` y abre directamente la consulta de esa mesa.
