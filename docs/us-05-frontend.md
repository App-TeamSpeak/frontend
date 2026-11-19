# US-05 · Eliminar cuenta

La fase 1 incorpora la confirmación accesible desde Mi perfil, en Configuración de cuenta. `ProfilePage` monta `AccountDeletionDialog` al consultar un perfil. El componente presenta la advertencia de pérdida de acceso, una casilla que empieza desmarcada en cada apertura, un aviso de indisponibilidad y las acciones Cancelar y Eliminar mi cuenta. La casilla es interactiva y el botón destructivo permanece deshabilitado incluso después de marcarla.

## Diseño y accesibilidad

La referencia es la página de Sprint 2 de Figma. Los frames de perfil son `295:155` y `295:834`. La confirmación inicial corresponde a `295:460` y `295:1094`, y la marcada a `297:344` y `297:374`. Se conserva la composición del diálogo en escritorio (1440 × 900) y móvil (390 × 844), con un aviso que distingue esta fase de la variante habilitada de Figma. Los estados de procesamiento (`295:490`, `295:1119`), éxito (`295:518`, `295:1142`) y error (`295:544`, `295:1163`) se reservan para la integración.

El diálogo nativo usa `showModal()`, título y descripción accesibles, una etiqueta asociada a la casilla, foco inicial en Cancelar, navegación por teclado y restitución de foco al cerrar con Cancelar o Escape. El diálogo de descarte de US-04 conserva su propio comportamiento.

