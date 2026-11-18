# US-06 · Crear y visualizar salas propias

## Objetivo y criterios

Una sesión autenticada puede consultar sus salas en el dashboard, distinguir carga, lista vacía y error, crear con un nombre válido, identificar la sala confirmada, copiar su ID real y acceder a su vista. La vista identifica al anfitrión y distingue el acceso REST de la confirmación de ingreso Realtime.

## Referencias de diseño

[Figma · 07 · Sprint 2 · Perfil, dashboard y salas](https://www.figma.com/design/WHh4b0fAkGJeuUR4IBsvlc/TeamSpeak-UX-UI-Flow?node-id=295-36)

| Estado | Escritorio | Móvil |
| --- | --- | --- |
| Dashboard vacío | `295:37` | `295:736` |
| Dashboard con salas | `295:63` | `295:757` |
| Dashboard cargando | `295:105` | `295:794` |
| Dashboard con error | `295:131` | `295:815` |
| Crear vacío | `295:575` | `295:1189` |
| Crear diligenciado | `300:112` | `300:148` |
| Validación | `295:608` | `295:1217` |
| Guardando | `295:639` | `295:1243` |
| Éxito | `295:672` | `295:1271` |
| Error | `295:703` | `295:1297` |

Se reutilizan la cuadrícula, las tarjetas, el esqueleto, el estado vacío y de error, los estilos de diálogo, Inter y Source Sans 3. Las capturas de escritorio y móvil conservan la marca TeamSpeak, el foco visible y la paleta. El diálogo móvil se ajusta a su contenido y puede desplazarse cuando se muestra la revisión de un resultado incierto. La confirmación incorpora el ID, la copia y una acción para entrar. Se usa el conteo real de miembros. La tarjeta carece de última actividad y presencia simulada.

**Coordinación con UX y backend.** El contrato de creación recibe únicamente `name`. La indicación de privacidad del prototipo se sustituye por una nota neutral sobre el ID y se retiró el selector de la ruta directa. Para presentar una opción de privacidad sería necesario definir su contrato y verificar su cumplimiento en REST y Realtime.

## Componentes, flujo y contrato

- `DashboardPage` conserva las rutas y acciones existentes. Usa la sesión de `AuthContext`, lista salas propias en el orden de la API y combina las creaciones confirmadas con un GET que ya estaba en curso. Cambio de cuenta o desmontaje invalidan resultados anteriores.
- `RoomCreation` comparte creación, validaciones y mensajes entre el diálogo y `/salas/crear`. El nombre se recorta y admite de 1 a 80 caracteres. Solo se confirma con 201 y un DTO con ID válido. Los errores recuperables conservan el nombre y los envíos pendientes bloquean un segundo POST.
- El resultado incierto (fallo de red, respuesta inválida, timeout de respuesta o error de servidor) se distingue de un rechazo conocido. Se vuelve a consultar la lista y se muestran nombres e identificadores para revisión. El reenvío requiere pulsar «Crear otra vez» tras consultar la lista. Los nombres duplicados son posibles. Backend podría ofrecer una clave de idempotencia si se acuerda ese contrato.
- `CopyRoomId` usa el valor de la API y anuncia el éxito tras escribir el portapapeles. Si no hay API o permiso, indica que el ID puede copiarse manualmente.
- `RoomPage` confirma el detalle REST antes de conectar Socket.IO. Presenta «Anfitrión» cuando coincide `ownerId` con la cuenta autenticada. La visualización del rol depende del DTO confirmado y la autorización sigue a cargo del backend.

| Método | Ruta | Contrato |
| --- | --- | --- |
| GET | `/api/rooms` | 200 y lista de salas del propietario autenticado, ordenadas por creación descendente. |
| POST | `/api/rooms` | `{ name }`, 201 y sala confirmada. El backend crea la membresía `host` en la transacción. |
| GET | `/api/rooms/:roomId` | 200 para propietario o miembro. Devuelve `ROOM_NOT_FOUND` o `ROOM_ACCESS_DENIED` cuando corresponde. |

El cliente normaliza `roomId` a `id` y conserva `ownerId`, `createdAt`, `participants` y `connected`. El último refleja el conteo persistido y queda fuera de la UI de presencia en vivo. Los guards de backend exigen Firebase Bearer, cuenta activa, correo verificado y perfil completo. Los errores de acceso, sesión e infraestructura se presentan en español. [Código remoto](https://github.com/App-TeamSpeak/backend/tree/e52afa7/backend-api/src) · [OpenAPI desplegado](https://teamspeak-backend-api.onrender.com/api/openapi.json)

Render respondió a la consulta pública de OpenAPI y a los health checks del diagnóstico. El GET público sin token devolvió `401 AUTH_REQUIRED`. El OpenAPI mantiene respuestas 501 de rutas preparadas. El flujo autenticado de creación, listado y detalle en Render requiere comprobación con una cuenta de prueba autorizada.

## Ingreso Realtime y ficha para backend

El transporte usa el token Firebase en el handshake y emite `room:join` tras conectar. La UI indica «Confirmando ingreso…» hasta recibir `room:joined` para el ID solicitado. Un acknowledgement fallido, `error:message`, un error de conexión o la falta de confirmación producen un estado de error sin presentar presencia en vivo. Al desconectar se limpia el estado de ingreso. Los controles existentes de sala se habilitan tras la confirmación. Se mantuvieron los eventos de chat y medios actuales.

| Campo | Requerimiento |
| --- | --- |
| Historia, servicio y evento | US-06 · `backend-realtime` · `room:join` |
| Comportamiento observado | El código remoto verifica sesión y cuenta y procesa el canal del ID solicitado. El handler revisado carece de la comprobación REST equivalente de existencia y membresía. |
| Validación esperada | Comprobar en el servidor que la sala existe y que la identidad autenticada es su propietaria o tiene una membresía válida antes de confirmar el ingreso. |
| Riesgo | La autorización del detalle REST y la del canal pueden divergir. El cliente y su indicador de anfitrión carecen de autoridad para garantizar privacidad. |
| Comportamiento recomendado | Unificar semántica con REST, emitir un error controlado para sala ausente o acceso denegado y confirmar el ingreso solo después de autorizar. |
| Pruebas necesarias | Propietario y miembro autorizados, sala inexistente, cuenta ajena o bloqueada, membresía revocada, falla de infraestructura y reconexión. Verificar que una denegación carezca de ingreso y de emisión de datos de sala. |

[Gateway remoto](https://github.com/App-TeamSpeak/backend/blob/e52afa7/backend-realtime/src/realtime/socket.ts) · [Health Realtime](https://teamspeak-backend-realtime.onrender.com/health)

## Accesibilidad y verificación

El diálogo nativo gestiona foco inicial, Escape, modalidad y retorno al control que lo abrió. Los errores del nombre están asociados al campo. Los estados de guardado, copia e ingreso se anuncian. Las acciones conservan operación por teclado y foco visible.

Vitest y Testing Library ejercitan el listado, el orden, validación, reintento, concurrencia, identidad, portapapeles, rol, acceso denegado y estados Socket.IO. Playwright prueba el recorrido en 1440 × 900 y 390 × 844 con interceptaciones REST, portapapeles sintético y eventos Socket.IO deterministas. Las capturas se generan en `test-results/`.

La implementación y las pruebas controladas acreditan el flujo frontend. El contrato remoto y el health público aportan evidencia separada. Siguen pendientes la ejecución autenticada en Render, la autorización por membresía de Realtime, el lector de pantalla y la evidencia productiva. El backend, Figma y dependencias se conservaron.

### Resultado final

Con Node 24.18.0 aprobaron lint, TypeScript, build y `git diff --check`. Vitest aprobó 131 casos en 19 archivos. Playwright aprobó 24 casos en los dos proyectos de Chromium. Cobertura global: 89,76 % de líneas, 75,02 % de ramas, 84,34 % de sentencias y 85,61 % de funciones.

El recorrido de US-06 produjo 22 capturas, once por resolución. Se contrastaron la composición del dashboard y del diálogo, los estados de guardado y éxito, y la adaptación móvil con las referencias de Figma. Las capturas forman parte de la evidencia local de Playwright. La advertencia de tamaño del bundle del build continúa como observación P3.

## Correcciones posteriores a la auditoría de US-06

### Creación pendiente o incierta

El diálogo del dashboard y `/salas/crear` comparten una operación en memoria vinculada al UID y a la sesión Firebase vigente. El estado distingue inactividad, envío, éxito confirmado, rechazo conocido, resultado incierto, consulta en curso y consulta disponible. El bloqueo síncrono impide un segundo POST mientras el primero está pendiente. El diálogo protege el cierre, incluido Escape, y React Router retiene la navegación interna hasta que se confirme la creación. Si hay un error, la pantalla se conserva y el bloqueo se libera para revisar el resultado. Al salir de la cuenta se invalida la operación y se descartan sus respuestas tardías.

Si el POST arroja un resultado incierto, se consulta `GET /api/rooms`. Cuando falla el listado, se conserva la advertencia y se ofrece volver a consultarlo. El resultado muestra nombres e identificadores para revisión y requiere elegir «Crear otra vez» antes de emitir un segundo POST. Cerrar y reabrir el formulario conserva la advertencia durante la sesión. Una coincidencia de nombre carece de valor como confirmación. La alerta del navegador ante recarga o cierre está sujeta a sus restricciones. Una recarga completa pierde el estado en memoria y un POST ya recibido puede ejecutarse en el servidor. La prevención de duplicados del cliente depende de la sesión abierta. La idempotencia ante nuevas sesiones o reenvíos explícitos requeriría un contrato del backend.

### Desconexión terminal y reconexión

Se comprueba el detalle REST antes de iniciar Socket.IO. El rol visual de anfitrión usa el propietario devuelto por REST. Con Socket.IO 4.8.4, `socket.active` indica si el cliente volverá a intentar la conexión. Durante una pérdida recuperable se muestra «Reconectando…» y se retira la presencia anterior. Se permiten tres intentos automáticos. Después de reconectar se emite un nuevo `room:join` y se exige tanto el evento de la sala solicitada como el acknowledgement positivo del intento vigente. La desconexión, el timeout, el cambio de sala o cuenta y el desmontaje invalidan confirmaciones obsoletas. Un cierre terminal muestra «Realtime no disponible». El botón de recuperación vuelve a consultar el detalle y obtiene un token vigente cuando corresponde. Una denegación conocida termina la conexión y conserva el aviso de autorización sin reintentos automáticos.

### Pruebas, revisión visual y seguimiento

Se añadieron pruebas con promesas y sockets controlados para cierre, navegación, doble envío, reconciliación, cambio de sesión, confirmación tardía y reconexión. Playwright generó capturas en 1440 × 900 y 390 × 844. La revisión visual mantuvo la estructura del diálogo y de la sala. En móvil, el estado terminal se ve desde el encabezado y el detalle de autorización se encuentra al final del panel de chat, accesible mediante desplazamiento.

- **P3 de listado parcial corregido.** El dashboard conserva la sala confirmada, avisa que falta actualizar la lista completa y ofrece un reintento manual.
- **P3 de chat pendiente para el equipo de chat.** En `src/pages/RoomPage.tsx`, el historial REST conserva el ID persistido y `chat:message` genera un ID local a partir del autor y la fecha. Si el GET y el evento de otro participante se solapan para el mismo mensaje, la vista puede mostrarlo dos veces. El seguimiento debe acordar un ID común entre backend API, Realtime y frontend y probar un historial diferido que contenga el mismo mensaje recibido por el socket en ambos órdenes posibles.
- **Dependencia de backend.** La ficha de autorización de `room:join` permanece vigente. Los mocks prueban la respuesta del frontend. Siguen pendientes la autorización Realtime por existencia y membresía, el recorrido autenticado contra Render y la comprobación en producción. La revisión visual automatizada tampoco sustituye una prueba con lector de pantalla.

Con Node 24.18.0, la validación posterior a las correcciones aprobó 143 pruebas Vitest en 19 archivos, 28 pruebas Playwright, lint, TypeScript y build. La cobertura global fue de 90,65 % de líneas, 76,74 % de ramas, 85,41 % de sentencias y 87,76 % de funciones. El build mantiene la advertencia del paquete principal superior a 500 kB.

## Plazos y correcciones finales antes del primer commit

El POST de creación tiene un plazo de 20 segundos y el GET de reconciliación, de 12. Los plazos se aplican únicamente a esas operaciones del formulario. Si vence el POST, el estado compartido queda como incierto y se libera el bloqueo de navegación. El usuario puede cerrar el diálogo, volver al dashboard o consultar sus salas explícitamente. Si vence el GET, se conserva la advertencia y se ofrece «Reintentar consulta». Solo después de completar la consulta se habilita la decisión explícita de crear otra vez.

El frontend abandona la espera y aborta la petición local. El servidor puede haber persistido la sala y el frontend carece de idempotencia de servidor. Las respuestas vencidas quedan fuera de la transición de estado, incluso si llegan después de navegar, tras otro intento o tras cambiar de cuenta. El coordinador mantiene el aislamiento por sesión y la protección contra envíos concurrentes. Una recarga completa sigue perdiendo el estado en memoria.

El dashboard conserva el aviso de listado incompleto tanto si el GET inicial falla antes de crear como si falla después. La consulta exitosa restablece la lista en el orden de la API y combina las salas recién confirmadas por ID. El aviso de autorización Realtime se anuncia junto al encabezado en escritorio y móvil. La política de conexión permanece vigente.

Las pruebas usan temporizadores simulados, promesas controladas y navegación en Chromium para cubrir los vencimientos, las respuestas tardías, el cambio de cuenta, Atrás y Escape. La integración autenticada en Render y la verificación de existencia y membresía en el backend Realtime siguen pendientes.

Validación final con Node 24.18.0. Pasaron 147 pruebas Vitest en 19 archivos y 30 pruebas Playwright en escritorio y móvil. Cobertura global de 91,17 % en líneas, 77,72 % en ramas, 86,01 % en sentencias y 88,28 % en funciones. Pasaron lint, TypeScript, build y `git diff --check`. El build mantiene la advertencia de tamaño del bundle. Las capturas de 390 × 844 y 1440 × 900 muestran la causa de autorización completa en el encabezado.

## Corrección de fiabilidad en SonarQube Cloud

El análisis del PR #13 señaló dos hallazgos `typescript:S7727` en el dashboard. El listado REST y la inserción de la sala confirmada pasaban `toPreview` directamente a `map`. Ahora ambos callbacks pasan explícitamente la sala y el índice que determina el color de la tarjeta. Se conserva el comportamiento del listado. El Quality Gate queda pendiente de una nueva ejecución remota.
