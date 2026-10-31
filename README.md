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
