# Sprint 2 · Integración frontend y backend

El apartado final «Contrato vigente» actualiza la revisión histórica de 3044e8a.

Base frontend `55f0b591a954705ee655407b4ff1f2b0351e3d14`. Contratos revisados en backend `3044e8a7e7e39657ea47fd1dae99a125c2e467f8`. Consultas públicas: el OpenAPI de Render incluye `email` en el ejemplo de PATCH y DELETE 200, 400, 401, 409, 500 y 503. Realtime respondió health `ok`. Estas consultas acreditan documentación y disponibilidad pública. La ejecución autenticada, la versión exacta del binario desplegado y los efectos de eliminación requieren evidencia adicional.

## Clasificación

| Funcionalidad | Estado | Evidencia |
| --- | --- | --- |
| US-04 GET y PATCH de nombre, apellido, username y avatar | A · Contrato compatible | Perfil autenticado y PATCH con controles de perfil, correo verificado y colisión de username. Fixtures de consulta, edición y borrador. |
| US-04 cambio de correo | C · Problema backend | PATCH valida formato y consulta colisiones de Firestore. Falta sincronización con Firebase Auth. |
| US-05 eliminación | C · Problema backend, B · aclarar contrato de reconciliación | DELETE sin cuerpo documentado y código con 200 deleted. Falta prueba segura del proceso productivo, recuperación e invalidación. |
| US-06 listado, creación, detalle e ingreso REST | A · Contrato compatible, D · evidencia autenticada del despliegue pendiente | Firebase Bearer, cuenta activa, correo verificado y perfil completo. Creación 201 con `name` recortado de 1 a 80 caracteres. DTO con roomId, ownerId, name, createdAt, participants y connected. GET lista propias en orden descendente y el detalle exige propiedad o membresía. POST join registra membresía para ID existente. El frontend normaliza roomId a id. |
| US-06 autorización de una conexión nueva | A · Contrato compatible, D · evidencia autenticada pendiente | Realtime valida token, perfil y cuenta, comprueba sala y membresía. Devuelve acknowledgement positivo y room:joined. |
| US-06 revocación de sala o membresía en socket activo | C · Problema backend | El camino de sala coincidente confirma sin volver a consultar la existencia o membresía. No se verificó revocación activa específica de sala. |

