# Evidencia de Auditoría Visual Integral — TeamSpeak vs. Figma

## Objetivo de la auditoría

Verificar y alinear la fidelidad visual de todas las pantallas, componentes compartidos y estados interactivos del frontend de **TeamSpeak** respecto al prototipo aprobado en Figma, conservando intactos los contratos REST, la lógica de autenticación, el seguimiento recuperable y las funcionalidades implementadas.

- **Prototipo aprobado en Figma**: https://www.figma.com/design/WHh4b0fAkGJeuUR4IBsvlc/TeamSpeak-UX-UI-Flow
- **Cobertura auditada**: `1012` combinaciones (`8` módulos × estados × `6` resoluciones: `1440×900`, `390×844`, `768×1024`, `800×600`, `800×360`, `320×640`), `0` pendientes.
- **Datos**: Todas las capturas utilizan identidades, sesiones y respuestas REST/Socket.IO sintéticas (sin datos personales reales ni credenciales).

---

## Resumen de correcciones por módulo

- **Autenticación (`/login`, `/registro`, `/completar-username`, `/verificar-correo`, `/recuperar-contrasena`)**: Alineación de tarjetas `#08010e`, distribución de campos, ayudas de contraseña, alertas de estado, botones de Google y flujo responsive.
- **Perfil y avatar (US-04, `/perfil`)**: Selector y vista previa de avatar HTTPS (`ProfileAvatar.tsx`), corrección de jerarquía de tarjetas, mensajes de validación, estado de guardado/error y soporte de avatar en cabecera.
- **Eliminación de cuenta (US-05)**: Alineación del diálogo de confirmación, checkbox de `20 px`, estados de procesamiento, error, reautenticación, seguimiento recuperable y recuperación ante fallo de navegación.
- **Dashboard y administración de salas (US-06, `/dashboard`, `/salas/crear`, `/salas/unirse`)**: Estados vacío, carga (skeletons), error total y parcial, cuadrícula de tarjetas, menú contextual, copia de ID, y modales/rutas de creación, unión, edición y eliminación.
- **Interior de sala (`/salas/:id`)**: Ocultación del pie global en `.room-app-shell`, botón `Salir` (`80×36 px`), borde de participante activo (`#60a5fa`), variantes `.media-control-av-off` y `.media-control-sharing`, avatares circulares coloreados en chat, insignia en vivo adaptable y tarjetas centradas de error REST.
- **Pantallas complementarias y componentes compartidos**: Cabecera móvil en una sola fila (`76 px` en `390×844`), enlace activo con contraste `var(--link)`, flujo completo de cierre de sesión (`Confirmación`, `Cerrando sesión`, `Error de cierre`) esperando a `logoutUser()` antes de limpiar la sesión local, `/sesion-cerrada` con `AuthFrame`, `/accesibilidad` estructurada según UI Kit (`WCAG 2.2 AA`) y página `404` centrada.

---

## Capturas seleccionadas (Escritorio `1440×900` y Móvil `390×844`)

| Vista | Escritorio (`1440×900`) | Móvil (`390×844`) |
|---|---|---|
| **Login** | [login-desktop.png](./login-desktop.png) | [login-mobile.png](./login-mobile.png) |
| **Registro** | [registro-desktop.png](./registro-desktop.png) | [registro-mobile.png](./registro-mobile.png) |
| **Perfil en consulta** | [perfil-desktop.png](./perfil-desktop.png) | [perfil-mobile.png](./perfil-mobile.png) |
| **Perfil en edición** | [perfil-editar-desktop.png](./perfil-editar-desktop.png) | [perfil-editar-mobile.png](./perfil-editar-mobile.png) |
| **Avatar aplicado** | [avatar-desktop.png](./avatar-desktop.png) | [avatar-mobile.png](./avatar-mobile.png) |
| **Eliminación de cuenta** | [eliminacion-desktop.png](./eliminacion-desktop.png) | [eliminacion-mobile.png](./eliminacion-mobile.png) |
| **Dashboard con salas** | [dashboard-desktop.png](./dashboard-desktop.png) | [dashboard-mobile.png](./dashboard-mobile.png) |
| **Crear sala** | [crear-sala-desktop.png](./crear-sala-desktop.png) | [crear-sala-mobile.png](./crear-sala-mobile.png) |
| **Sala creada correctamente** | [sala-creada-desktop.png](./sala-creada-desktop.png) | [sala-creada-mobile.png](./sala-creada-mobile.png) |
| **Unirse a sala** | [unirse-sala-desktop.png](./unirse-sala-desktop.png) | [unirse-sala-mobile.png](./unirse-sala-mobile.png) |
| **Interior de sala** | [interior-sala-desktop.png](./interior-sala-desktop.png) | [interior-sala-mobile.png](./interior-sala-mobile.png) |
| **Cierre de sesión** | [cierre-sesion-desktop.png](./cierre-sesion-desktop.png) | [cierre-sesion-mobile.png](./cierre-sesion-mobile.png) |

---

## Diferencias funcionales justificadas

- **Identidad de producto**: Se conserva la marca **TeamSpeak (`T`)** frente al nombre conceptual *Salón (`S`)* del prototipo; en `Ingreso` y `Registro` se mantiene acceso por correo, alternar visibilidad de contraseña, recuperación y pie de página.
- **Perfil (`US-04`)**: No se muestra un rol ilustrativo «Estudiante», el cambio de correo se realiza mediante flujo separado verificado y el avatar utiliza URL HTTPS validada en lugar de carga local de archivos.
- **Eliminación de cuenta (`US-05`)**: Al completarse el borrado, se cierra la sesión local y se redirige a `/login` con confirmación verde en lugar de mantener un modal sobre una sesión inexistente.
- **Salas (`US-06`)**: Se conservan identificadores reales, botón `Copiar ID`, ingreso directo a `/salas/:id` y acciones de anfitrión en salas propias.
- **Interior de sala (`/salas/:id`)**: Se conserva la señalización `screen:state` y chat en tiempo real sin agregar transmisión de video WebRTC ni paneles colapsables fuera del alcance funcional actual.
- **Pantallas complementarias**: No se crearon rutas `/terminos` ni `/privacidad` por no estar implementadas en el frontend.

---

## Resultados de pruebas locales

- `npm run typecheck`: `tsc -b --pretty false` — **0 errores**.
- `npx vitest run`: **19 archivos de prueba, 197 pruebas aprobadas**.
- `npm run build`: compilación TypeScript y empaquetado Vite — **OK**.
- `git diff --check`: **sin errores de formato**.
- `npx playwright test`: **92 pruebas E2E aprobadas, 2 omitidas** (pruebas responsive exclusivas de desktop en el proyecto `chromium-mobile`).
