# US-05 · Eliminar cuenta

La fase 1 incorpora la confirmación accesible desde Mi perfil, en Configuración de cuenta. `ProfilePage` monta `AccountDeletionDialog` al consultar un perfil. El componente presenta la advertencia de pérdida de acceso, una casilla que empieza desmarcada en cada apertura, un aviso de indisponibilidad y las acciones Cancelar y Eliminar mi cuenta. La casilla es interactiva y el botón destructivo permanece deshabilitado incluso después de marcarla.

## Diseño y accesibilidad

La referencia es la página de Sprint 2 de Figma. Los frames de perfil son `295:155` y `295:834`. La confirmación inicial corresponde a `295:460` y `295:1094`, y la marcada a `297:344` y `297:374`. Se conserva la composición del diálogo en escritorio (1440 × 900) y móvil (390 × 844), con un aviso que distingue esta fase de la variante habilitada de Figma. Los estados de procesamiento (`295:490`, `295:1119`), éxito (`295:518`, `295:1142`) y error (`295:544`, `295:1163`) se reservan para la integración.

El diálogo nativo usa `showModal()`, título y descripción accesibles, una etiqueta asociada a la casilla, foco inicial en Cancelar, navegación por teclado y restitución de foco al cerrar con Cancelar o Escape. El diálogo de descarte de US-04 conserva su propio comportamiento.

[Diseño de Sprint 2 en Figma](https://www.figma.com/design/WHh4b0fAkGJeuUR4IBsvlc/TeamSpeak-UX-UI-Flow?node-id=295-36)

## Seguridad y pruebas

El componente carece de un controlador destructivo y de dependencias de HTTP, Firebase o autenticación. La confirmación se limita al diálogo. La sesión y el perfil se conservan. Las pruebas de perfil verifican que no se llama al servicio DELETE, a `deleteUserAccount()`, a la eliminación de Firebase ni a los servicios de logout. Playwright usa identidades sintéticas e intercepta cualquier DELETE de perfil, además de comprobar teclado, foco, reapertura, cambio de cuenta y diseño responsive. Sus capturas son evidencia de la interfaz.

## Contrato de pruebas y fase 2

El backend admite `DELETE /api/users/me` únicamente en un entorno aislado con emuladores. Fuera de ese entorno el contrato prevé `501 NOT_IMPLEMENTED`. La solicitud va sin cuerpo y usa Firebase Bearer. Una intención nueva requiere un `auth_time` de máximo 300 segundos. `202` con `status: "pending"` confirma que la intención se registró y el procesamiento puede seguir pendiente. No se confirmó una ruta pública de seguimiento.

Antes de habilitar la operación se necesita acordar y verificar el contrato productivo, la reautenticación por Google y por contraseña, la consulta de estado, el tratamiento de timeouts y respuestas tardías, la recuperación ante fallos parciales y la política de sesión después de aceptar o completar una solicitud. Renovar el token no acredita autenticación reciente. Debe revisarse `deleteUserAccount()`, que hoy limpia caché y cierra sesión tras una respuesta HTTP exitosa. La interfaz solo podrá mostrar un éxito definitivo con evidencia de finalización del servidor. También quedan pendientes la evidencia productiva, la revisión con lector de pantalla y la comprobación del alcance de limpieza de los datos asociados.

La fase 2 requiere idempotencia en el servidor. El backend puede aceptar una solicitud aunque el navegador pierda la respuesta. Ante un resultado incierto, el frontend debe consultar el estado mediante un contrato acordado con el backend y evitar el reenvío automático del DELETE. El servidor debe reconocer solicitudes repetidas sin iniciar procesos contradictorios. Un `202 pending` indica que se registró la intención y la eliminación definitiva sigue sin confirmarse. La estrategia depende del backend y queda pendiente de implementación en esta fase.

[Contrato OpenAPI de backend](https://github.com/App-TeamSpeak/backend/blob/e52afa7f05e09ef44d2b93429bf1a30c974667e3/backend-api/src/docs/openapi.ts)

## Validación local

Con Node.js 24.18.0 aprobaron las 12 pruebas focalizadas de perfil, 147 pruebas Vitest y 32 pruebas Playwright. La cobertura global fue de 91,22 % de líneas, 77,68 % de ramas, 86,09 % de sentencias y 88,39 % de funciones. Pasaron lint, TypeScript, build y `git diff --check`. El build mantuvo la advertencia de tamaño del bundle. Se revisaron las capturas en escritorio y móvil. Queda pendiente la comprobación con lector de pantalla.
