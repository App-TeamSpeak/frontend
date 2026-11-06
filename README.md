# TeamSpeak Frontend

Frontend del salón de estudio colaborativo en tiempo real.

## Stack

- React 19 y TypeScript.
- Vite.
- Tailwind CSS 4.
- Vitest, Testing Library y cobertura LCOV.
- Vercel para despliegue.

## Desarrollo local

```bash
cp .env.example .env
npm install
npm run dev
```

La aplicación utiliza por defecto:

- API: `http://localhost:10000`.
- Realtime: `http://localhost:10001`.

## Validación

```bash
npm run validate
```

El comando ejecuta typecheck, pruebas con cobertura y build. El reporte LCOV se
genera en `coverage/lcov.info` y se consume en SonarQube Cloud desde GitHub Actions.

## Despliegue

El repositorio está preparado para Vercel. Configura las variables `VITE_API_URL` y
`VITE_REALTIME_URL` en el proyecto de Vercel usando las URLs públicas de Render.

No guardes secretos en variables `VITE_*`: Vite las expone al navegador.

## Comandos Docker

El frontend también incluye un `Dockerfile` reproducible para validar la misma
construcción en local:

```bash
make docker-build
make docker-run
```

La aplicación queda disponible en `http://localhost:8080`. Para detener el
contenedor ejecuta:

```bash
make docker-stop
```

Para levantar frontend, API y realtime juntos, ejecuta desde el repositorio
`backend`:

```bash
docker compose up --build
```

La aplicación queda disponible en `http://localhost:8080` y la API en
`http://localhost:10000`.

Puedes cambiar las URLs públicas usadas durante el build con:

```bash
make docker-build \
  VITE_API_URL=https://teamspeak-backend-api.onrender.com \
  VITE_REALTIME_URL=https://teamspeak-backend-realtime.onrender.com
```

## Flujo trunk-based

Los cambios se integran en `main` mediante Pull Requests pequeños. Cada PR debe
usar Conventional Commits, pasar el workflow de CI y contar con una aprobación
antes de fusionarse mediante **Squash and merge**.

## Sprint 0 · S0-C04 y S0-C05

Requiere Node 24. Usa `npm ci` para una instalación reproducible.
La ruta `/verificacion` consulta `GET /api/sprint0/demo` sin caché, valida el
contrato `{ success: true, data: { ... } }` y muestra cargando, error con
Reintentar, éxito y documento vacío. La petición se cancela al salir de la
pantalla y tiene un límite de 60 segundos para el arranque en frío de Render.
No hay SDK ni credenciales Firestore en el frontend.

### Navegación

| Ruta | Pantalla |
| --- | --- |
| `/` | Inicio |
| `/login`, `/registro` | Ingreso y registro según Figma |
| `/recuperar-contrasena` | Recuperación de contraseña |
| `/completar-username`, `/perfil` | Completar perfil y perfil |
| `/dashboard` | Mis salas, vista previa vacía |
| `/salas/crear`, `/salas/unirse` | Crear sala y unirse por ID |
| `/salas/:id` | Estructura de sala, participantes y chat plegables, salida al panel |
| `/ayuda`, `/accesibilidad` | Apoyo |
| `/verificacion` | Base técnica conectada a la API |
| Cualquier otra | 404 con retorno al inicio |

Las pantallas de cuentas y salas son estructura del Sprint 0: validan campos
localmente y explican las acciones aún no disponibles. No crean sesiones, salas,
participantes ni mensajes ficticios. Las rutas privadas son vistas previas públicas;
la autorización real se implementará con la historia de autenticación.

### Diseño

Referencia: [Figma Salón](https://www.figma.com/design/WHh4b0fAkGJeuUR4IBsvlc/TeamSpeak-UX-UI-Flow?node-id=7-134).
Se revisaron ingreso `7:164`, registro `78:105`, dashboard `7:218`, estado vacío
`73:726`, sala `7:297`, fundamentos `7:26` y flujo `9:20`.
Inter y Source Sans 3 se distribuyen localmente mediante Fontsource. Los SVG en
`public/assets/figma` proceden del diseño y no dependen de URLs temporales.
Colores y componentes compartidos están en `src/index.css`.
Inicio, ayuda, perfil, recuperación, base técnica y 404 aplican la guía visual;
no hay frames específicos de estas pantallas en las páginas de Figma revisadas.

### Compose y despliegue

Clona ambos repositorios como carpetas hermanas `frontend` y `backend`. Desde
`backend`, copia `.env.example` a `.env`, `backend-api/.env.example` a
`backend-api/.env` y `backend-realtime/.env.example` a `backend-realtime/.env`.
Completa las credenciales Firebase solamente en el archivo local de la API.
Ejecuta `docker compose up --build`. Frontend: `http://localhost:8080`;
API: `http://localhost:10000`. Sin credenciales válidas la API responde error
controlado y la pantalla permite reintentar; no sustituye el dato por uno local.

En Vercel configura `VITE_API_URL=https://teamspeak-backend-api.onrender.com`
y vuelve a construir. En Render configura `CORS_ORIGINS` con el origen exacto
de Vercel y sus previews autorizadas. Las variables Vite se incorporan al build;
modificarlas en un contenedor ya construido no cambia el bundle.

La matriz y las limitaciones de evidencia están en [docs/sprint0-evidence.md](docs/sprint0-evidence.md).
