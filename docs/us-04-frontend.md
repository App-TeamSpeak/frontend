# US-04 · Ver y editar perfil

## Objetivo y criterios de aceptación

Una persona autenticada y con correo verificado puede consultar sus propios datos en `/perfil`, entrar en edición, validar y guardar los campos permitidos, cancelar o descartar el borrador, y volver a «Mis salas». La pantalla anuncia la consulta y el guardado, distingue un perfil incompleto de un error, conserva los datos editados si falla el guardado y evita envíos simultáneos. La interfaz se adapta a escritorio y móvil.

## Diseño

Se consultaron los 18 nodos con Figma MCP y se obtuvieron capturas para ambos tamaños. [Página de Figma](https://www.figma.com/design/WHh4b0fAkGJeuUR4IBsvlc/TeamSpeak-UX-UI-Flow?node-id=295-36)

| Estado | Escritorio 1440 × 900 | Móvil 390 × 844 |
| --- | --- | --- |
| Consulta | `295:155` | `295:834` |
| Cargando | `295:187` | `295:861` |
| Error de consulta | `295:217` | `295:886` |
| Edición | `295:250` | `295:914` |
| Datos inválidos | `295:285` | `295:944` |
| Guardando | `295:319` | `295:973` |
| Guardado | `295:355` | `295:1004` |
| Error de guardado | `295:388` | `295:1032` |
| Descarte | `295:424` | `295:1063` |

La comparación manual de las capturas de Chromium con Figma motivó integrar «Editar perfil» dentro de la tarjeta móvil, acercar la geometría de las columnas de escritorio y ajustar los espacios, los avisos y el tratamiento del descarte. Se reutilizan Inter y Source Sans 3, los colores de la aplicación y los estilos de campos, botones y diálogos. La navegación y el pie mantienen la marca TeamSpeak y su menú, por lo que la cabecera móvil ocupa más altura que el frame. Los avisos y las opciones de avatar pueden requerir desplazamiento vertical en móvil.

### Adaptaciones para UX

- El nombre se muestra completo en consulta. Edición agrupa nombre y apellido como dos campos para respetar el contrato.
- El correo se muestra en solo lectura. El error del frame de correo editable se sustituye por validación de campos permitidos.
- Las pruebas usan `maria_gomez`. El ejemplo `maria.gomez` de Figma queda fuera del formato admitido.
- «Opciones de avatar» conserva la edición por URL HTTPS en un bloque plegable. Un valor vacío elimina la imagen y el avatar usa iniciales como alternativa. La carga de archivos queda fuera del alcance.
- Carga y error de consulta muestran placeholders o avisos. La identidad se muestra después de recibir un perfil confirmado. Se omite el rótulo «Estudiante» del ejemplo porque la API de perfil carece de ese dato.
- La acción y el diálogo de eliminación permanecen visibles en consulta, con confirmación deshabilitada mientras la integración productiva de US-05 está pendiente.

## Arquitectura y contrato

`App` monta `ProfilePage` dentro de `MainLayout` y `ProtectedRoute`. El guard mantiene el requisito de sesión y correo verificado. La ruta de perfil puede mostrar el resultado del GET aunque el contexto carezca de username. Las demás rutas conservan sus condiciones. `ProfilePage` utiliza `PageTitle`, `AuthContext`, el cliente existente de `services/api.ts` para la consulta y `updateUserProfile` de `services/auth.ts` para guardar. El borrador existe solo en memoria. La identidad proviene del ID token Firebase y el cliente evita reintentar con otra sesión.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/users/me` | Recupera el perfil propio. `profileStatus: incomplete` y `profile: null` identifican incorporación pendiente. |
| PATCH | `/api/users/me` | Requiere correo verificado y perfil completo. Aplica los campos presentes y devuelve el perfil confirmado para actualizar la vista, el contexto y la caché. |

El backend usa el UID del token. El cliente omite los campos que no cambiaron. Nombre y apellido se recortan y requieren entre 1 y 100 caracteres. El username admite de 8 a 30 letras ASCII, dígitos, guiones o guiones bajos. El backend aplica unicidad sin distinguir mayúsculas. El avatar admite una URL HTTPS de hasta 2048 caracteres o `null`. [Backend en GitHub](https://github.com/App-TeamSpeak/backend/tree/e52afa7/backend-api/src) · [OpenAPI de Render](https://teamspeak-backend-api.onrender.com/api/openapi.json)

`VALIDATION_ERROR` asocia detalles a campos reconocidos y `USERNAME_TAKEN` marca el username. La pantalla traduce fallos de autenticación, verificación de correo, perfil incompleto, inexistente o inconsistente, cuenta bloqueada e indisponibilidad. Los códigos internos quedan en la capa de servicio. La consulta tiene reintento propio. Un fallo recuperable de guardado mantiene el borrador. La cancelación limpia vuelve a la consulta y, si hay cambios, abre un diálogo de descarte.

## Accesibilidad

Etiquetas asociadas, `aria-invalid` y descripciones por campo, estados anunciables, foco visible del tema y diálogo modal nativo. Chromium verificó el foco inicial del diálogo, tabulación, Escape, restitución del foco, foco en el campo inválido y ausencia de desbordamiento horizontal. Se aplicaron criterios de WCAG 2.2 para teclado, foco y comunicación de errores. El contraste calculado para el texto de botones primarios es 6,16:1, para avisos de error 7,23:1 y para avisos de éxito 8,74:1. Queda pendiente una auditoría completa con lector de pantalla. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Verificación y alcance de la evidencia

- Implementación frontend disponible en `feat/us-04-profile`. La suite Vitest cubre consulta, reintento, perfil incompleto, sesión inválida, edición, validación, avatar, conflicto, guardado, conservación del borrador, autorización y descarte. Un caso del cliente HTTP verifica que una escritura no se reintenta con otra sesión.
- `npm run validate` ejecuta lint, tipos, Vitest con cobertura y build. Aprobó con Node 24.18.0 y dependencias instaladas mediante `npm ci`. Pasaron 95 pruebas en 18 archivos. La cobertura global fue 86,69 % de sentencias, 79,51 % de ramas, 87,39 % de funciones y 91,23 % de líneas.
- `VITE_API_URL=http://127.0.0.1:4173 npm run test:e2e -- --workers=2` ejecuta el recorrido de perfil y la regresión de accesibilidad pública. Aprobaron los 12 casos de Chromium en los dos proyectos. Playwright intercepta la sesión y el HTTP con fixtures sintéticas. Las 18 capturas se generan en `test-results/`, excluido de Git.
- Los contratos se verificaron en `main` remoto y en OpenAPI público. La autenticación real de Firebase, la persistencia efectiva en Firestore, la disponibilidad de estas operaciones con una cuenta real y SonarQube Cloud quedan pendientes de evidencia.
- La primera instalación notificó avisos de auditoría de dependencias del lockfile existente. Su evaluación requiere revisión aparte. Los casos públicos de US-01 a US-03 están cubiertos por las pruebas existentes y el recorrido E2E de accesibilidad usa datos de prueba.

## Correcciones posteriores a la auditoría

| Hallazgo | Origen | Corrección | Prueba | Estado |
| --- | --- | --- | --- | --- |
| P2-1 · Borrador al abandonar el perfil | US-04 | React Router bloquea enlaces y entradas del historial mientras haya cambios efectivos. Confirmar continúa al destino pendiente. Escape o «Seguir editando» conservan el borrador. | Playwright comprueba «Mis salas», Atrás, Escape, confirmación, foco, recarga cancelada y limpieza del aviso tras salir, en ambas resoluciones. | Corregido en los casos probados. |
| P2-2 · Contexto sin username después de un GET exitoso | US-04 | El servicio valida el UID y la sesión, actualiza la caché y devuelve un usuario que conserva los datos de Firebase. La pantalla usa ese resultado en el contexto y en el perfil. | Pruebas de pantalla, recuperación de GET y Playwright para regresar al dashboard con contexto inicialmente sin username. | Corregido en los casos probados. |
| P2-3 · Publicación tardía de una sesión anterior | Preexistente | El listener usa una generación de evento, comprueba que siga activo y valida la identidad y el objeto que representa la sesión. Logout invalida la caché, y una escritura confirmada prevalece sobre un GET anterior. | Promesas controladas para logout, cambio de cuenta, sesión nueva con el mismo UID, cierre del listener y respuesta anterior a un PATCH. Playwright cambia de identidad durante la consulta con Firebase simulado. | Corregido en los casos probados. |
| P2-4 · Errores tratados como incorporación pendiente | Preexistente | Solo una respuesta exitosa con `profileStatus: incomplete` y `profile: null` se cachea como incompleta. Los demás fallos conservan un estado de error y los guards dan acceso a la pantalla de recuperación. La sesión inválida conserva el tratamiento del cliente HTTP. | Pruebas de perfil explícitamente incompleto, inconsistencia, perfil no hallado, verificación, bloqueo, Firestore, Authentication, recuperación y Google recurrente. | Corregido en los casos probados. |
| P3-1 · Espacios exteriores marcan el borrador como modificado | US-04 | Detectar cambios con los valores recortados, como al preparar el PATCH. | Vitest cancela sin confirmación y Playwright navega tras introducir solo espacios exteriores. | Corregido. |
| P3-2 · Reintentar en móvil puede quedar debajo del viewport | US-04 | Se conserva la composición y el tamaño de interacción. | Playwright acciona el botón desplazándose en 390 × 844. | Observación abierta. |

Se conservó el árbol de rutas y se cambió su montaje a `createBrowserRouter` y `RouterProvider`. React Router necesita un Data Router para `useBlocker` y así puede continuar o cancelar también un movimiento del historial. Se reutiliza el diálogo de descarte de los nodos `295:424` y `295:1063`. La comparación de las nuevas capturas de salida bloqueada conserva la jerarquía, la superposición, los botones y las adaptaciones visuales documentadas. El mecanismo oficial del router evita interceptar globalmente `window.history`.

El listener `beforeunload` solo está activo durante un borrador con cambios. En recarga y cierre de pestaña el texto, la visualización y la disponibilidad del aviso dependen del navegador y de su activación previa. La recarga cancelada se comprobó en Chromium. El cierre de pestaña y el comportamiento de Safari o Firefox quedan pendientes de prueba. El cierre explícito de sesión usa su propia confirmación, elimina el borrador y vuelve al login. Un cambio de identidad invalida la vista y el borrador de la cuenta anterior. Dos consumidores de perfil pueden compartir un GET en curso. Al desmontar se ignora su resultado en la pantalla y el servicio lo descarta si cambió la sesión.

El contrato remoto y la política de US-05 se mantienen. Las cuatro entradas altas de la cadena Firebase/Firestore/gRPC y las tres moderadas de Vitest siguen como seguimiento de dependencias heredadas. Quedan pendientes las comprobaciones con lector de pantalla, Firebase y Firestore reales, y SonarQube Cloud.

La verificación posterior a las correcciones pasó con Node 24.18.0. `npm run validate` completó lint, tipos, 105 pruebas Vitest y build. La cobertura global fue 91,43 % de líneas, 78,60 % de ramas, 85,85 % de sentencias y 86,97 % de funciones. Playwright aprobó 16 casos con fixtures sintéticas. `git diff --check` aprobó.

## Correcciones posteriores a la segunda auditoría

### Navegación durante un PATCH

Antes, el blocker de `ProfilePage` podía abrir «Descartar» después de enviar la escritura. Ahora los enlaces internos y Atrás conservan el destino pendiente mientras la pantalla anuncia el guardado. La referencia de envío bloquea un segundo PATCH y el diálogo de descarte espera a que termine la operación. Con éxito, `services/auth.ts` confirma el perfil en la caché de la sesión vigente, `ProfilePage` actualiza el contexto y el router continúa al destino pendiente. Con error, el borrador permanece editable y el diálogo normal permite quedarse para corregir o reintentar, o continuar al destino descartando el borrador.

Recarga y cierre dependen del aviso nativo. Una salida forzada o un cambio de identidad pueden desmontar la vista con la escritura en curso. La solicitud enviada puede llegar a confirmarse en el servidor. El próximo GET del perfil de esa cuenta recupera el resultado que el backend confirme. El cliente descarta resultados de identidades anteriores y no reintenta el PATCH con otra identidad.

### Reconciliación tras un GET fallido

Antes, el error quedaba únicamente en la vista y la renovación del token podía reutilizar un perfil completo almacenado. Ahora `services/auth.ts` registra el fallo para la sesión vigente y `ProfilePage` reconcilia el contexto con ese resultado. Los guards existentes usan `profileError` para dirigir a la recuperación del perfil y bloquean acceso visual con información anterior.

- **Autoritativo.** Una inconsistencia o un bloqueo de cuenta invalida el perfil completo de la caché. Se contempla también `PROFILE_NOT_FOUND` defensivamente. El OpenAPI publicado lo documenta para PATCH. En GET, el perfil legítimamente incompleto continúa representado por un `200` con `profileStatus: incomplete` y `profile: null`.
- **Transitorio.** Una indisponibilidad, como `FIRESTORE_UNAVAILABLE`, conserva la copia de memoria pero suspende su publicación como perfil confirmado hasta un GET exitoso. El reintento consulta el backend y restablece el acceso tras confirmar un perfil válido.
- **Autenticación.** `AUTH_REQUIRED` y `AUTH_INVALID` conservan el flujo de sesión del cliente HTTP. Una respuesta tardía comprueba el objeto de sesión y la identidad Firebase. Un PATCH confirmado prevalece también frente al rechazo de un GET anterior.

### Pruebas y límites

Testing Library y Playwright mantienen el PATCH pendiente con una respuesta controlada y comprueban el contexto, el destino, el descarte y el reintento. Las pruebas del servicio cubren errores autoritativos y transitorios con un perfil previamente confirmado, renovación de token, recuperación, escritura de una cuenta anterior y un GET rechazado después de un PATCH confirmado. El E2E de cambio de cuenta espera a que termine la respuesta anterior. Las capturas de guardado pendiente se generan en escritorio y móvil con los estilos existentes.

La evidencia usa fixtures sintéticas. Quedan pendientes Firebase y Firestore reales, el cierre de pestaña en otros navegadores, lector de pantalla y SonarQube Cloud. Se conserva el P3 visual del botón móvil de reintento y el seguimiento de dependencias heredadas.

La verificación final con Node 24 aprobó lint, TypeScript, build, 114 casos Vitest y 22 casos Playwright. Cobertura global de 90,98 % en líneas, 77,98 % en ramas, 85,64 % en sentencias y 86,31 % en funciones. `git diff --check` aprobó. Vite mantiene el aviso de tamaño del bundle principal, ya presente antes de estas dos correcciones.
