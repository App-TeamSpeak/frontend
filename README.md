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
