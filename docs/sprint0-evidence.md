# Sprint 0 · Evidencia S0-C04 / S0-C05

Fecha de comprobación: 5 de noviembre de 2026 (America/Bogota).
Estos resultados corresponden a la rama feature; no prueban un despliegue de esta rama en Vercel.

| Requisito de la rúbrica | Implementación / evidencia | Límite |
| --- | --- | --- |
| React, TypeScript, Tailwind, Vite | package.json, build y validación en evidence/frontend-validation.txt | Vercel debe construir la rama aprobada |
| Web → API Render → Firestore | GET real HTTP 200; evidence/render-http.json y local-render-success.json/png | Frontend local con API real; no prueba de Vercel |
| Cambio de dato visible al recargar | Fetch no-store; API del PR no-store; prueba automatizada con dos respuestas distintas | No se editó Firestore; falta video del cambio real |
| Cargando, error, Reintentar y éxito | VerificationPage; pruebas y capturas verificacion-*-simulado.png | Capturas de error/reintento usan respuestas simuladas, no caída real de Render |
| Sin errores de consola | local-render-success.json: errors vacío | Build local con API real, no consola de Vercel |
| Dockerfile y compose | Dockerfile del frontend existente; compose corregido en backend | Ver evidencia complementaria del backend |
| Variables y README | .env.example, README, URLs públicas Vite sin secretos | Credenciales Firebase solo backend |
| Todas las rutas y 404 | App.tsx, App.test.tsx y capturas de navegación | Autenticación y colaboración reales pertenecen a otros sprints |
| Encabezado, navegación, pie | MainLayout, Header, Footer | El pie compartido y aviso de vista previa amplían la altura de los frames de autenticación |
| Identidad visual Figma | Inter/Source Sans 3 locales; paleta azul, superficies oscuras, campos y tarjetas; SVG locales | Sala es estructura sin participantes ficticios, no reproducción del estado con 4 usuarios |

## Evidencia visual local

- [Ingreso escritorio](evidence/login-1440.png), [ingreso móvil](evidence/login-390.png).
- [Registro escritorio](evidence/registro-1440.png), [registro móvil](evidence/registro-390.png).
- [Mis salas escritorio](evidence/dashboard-1440.png), [mis salas móvil](evidence/dashboard-390.png).
- [404 escritorio](evidence/404-1440.png), [404 móvil](evidence/404-390.png).
- [Sala escritorio](evidence/sala-1440.png), [sala móvil](evidence/sala-390.png).
- [Render real desde build local](evidence/local-render-success.png).
- [Error simulado](evidence/verificacion-error-simulado.png), [reintento simulado](evidence/verificacion-retry-simulado.png).

`browser-checks.json` registra 1440 y 390 px sin desbordamiento ni imágenes faltantes,
además del enlace de salto y validación de campos. El único error de consola de esa
prueba es el HTTP 503 provocado deliberadamente por el escenario simulado.
La revisión de éxito real está separada en `local-render-success.json`: no hubo
mock de la API ni errores. Para usar el origen autorizado `http://localhost:5173`,
el navegador de prueba enruta únicamente los archivos del build local al servidor
de prueba en 5180 y este sustituye la URL base local por la pública de Render.
No se publicaron esos archivos ni se modificó el dato remoto.

## Bloqueos y pendientes de producción

1. No se fusionaron PR ni se desplegó esta rama a producción. GitHub informa un
   despliegue Vercel previo de main, pero no se obtuvo una URL pública del frontend
   con la que comprobar estos cambios. No se atribuye la evidencia local a Vercel.
2. Render acepta `http://localhost:5173`; rechaza `http://127.0.0.1:5174`.
   El fallo observado está en `local-render-api.json/png`. Cada URL Vercel aprobada
   debe añadirse a `CORS_ORIGINS` de Render antes de comprobarla en el navegador.
3. No hay credenciales Firebase en el workspace y no se cambió Firestore. Falta el
   video real requerido por S0-C04: dato inicial en Vercel, edición del documento
   `sprint_prueba/verificacion_sprint0`, recarga y nuevo dato visible.
4. No se ejecutó Lighthouse en producción. Las capturas y tests locales no
   sustituyen la evaluación publicada exigida por la rúbrica.

## Guion para cerrar S0-C04 en producción

Configurar VITE_API_URL en Vercel, configurar su origen exacto en Render y
construir las ramas aprobadas. Abrir `/verificacion` con DevTools: comprobar
solicitud HTTPS a Render, respuesta 200, dato visible y consola sin errores.
Grabar el valor inicial, editar un campo público del documento desde la consola
Firestore autorizada y recargar: comprobar el nuevo valor. Simular red sin conexión
para observar el error y Reintentar, restaurar la red y recuperar el éxito. Guardar
URL, commit desplegado, video y capturas en el DUE. No declarar nivel 4 antes de eso.

La captura [Compose sin credenciales](evidence/compose-no-credentials.png) muestra
el error real del contenedor API, no simulado. Se comprobó además la recarga directa
`/no-existe` en Nginx y la página 404 de React.
