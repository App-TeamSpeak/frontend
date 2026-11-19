# US-05 · Eliminar cuenta

Desde **Mi perfil → Configuración de cuenta**, marcar la casilla de confirmación habilita «Eliminar mi cuenta». El diálogo admite Cancelar y Escape antes del envío, enfoca inicialmente Cancelar y devuelve el foco al disparador al cerrar. Mientras una operación está en curso se bloquean los envíos simultáneos.

## Contrato

El frontend genera 32 bytes con `crypto.getRandomValues` y los convierte en un comprobante hexadecimal de 64 caracteres URL-safe. Lo guarda antes de enviar `DELETE /api/users/me`, sin cuerpo, con `Authorization: Bearer <idToken>` y `X-Deletion-Status-Token`. Si el navegador impide guardar el comprobante, el DELETE no se envía. La respuesta puede incluir `statusToken`, pero el frontend usa el comprobante que guardó.

`GET /api/users/me/deletion-status` lleva únicamente el encabezado `X-Deletion-Status-Token` y funciona aunque Firebase Auth ya no tenga una sesión activa. Las peticiones usan `cache: no-store`. El comprobante no va en la URL, en logs ni en analítica.

[Contrato y pruebas de backend en 40dcb0b](https://github.com/App-TeamSpeak/backend/commit/40dcb0bfd1445176e2bb657903c671110bb0f1d9)

## Estados y recuperación

| Resultado | Comportamiento |
|---|---|
| `200 completed` en DELETE o GET | Borra el comprobante, limpia la caché, finaliza la sesión y abre login con el aviso de eliminación confirmada. |
| `202 pending` en DELETE o `pending` en GET | Conserva el comprobante y permite consultar el progreso. |
| `400 VALIDATION_ERROR` en DELETE | Muestra el rechazo, descarta el comprobante de esa solicitud y vuelve a pedir confirmación explícita. |
| `401 AUTH_RECENT_REQUIRED` | Solicita contraseña actual o Google según los proveedores vinculados. Tras reautenticar y refrescar el ID token, el envío explícito reutiliza el comprobante. |
| `409 ACCOUNT_DELETION_BLOCKED` o `blocked` | Conserva el comprobante y muestra el acceso a ayuda. |
| `409 DELETION_STATUS_TOKEN_MISMATCH` | Busca el comprobante local del UID para consultar. Si el original se guardó en otra pestaña, el usuario puede volver a esa pestaña o acudir a soporte. El backend conserva un hash y no devuelve el original. |
| `404 DELETION_STATUS_NOT_FOUND` o `none` | Informa que el estado no se pudo verificar y conserva el comprobante. |
| Timeout, desconexión o respuesta ambigua | Conserva el comprobante y permite consultar después, incluso si se perdió por completo la primera respuesta. |

El registro se almacena en `sessionStorage`, separado por UID. Sobrevive a recargas y navegación en la misma pestaña. Con una identidad activa solo se consulta su registro. Después de que Firebase resuelve la sesión y confirma que no queda una identidad activa, se puede recuperar el registro de la última identidad de esa pestaña. Las respuestas tardías no modifican la sesión de otro UID. Cerrar la pestaña o borrar sus datos puede eliminar el acceso al comprobante local.

El seguimiento permite consultar manualmente, hace hasta tres consultas automáticas separadas por tres segundos y vuelve a consultar al recuperar conectividad. El GET tiene un plazo de diez segundos y el DELETE de veinte. La recuperación automática solo ejecuta GET. Una vez confirmado `completed`, un fallo de logout o de navegación mantiene el resultado definitivo y permite reintentar la acción local correspondiente.

## Verificación

Vitest cubre generación, persistencia previa al envío, encabezados, 200 y 202 sin comprobante de respuesta, respuesta perdida, recarga sin Firebase, fallo temporal de consulta, comprobante incorrecto, bloqueo, validación, reautenticación, cambio de identidad, doble activación, logout y navegación. Playwright verifica el recorrido en Chromium de escritorio y móvil con identidades y respuestas sintéticas, incluido el reingreso al login tras recargar con la identidad revocada. La validación incluye cobertura, lint, TypeScript y build.

## Dependencia de despliegue

La reanudación de fases pendientes depende del conciliador del backend y de `TEAMSPEAK_ENABLE_DELETION_RECONCILER=true` con la configuración Firebase correspondiente al despliegue. La API y cualquier proxy intermedio deben admitir ambas rutas y el encabezado personalizado para el origen del frontend. Queda por verificar la configuración desplegada y la reanudación real en un entorno aislado autorizado. Para operaciones antiguas cuyo comprobante original ya no esté disponible en el navegador, el frontend solo puede comunicar que el estado no es verificable y orientar a soporte.