[Diseño de Sprint 2 en Figma](https://www.figma.com/design/WHh4b0fAkGJeuUR4IBsvlc/TeamSpeak-UX-UI-Flow?node-id=295-36)

## Seguridad y pruebas de la fase 1

El componente carece de un controlador destructivo y de dependencias de HTTP, Firebase o autenticación. La confirmación se limita al diálogo. La sesión y el perfil se conservan. Las pruebas de perfil verifican que no se llama al servicio DELETE, a `deleteUserAccount()`, a la eliminación de Firebase ni a los servicios de logout. Playwright usa identidades sintéticas e intercepta cualquier DELETE de perfil, además de comprobar teclado, foco, reapertura, cambio de cuenta y diseño responsive. Sus capturas son evidencia de la interfaz.

## Contrato de pruebas y fase 2

El backend admite `DELETE /api/users/me` únicamente en un entorno aislado con emuladores. Fuera de ese entorno el contrato prevé `501 NOT_IMPLEMENTED`. La solicitud va sin cuerpo y usa Firebase Bearer. Una intención nueva requiere un `auth_time` de máximo 300 segundos. `202` con `status: "pending"` confirma que la intención se registró y el procesamiento puede seguir pendiente. No se confirmó una ruta pública de seguimiento.

Antes de habilitar la operación se necesita acordar y verificar el contrato productivo, la reautenticación por Google y por contraseña, la consulta de estado, el tratamiento de timeouts y respuestas tardías, la recuperación ante fallos parciales y la política de sesión después de aceptar o completar una solicitud. Renovar el token no acredita autenticación reciente. Debe revisarse `deleteUserAccount()`, que hoy limpia caché y cierra sesión tras una respuesta HTTP exitosa. La interfaz solo podrá mostrar un éxito definitivo con evidencia de finalización del servidor. También quedan pendientes la evidencia productiva, la revisión con lector de pantalla y la comprobación del alcance de limpieza de los datos asociados.

La fase 2 requiere idempotencia en el servidor. El backend puede aceptar una solicitud aunque el navegador pierda la respuesta. Ante un resultado incierto, el frontend debe consultar el estado mediante un contrato acordado con el backend y evitar el reenvío automático del DELETE. El servidor debe reconocer solicitudes repetidas sin iniciar procesos contradictorios. Un `202 pending` indica que se registró la intención y la eliminación definitiva sigue sin confirmarse. La estrategia depende del backend y queda pendiente de implementación en esta fase.

[Contrato OpenAPI de backend](https://github.com/App-TeamSpeak/backend/blob/e52afa7f05e09ef44d2b93429bf1a30c974667e3/backend-api/src/docs/openapi.ts)

## Validación local de la fase 1

Con Node.js 24.18.0 aprobaron las 12 pruebas focalizadas de perfil, 147 pruebas Vitest y 32 pruebas Playwright. La cobertura global fue de 91,22 % de líneas, 77,68 % de ramas, 86,09 % de sentencias y 88,39 % de funciones. Pasaron lint, TypeScript, build y `git diff --check`. El build mantuvo la advertencia de tamaño del bundle. Se revisaron las capturas en escritorio y móvil. Queda pendiente la comprobación con lector de pantalla.

## Diagnóstico anterior del Sprint 2 (3044e8a)

El OpenAPI publicado ahora describe `200` con `status: "deleted"` para el DELETE sin cuerpo. El flujo histórico de emulador con `202 pending` sigue siendo distinto. La ruta actual borra datos en varias fases y carece de recuperación verificable después de eliminar la identidad. El diálogo permanece deshabilitado. El helper frontend preparado exige `200 deleted`, evita reintentos automáticos y solicitudes concurrentes de la misma sesión, trata red, timeout y respuestas ambiguas como resultado desconocido e ignora una confirmación de otra sesión. Su plazo local es de 20 segundos. Se prueba con fixtures y sigue desconectado de la interfaz. Véase [la ficha para backend](sprint-2-integration.md).

## Revisión previa a la habilitación

Backend `038d456` reemplazó el contrato inmediato `200 deleted` por DELETE sin cuerpo con `202 pending` o `200 completed`, ambos con `statusToken`. El servidor verifica revocación, exige autenticación reciente para la primera solicitud y usa fases y lease. GET `/api/users/me/deletion-status` reporta `none`, `pending`, `blocked` o `completed`. Acepta Bearer o `X-Deletion-Status-Token`.

El transporte frontend valida el par HTTP/estado, envía un solo DELETE sin reintento automático y ofrece consulta manual por Bearer o encabezado de estado. El helper conserva sesión ante pendiente, timeout o pérdida de respuesta. Solo `completed` válido de la sesión vigente permite limpiar sesión. El cliente no persiste el token, no lo introduce en URL ni lo registra. No hay polling activo.

El diálogo continúa deshabilitado. El conciliador publicado solo se habilita en emuladores. El GET de seguimiento es de lectura y, si se pierde la respuesta inicial tras invalidar la identidad, puede faltar tanto el token de estado como un Bearer utilizable. Además, reiterar DELETE rota el token. Antes de conectar el diálogo, backend debe acreditar reanudación productiva, recuperación cuando se pierde el primer recibo y estabilidad o rotación recuperable del token. No hay pantallas productivas simuladas de procesamiento o éxito.

## US-05 habilitada en frontend

El diálogo abre desde Mi perfil con la casilla desmarcada. Marcarla habilita «Eliminar mi cuenta» y la operación requiere un clic explícito. Cancelar o Escape antes de iniciar conservan perfil y sesión. Si el DELETE es rechazado con `AUTH_RECENT_REQUIRED`, se solicita la contraseña actual o reautenticación con Google según los proveedores vinculados. Se usa Firebase Client SDK y se renueva el ID token después de reautenticar. La contraseña se limpia del campo al enviar y se usa solo en memoria.

El cliente envía DELETE sin cuerpo y valida la combinación de código HTTP y estado. `202 pending` conserva la sesión y muestra que la solicitud fue aceptada. El seguimiento consulta GET mediante el token recibido. El diálogo ofrece consulta manual y hasta tres consultas automáticas con intervalos de tres segundos, limitadas al diálogo visible. Cada GET tiene un plazo de diez segundos. El DELETE tiene un plazo HTTP de veinte segundos. Si se pierde la respuesta, se intenta consultar con Bearer cuando sigue disponible. Un rechazo de autenticación reciente permite una nueva solicitud explícita tras reautenticar. Un resultado ambiguo nunca provoca otro DELETE. Los estados `none`, `blocked` y los errores de consulta no acreditan finalización.

El seguimiento vive en memoria en el layout y permanece durante la navegación en el mismo documento. El token va exclusivamente por encabezado, se descarta al cambiar de identidad o confirmar y se pierde con una recarga completa. Si se pierden la sesión y el recibo, la interfaz ofrece ayuda y evita afirmar un resultado. Un `completed` válido limpia la sesión y caché, cierra el diálogo y dirige al login con un aviso. El diálogo usa etiquetas, estados anunciables y restitución de foco cuando el disparador sigue montado. La confirmación y procesamiento siguen los frames de Figma. El aviso final se presenta en login y se añaden los estados de seguimiento e incertidumbre requeridos por el contrato.

Render publica los endpoints descritos en el código revisado en el SHA `038d456177862ecf2a9a4d7e36c9614e9529e499`. Los recorridos de frontend se verifican con identidades y respuestas sintéticas. La prueba autenticada de eliminación definitiva sigue pendiente. La reanudación automática tras fallos parciales y el seguimiento cuando se pierde el primer recibo tras revocar Auth requieren garantías de backend. La interfaz no puede completar ni certificar esos casos.

### Validación de la habilitación

Con Node.js 24.18.0 aprobaron 94 pruebas focalizadas, 187 pruebas Vitest y 38 Playwright, 19 por proyecto. Cobertura global de 90,41 % en líneas, 78,38 % en ramas, 85,25 % en sentencias y 87,66 % en funciones. Pasaron lint, TypeScript, build y `git diff --check`. Las capturas a 1440 × 900 y 390 × 844 muestran confirmación, procesamiento, bloqueo y aviso de éxito en login con fixtures.

### Finalización confirmada y recuperación local

El estado `completed` se registra de forma definitiva por cada intento y descarta el recibo de seguimiento. Antes, un rechazo de `logoutUser()` podía propagarse al manejo del DELETE o del GET y presentar falsamente un resultado desconocido. La finalización ahora distingue el resultado del servidor, la limpieza local de Firebase y la apertura del login.

Si el cierre local falla y Firebase conserva la identidad, el diálogo mantiene la confirmación, limpia la caché del perfil y permite reintentar solo el cierre. La pantalla privada permanece detrás del diálogo modal hasta que se pueda completar la salida. El contexto de autenticación se limpia cuando Firebase deja de tener una identidad activa. Si falla la transición al login, se ofrece reintentar la navegación. La recuperación serializa los intentos, comprueba la identidad vigente y carece de nuevas solicitudes DELETE o de seguimiento.

Las pruebas cubren confirmación directa y por seguimiento, fallo y recuperación de logout, fallo de navegación, cambio de identidad y doble activación. Sigue pendiente de backend la recuperación sin recibo tras invalidar Auth y la reanudación productiva. Ese caso ocurre antes de obtener una confirmación definitiva.
