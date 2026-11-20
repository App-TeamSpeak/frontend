# S2-C05 · Auditoría visual de Sprint 2

La auditoría compara la interfaz de TeamSpeak con los frames aprobados de perfil, eliminación de cuenta, dashboard y salas. El punto de partida del frontend fue `a9b8ec6ccb8a92c4e6442cb50f6c876da2cf6bbf`.

[Prototipo aprobado de Figma](https://www.figma.com/design/WHh4b0fAkGJeuUR4IBsvlc/TeamSpeak-UX-UI-Flow?node-id=295-36)

## Cómo revisar la evidencia

- [Matriz CSV](matriz.csv) con los estados, frames, hallazgos, prioridades y rutas de las imágenes.
- [Comparativa resumida](comparativa.png) con ejemplos de las tres historias.
- Carpetas por historia y resolución para [US-04](us-04/), [US-05](us-05/) y [US-06](us-06/). Cada carpeta contiene las capturas de Figma disponibles y las del frontend antes y después.
- Para abrir la [galería HTML](index.html), clona el repositorio o descarga la rama desde GitHub. Abre `index.html` con el navegador conservando la estructura de carpetas. En GitHub se pueden revisar directamente la matriz y los PNG.

La revisión contrastó las propiedades y renders de los nodos con capturas de Chromium a **1440 × 900** y **390 × 844**. Los casos adicionales a **800 × 600** y **800 × 360** comprueban la disposición del perfil y el alcance de las acciones dentro de un diálogo bajo. Las capturas de ambos lados de la comparación se tomaron localmente con Playwright y respuestas sintéticas.

## Historias revisadas

| Historia | Estados revisados | Correcciones |
|---|---|---|
| US-04 · Perfil | Consulta, carga, error, edición, validación, guardado, descarte y cambio de correo | Identidad de sesión durante carga y error, bloques de carga del ancho de los campos, aviso con título y acción de reintento a ancho completo en móvil. |
| US-05 · Eliminación | Confirmación, reautenticación, procesamiento, pendiente, resultado incierto, bloqueo y completado | Geometría del diálogo, jerarquía del progreso y avisos. El seguimiento permanece dentro de Información personal y la consulta automática sigue disponible sin sesión Firebase. |
| US-06 · Salas | Dashboard vacío, listado, carga, error y creación inicial, diligenciada, inválida, pendiente, exitosa o con error. También se capturaron unión, edición y confirmación de eliminación. | Tarjetas y esqueletos móviles más compactos, error con reintento visible y acciones de creación en fila cuando caben. |

- **P1:** límites de altura y desplazamiento para los diálogos, con acciones alcanzables en ventanas bajas.
- **P2:** refinamientos de geometría, jerarquía y espaciado de los estados anteriores.
- **P3:** quedan ajustes menores en edición, validación y guardado. La revisión detallada de autenticación, interior de sala y rutas complementarias queda pendiente.

## Límites

Las capturas locales documentan la interfaz bajo fixtures. La disponibilidad del backend, Firebase y Realtime en producción requiere verificación independiente. Los flujos actuales conservan el cambio verificado de correo, el seguimiento recuperable, la confirmación en login y los controles de copia e ingreso a salas. Algunos estados carecen de un frame equivalente. Los frames de Figma que muestran un correo de ejemplo en un dominio no reservado se excluyeron de los PNG y de la comparativa resumida. La matriz conserva su ID y la galería enlaza al diseño original.

## Verificación

- **Ejecución inicial:** Playwright obtuvo 46 aprobadas, una omitida y una fallida. Chromium móvil registró `net::ERR_NETWORK_CHANGED` al cargar dos módulos desde Vite en localhost, antes de que montara el dashboard.
- **Revalidación aislada:** la prueba móvil de US-06 pasó con un worker, Vite nuevo y cero fallos de transporte en la traza.
- **Primera repetición completa:** Playwright obtuvo 46 aprobadas, una omitida y una fallida por `ERR_ABORTED` al abrir Ayuda en la prueba móvil de US-05. La navegación coincidió con una escritura en la matriz y la recarga de la página anterior. La misma prueba pasó tres veces en aislamiento.
- **Revalidación final sin escrituras simultáneas:** 47 pruebas Playwright aprobadas y una omisión prevista en móvil. También aprobaron 197 Vitest, TypeScript, build y `git diff --check`. El script `lint` ejecuta `tsc -b --pretty false`. Las pruebas usaron fixtures locales.

La publicación queda pendiente hasta verificar el proyecto Firebase efectivo de la Preview de esta rama en Vercel.