[Backend revisado](https://github.com/App-TeamSpeak/backend/tree/3044e8a7e7e39657ea47fd1dae99a125c2e467f8) · [OpenAPI de Render](https://teamspeak-backend-api.onrender.com/api/openapi.json) · [Health Realtime](https://teamspeak-backend-realtime.onrender.com/health)

## REQUERIMIENTOS PENDIENTES PARA BACKEND

| Historia / componente | Endpoint y archivo | Comportamiento observado y riesgo | Cambio y contrato requerido | Prueba de aceptación e impacto frontend |
| --- | --- | --- | --- | --- |
| US-04 / API | PATCH /api/users/me · `users.service.ts`, `user.validator.ts` | Actualiza Firestore y responde EMAIL_TAKEN por colisión allí. La identidad de acceso y el correo de perfil pueden divergir. No se observa reautenticación específica ni verificación del correo nuevo. | Definir procedimiento compatible con Google y contraseña, reautenticación y prueba de titularidad. Publicar payload, estado pendiente si aplica, respuesta canónica y errores de colisión y recuperación. | Con usuarios sintéticos, validar correo ocupado, cambio verificado, fallo de Auth y fallo de Firestore sin inconsistencias. Bloquea la edición de correo. |
| US-05 / API | DELETE /api/users/me · `api.routes.ts`, `users.controller.ts`, `account-deletion.service.ts` | La ruta inmediata usa requireAuth y pasa solo el UID. El control de 300 s pertenece al flujo de emulador. Borra salas antes de Auth y escribe el marcador al final. Una falla posterior deja datos parcialmente eliminados; si Auth ya se eliminó, la identidad original puede no poder reconciliar. Solo se observa limpieza de miembros y mensajes de salas propias. | Exigir autenticación reciente en servidor, registrar operación durable antes de efectos, definir idempotencia, limpieza y reanudación por fases, y una consulta de estado usable tras revocar identidad. Publicar DELETE sin cuerpo, significado de 200/202, códigos de bloqueo y fallos, y política de sesión y limpieza. | Con emuladores, probar sesión antigua, solicitudes concurrentes, pérdida de respuesta, fallos tras cada fase, salas grandes, membresías externas y acceso REST/Socket.IO tras finalización. Bloquea el botón destructivo y los estados operativos de producción. |
| US-06 / Realtime | room:join · `socket.ts`, `room-chat.service.ts` | Una conexión nueva comprueba sala y membresía. La rama de socket ya unido confirma el ingreso sin esa comprobación. Puede persistir acceso del socket tras revocar membresía o borrar la sala. | Definir revalidación del ingreso repetido y revocación de sockets del canal. Mantener los errores ROOM_NOT_FOUND, ROOM_ACCESS_DENIED y AUTHORIZATION_UNAVAILABLE y la confirmación solo tras acceso válido. | En entorno aislado, revocar membresía o borrar sala con un socket activo y comprobar que pierde acceso, presencia y entrega de eventos. El frontend conserva el flujo vigente y queda pendiente acreditar el ciclo de revocación en producción. |

## Mensajes para el responsable de backend

- **US-04:** El PATCH detecta EMAIL_TAKEN en Firestore, pero puede dejar un correo de perfil distinto al de Firebase. Para cerrar la rúbrica del correo necesitamos un flujo documentado de cambio verificado para Google y contraseña, con colisiones y recuperación ante fallos en cualquiera de los dos sistemas. Cuando lo validemos con cuentas sintéticas, habilitaré el campo.
- **US-05:** Render documenta el DELETE 200, pero el flujo inmediato puede borrar salas antes de fallar en Auth, o borrar Auth antes de terminar Firestore. Necesitamos autenticación reciente, operación durable e idempotente y seguimiento incluso tras perder sesión. Verifiquemos respuesta perdida y fallos por fase en emuladores. Cuando se confirme, conectaré el diálogo y la redirección al resultado definitivo.
- **US-06:** La validación de membresía al ingresar está implementada. Queda por confirmar qué ocurre con sockets ya unidos al revocar la membresía o eliminar la sala. Propongo verificar que se corte la entrega y el ingreso repetido se rechace. Luego podremos acreditar el ciclo completo.

## Matriz de evidencia

| Historia | Requisito | Frontend | Backend disponible | Evidencia | Pendiente |
| --- | --- | --- | --- | --- | --- |
| US-04 | S2-C04 consulta, edición y username | Sí | Contrato compatible | Vitest y Playwright de perfil y borrador | Recorrido autenticado |
| US-04 | S2-C04 correo y colisión | Solo lectura | PATCH documentado, sincronización bloqueada | Revisión del contrato | Correo verificado y coherente, EMAIL_TAKEN de extremo a extremo |
| US-05 | S2-C04 confirmación y cancelación | Sí, acción deshabilitada | UI independiente | Vitest, Playwright y ausencia de DELETE en la UI | Lector de pantalla |
| US-05 | S2-C04 eliminación y redirección | Helper probado con fixtures, sin conectar | Contrato inmediato con bloqueos | Contratos HTTP, respuestas ambiguas y cambio de identidad simulados | Contrato seguro, prueba de eliminación y sesión |
| US-06 | S2-C04 vacío, listado, creación, copia e ingreso anfitrión | Sí | Contratos compatibles | Vitest y Playwright con fixtures | REST autenticado y ciclo de membresía en Realtime |
| US-04/05/06 | S2-C05 estados y responsive | Estados operativos vigentes, eliminación real deshabilitada | Según la función | Capturas Chromium y referencias Figma a 1440 × 900 y 390 × 844 | Evidencia de estados bloqueados y lector de pantalla |

Los formularios de perfil y sala conservan sus estados de carga, validación y error. El dashboard distingue carga, vacío, listado parcial y lista completa, y conserva la creación incierta. La opción «Privada» de Figma queda fuera de creación porque el contrato solo admite `name`. No se realizaron operaciones autenticadas ni destructivas contra Render.

## Auditoría frontend

Se corrigieron dos riesgos del helper de eliminación antes de conectarlo: el reenvío del cliente HTTP ante 401 y el logout en respuestas que no prueban finalización. El módulo aplica un único envío en curso por identidad, un plazo de 20 segundos y conserva la sesión en resultados desconocidos. US-06 mantiene su ciclo de reconexión y distingue los errores nuevos del servidor. Los bloqueos de correo y eliminación son dependencias backend. La evidencia de integración autenticada y lector de pantalla sigue pendiente.

### TS-02 · Persistencia de chat

El backend 3044e8a persiste `chat:send` y devuelve el ID en el evento `chat:message`. Se eliminó la doble escritura del recorrido de sala, que enviaba el mismo texto por REST y Socket.IO. El historial sigue consultándose por REST y el ID del servidor permite unir historial y eventos. Si vence el acuse, la interfaz advierte que el resultado es incierto. Debe comprobarse en un entorno autorizado que el despliegue usa ese contrato y que dos participantes ven un único mensaje persistido.

## Contrato vigente · 038d456177862ecf2a9a4d7e36c9614e9529e499

El HEAD remoto coincide con este SHA. El OpenAPI público de Render anuncia POST de elegibilidad de correo, DELETE con 200/202 y GET de estado. El gateway responde health y su OpenAPI anuncia revocación por `ROOM_NOT_FOUND` o `ROOM_ACCESS_DENIED`. La preflight consultada admitió el encabezado de seguimiento. La inspección de documentación y las pruebas con fixtures todavía dejan pendiente la comprobación autenticada del despliegue.

- **US-04, A para integración frontend y D para evidencia autenticada.** El correo sale del PATCH. Se usa elegibilidad, reautenticación según respuesta del servidor, verificación Firebase y sincronización del correo verificado al consultar el perfil. Google sin proveedor de contraseña queda excluido. La consulta previa de Firestore y la actualización posterior ocurren en momentos distintos. Si se requiere unicidad de Firestore garantizada durante todo el flujo, queda pendiente acordar reserva o revalidación.
- **US-05, C para habilitación productiva.** Las fases, lease, comprobación de revocación y autenticación reciente corrigen el diseño anterior. El cliente reconoce 200/202 y dispone de consulta Bearer o por encabezado. El conciliador sigue acotado a emuladores y el seguimiento público solo lee. Un resultado perdido tras revocar Auth puede dejar al cliente sin credencial de seguimiento. No se conecta el botón destructivo.
- **US-06 y TS-02, A para contrato y D para verificación autenticada.** Se verificó la reautorización en cada ingreso y el observador de permisos por sala en código publicado. Se adaptó la interfaz a la revocación sin alterar el dashboard ni el formulario. Se conserva una única vía de persistencia de chat y deduplicación por ID.

### Requerimientos pendientes para backend

| Historia | Endpoint / archivo | Evidencia y riesgo | Contrato y aceptación | Impacto |
| --- | --- | --- | --- | --- |
| US-05 | DELETE y GET de estado · `account-deletion.service.ts`, `account-deletion.reconciler.ts`, `users.controller.ts` | Tras fallos, el servicio puede devolver pending con espera. El conciliador solo funciona en emuladores y GET no reanuda. La primera respuesta perdida puede ocultar el único token conocido, y un DELETE posterior rota su hash. | Reanudar de forma durable en producción con lease y definir recuperación del seguimiento incluso tras revocar Auth. Verificar respuesta perdida y fallo al guardar completed después de eliminar Auth, más consultas con recibos activos. | Bloquea conectar el diálogo, polling, cierre de sesión y redirección productivos. |
| US-04 | POST email-change y GET de perfil · `users.service.ts` | La disponibilidad de Firestore se verifica antes de enviar el enlace. La sincronización posterior no comprueba de nuevo la colisión. | Confirmar cómo se garantiza unicidad si cambia la disponibilidad entre fases. Probar una colisión introducida entre preflight y sincronización. | Seguimiento de consistencia; la interfaz usa el flujo documentado y espera coincidencia verificada. |

**Mensaje para backend · US-05.** Los estados y la consulta por token ya están integrados en el cliente. Antes de habilitar el botón, necesitamos una reanudación productiva y una forma segura de recuperar el seguimiento si se pierde el primer recibo después de invalidar Auth. Verifiquemos ambos casos con emuladores y después en un entorno aislado autorizado.

**Mensaje para backend · US-04.** El cliente ya sigue elegibilidad y verificación de Firebase. Confirmen cómo se protege la unicidad de Firestore si aparece una colisión después del preflight y antes de sincronizar. Incluyamos ese caso en la prueba del contrato.

### Evidencia vigente de rúbrica

| Historia | Requisito | Frontend | Backend | Evidencia y pendiente |
| --- | --- | --- | --- | --- |
| US-04 | S2-C04 perfil, username y correo | Integrado | OpenAPI disponible | Perfil y colisión con fixtures, reautenticación y sincronización unitarias. Falta correo real con identidad sintética autorizada. |
| US-05 | S2-C04 confirmación, eliminación y redirección | Confirmación habilitada, borrado deshabilitado | Consulta documentada, recuperación productiva pendiente | UI sin DELETE, 200/202 y token con fixtures. Falta borrado definitivo, seguimiento y sesión en entorno aislado. |
| US-06 | S2-C04 salas, ID, anfitrión y revocación | Integrado | REST y Realtime documentados | Suites y mocks de revocación. Falta retiro de acceso autenticado en Render. |
| TS-02 | S2-C04 chat persistente | Integrado | Persistencia y evento documentados | Pruebas de una emisión y eco por ID. Falta evidencia autenticada entre dos participantes. |
| US-04/05/06 | S2-C05 estados, responsive y teclado | Estados del alcance habilitado | Según operación | Capturas 1440 × 900 y 390 × 844. Pendiente lector de pantalla. |

### Validación de esta revisión

Con Node.js 24.18.0 aprobaron 131 pruebas focalizadas, 176 pruebas Vitest y 34 pruebas Playwright (17 por proyecto). Cobertura global de 91,63 % en líneas, 78,47 % en ramas, 86,10 % en sentencias y 88,26 % en funciones. Lint, TypeScript, build y `git diff --check` aprobaron. Persiste el aviso de tamaño del bundle. La validación responsive del formulario de correo cubre colisión y conservación del borrador a 1440 × 900 y 390 × 844. Las pruebas con lector de pantalla y las operaciones autenticadas de integración quedan pendientes.

### Recuperación del cambio de correo

El estado pendiente de US-04 ahora permite consultar, reenviar explícitamente, corregir la dirección o salir preservando el borrador del perfil. Un reenvío vuelve a usar la elegibilidad del backend y Firebase, con reautenticación si corresponde y un solo envío en curso. Salir restablece el estado local y no revoca enlaces anteriores. Una comprobación solo acredita éxito si el correo objetivo vigente coincide en Firebase y el perfil. Se añadieron pruebas controladas de recuperación, frecuencia y cambio de identidad. La integración autenticada y la verificación de unicidad de Firestore entre fases siguen pendientes.

### Habilitación de US-05 en frontend

La decisión anterior de mantener el diálogo deshabilitado fue reemplazada por la implementación del recorrido que el contrato actual permite. La confirmación explícita habilita DELETE, el rechazo por autenticación reciente admite reautenticación por contraseña o Google y el seguimiento por token distingue pendiente de completado. El layout conserva el recibo en memoria durante la navegación. La pérdida del recibo usa consulta por Bearer si está disponible y permite salir a ayuda. La sesión solo se limpia y se redirige a login tras confirmación del servidor. Vitest y Playwright ejercitan el flujo con fixtures. La disponibilidad de OpenAPI en Render no acredita eliminación real.

**Ficha vigente para backend.** En `account-deletion.service.ts`, la solicitud puede quedar `pending` tras un fallo entre fases. `account-deletion.reconciler.ts` continúa restringido a emuladores y GET de estado solo lee. Si se pierde la primera respuesta tras invalidar Auth, el cliente puede quedar sin Bearer y sin el token de seguimiento. Se requiere reanudación productiva con lease y una credencial o mecanismo de recuperación independiente de recibir el primer DELETE. En un entorno aislado, provocar pérdida de respuesta y un fallo entre eliminación de Auth y escritura de `completed`, y verificar que la operación se reanuda y puede consultarse sin repetir DELETE.

**Mensaje preparado para backend.** El frontend ya maneja confirmación, reautenticación, DELETE y seguimiento por token. Falta resolver la reanudación productiva y la recuperación si se pierde el primer recibo después de borrar Auth. Necesitamos validar esos dos fallos en un entorno aislado antes de acreditar la eliminación definitiva para la rúbrica.

### Corrección P2 de US-05 después de `completed`

La confirmación del servidor se conserva aunque falle el cierre de sesión local o la transición al login. Los errores de limpieza y navegación tienen recuperación propia, sin repetir DELETE ni consultar de nuevo la eliminación confirmada. El contexto solo se limpia al comprobar ausencia de identidad Firebase activa. Las pruebas cubren finalización por DELETE y por seguimiento, reintento local, confirmación tardía de otra cuenta y navegación interrumpida. Continúan abiertos la reanudación productiva y el seguimiento sin recibo si se pierde la respuesta antes de recibir `completed`.
