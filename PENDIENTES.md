# Pendientes y mejoras futuras

Lista viva. Cada punto se pasa al CHANGELOG cuando se hace.

## Versión 2.0.0
- **Asistente conversacional con IA**, como servicio de pago.
  - Etapa 1, solo lectura: preguntas sobre una empresa ("¿por qué subieron los gastos de administración?", "¿qué clientes explican el 80 % por cobrar?"), con respuestas que enlazan a la cifra y al comprobante de origen. La IA no calcula: pide las cifras al sistema y las explica. La contabilidad manda.
  - Etapa 2: acciones con confirmación del contador (por ejemplo, preparar el informe mensual).
  - Modelo de cobro: interruptor por estudio activado por el Super Administrador, con verificación en el servidor; complemento de precio fijo en UF más un cupo mensual de preguntas, con paquetes adicionales. Medir el costo real antes de fijar precios.
  - Antes de construirlo: elegir proveedor con plan de pago y condiciones de privacidad que no usen los datos para entrenar modelos; definir qué datos se envían y avisarlo en los contratos; respetar permisos y separación entre estudios; que nunca invente cifras; mostrar el consumo por estudio en el panel del Super Administrador.
- **Agentes de IA** (etapa posterior al asistente): un agente recibe un objetivo y usa las funciones del sistema como herramientas, desde cualquier pestaña, con los permisos del usuario y todo en la auditoría. Orden previo necesario:
  - Funciones únicas por acción (compensar, contabilizar, aprobar, crear O/C), con sus reglas dentro y no repetidas en cada pantalla. Hoy la compensación está en tres lugares.
  - El agente actúa "como" un usuario: mismos permisos, mismas reglas de períodos cerrados, misma auditoría.
  - Al comienzo propone y el contador aprueba; las acciones que no se pueden deshacer (cerrar períodos, eliminar) siempre piden confirmación.
  - Primeras tareas sugeridas, por tener resultado verificable: sugerir compensaciones y conciliación bancaria.
  - Costo por uso de la IA, privacidad de datos y elección de proveedor, como en el asistente.

## Panel del Super Administrador
- **Clave API del SII al servidor.** Hoy se guarda solo en el navegador de quien la ingresa; la consulta automática del RCV funciona únicamente desde ese equipo. Mover la clave a una variable segura del servidor y hacer que las consultas al SII pasen por el servidor (así sirve a todos los estudios y la clave no llega a ningún navegador).
- **Pestaña "Asistente IA"** (entrenamiento): se dejó tal cual. Mejora futura: revisar qué hace, simplificarla y dejarla con texto claro.
- **Alertas por WhatsApp o correo** (indicadores del día sin actualizar, estudio sin actividad, certificado digital por vencer, accesos fallidos). Requiere una revisión programada en el servidor y un canal de envío.
- Errores de ejecución de Vercel y despliegues fallidos dentro del panel.
- Uso por estudio (empresas, usuarios, comprobantes, trabajadores) para planes y cobros.
- Control de calidad contable por empresa (comprobantes descuadrados, meses sin cierre, cuentas sin clasificar).
- Fecha del último respaldo de la base de datos (y crear respaldo automático si no existe).

## Sueldos
- Pensionados (por vejez, invalidez parcial): definir cotizaciones que corresponden a cada tipo.
- Revisión del archivo Previred campo por campo contra la especificación oficial vigente.
- Revisión del Libro de Remuneraciones Electrónico (LRD).

## Contabilidad y reportes
- Alinear las cifras de balance de los KPIs con el Balance IFRS cuando se elige "Todos" los años.
- Regla 80/20 de clientes: opción de incluir solo clientes (sin préstamos ni anticipos del rubro 1102).
- Conciliación con explicación (activo fijo, inventarios, ventas) y acceso de solo lectura para clientes: por ahora solo ideas.

## Plataforma
- Probar aislamiento entre estudios.
- Base de datos separada para Pruebas (hoy Pruebas y producción comparten la misma).
- Euro e IPC históricos; NIIF 18; Importación inteligente (fases 3 y 4); marcar más pantallas como "solo trabajo" para el modo presentación.
- Crear la etiqueta (tag) de cada versión en GitHub (el sistema no puede hacerlo desde aquí).


## Compensación de partidas (siguiente etapa)
- Que se compense sola al registrar el pago, cobro o nota (hoy se revisa con el botón "Compensar todas las cuentas").
- Pagos y cobros parciales: pagar parte de una factura y dejar el resto abierto (el pareo parcial ya existe, falta proponerlo).
- Nota de crédito/débito: usar el folio de referencia del RCV (refFolioOrig) para ligarla con su factura.
- Compensación entre cuentas con asiento de traspaso automático.


## Mejoras futuras (13-nov-2026)
- Asistente del observador: conectar Gemini para preguntas abiertas e interpretación de indicadores; más informes con botón (composición de una cuenta, ventas y compras del mes); menú lateral con módulos activables por cliente; inicio proactivo con alertas.
- Observador (o cualquier usuario) con un mismo correo en varios estudios: hoy un correo pertenece a un solo estudio; permitir varios y elegir el estudio al entrar.
- Pyme directa (sin estudio contable): ingreso de datos simple y acompañamiento.
- Compensación de partidas, etapa 2: automática al registrar pagos, cobros, NC y ND.
- Revisar impresión con estilos en certificados SII, balance y pendientes.
- Empresa de pruebas: cambiar nombre a "Cliente de Prueba SPA", RUT 76.123.456-0, y revisar nombres reales de proveedores y clientes en sus datos.

## Módulo de Compras (siguientes etapas)
- Enviar la O/C por correo al proveedor desde el sistema (hoy se imprime o guarda en PDF).
- Aviso por correo a los aprobadores cuando una O/C queda esperando su aprobación.
- Cierre de diferencias abiertas en Facturas por Recibir con un asiento de ajuste guiado.
- Recepción con inventario: mover Kardex/bodega al recibir productos.
- Notas de crédito del proveedor referenciadas a la O/C.

## Agentes (a futuro)
- Cuando trabajemos con agentes, estos deberán poder operar desde todas las pestañas/módulos del sistema (no solo un módulo): leer, proponer y ejecutar acciones (por ejemplo compensar, contabilizar, aprobar O/C) con los mismos permisos y reglas del usuario, dejando todo en la auditoría.

## Módulo de Ventas (siguientes etapas)
- Costo de venta y salida de inventario (Kardex) al entregar productos.
- Nota de crédito referenciada a la orden de venta.
- Conectar un facturador electrónico: emitir la factura desde la O/V y traer folio y PDF automáticamente.
- Superposición con Gestión Comercial (cotización/orden de venta/factura que ya existe): decidir si se unifica o se reemplaza.


## Orden técnico previo a 2.0.0 (plan aprobado)
- Etapas 1 y 3 hechas (v1.16.3 y v1.16.4). Etapa 2 en curso (v1.16.5): faltan por migrar a `capaContable.ts` los lugares que aún crean comprobantes directo: RCV (contabilizar), Conciliación bancaria, Emisión DTE, Nóminas de pago, Formulario 29, Cobranza, Libro Banco, Agent1 Conciliador, interbankTransferEngine, Importación Excel. De a uno, con prueba antes/después.
- Etapas 4 a 6 (partir el dashboard de 10.000 líneas, unificar Compras/Ventas, archivos grandes) quedan después. Gestión Comercial: se mantiene tal cual por ahora.
- Reducir de a poco `scripts/tsc-baseline.txt` (50 errores antiguos).
- Diseño comercial (decidido por Ramón): un solo Módulo Comercial con dos submódulos, Ventas y Compras (Adquisiciones). Gestión Comercial actual se integrará ahí (etapa 5). A futuro: empresas que transforman (producción), compran para revender.
- Etapa 2, restan: Emisión DTE, Agent1 Conciliador, interbankTransferEngine, Importación Excel, Conciliación (usan el contador pero crean el comprobante por su cuenta).

## Facturación electrónica: preparar el sistema para facturadores externos
Hallazgos (nov 2026): el módulo "Emisión DTE" es una simulación (firma `SIMULATED_RSA_DIGITAL_SIGNATURE`, timbre simulado, test de conexión simulado) y guarda en la base de datos las claves SII del representante y de la empresa (`claveRepLegalSii`, `claveEmpresaSii`) sin cifrar.
Propuesta: (1) marcar Emisión DTE como "Demostración" y no guardar claves; (2) campo `origenDocumento` en documentos RCV (DIGITADO, RCV_SII, FACTURADOR:<nombre>); (3) importar XML/CSV de DTE de cualquier facturador (Bsale, Nubox, Haulmer, SimpleFactura...) hacia RCV y enlazarlo a la O/V; (4) más adelante, conector API a un facturador elegido.
- Seguridad: las claves SII (`claveRepLegalSii`, `claveEmpresaSii`) siguen en el documento de la empresa porque la descarga automática del RCV las lee desde ahí. Migrar a `/api/companies/:id/secrets` (cifrado en servidor, ya existe) y hacer que la descarga del RCV use los secretos del servidor; probar contra el SII antes de borrar las claves en claro.
- Facturación: mostrar el origen del documento en la lista del RCV; enlazar XML importado con la O/V automáticamente por folio/referencia; conector API a un facturador (paso 4).

## Agentes de IA (piloto desde v1.18.0)
- Hoy hay un solo agente: reclasificación. Reglas de acceso en `src/utils/agenteAcceso.ts` (y duplicadas en `api/index.ts`): `AGENTE_FASE_PILOTO = true` limita a Super Admin y campos.ramon@gmail.com.
- Para ofrecerlo en planes con costo: poner `AGENTE_FASE_PILOTO = false` (en ambos archivos), definir precio/límite de uso por estudio y medir consumo de la API de IA.
- Agentes futuros, mismo esquema (la IA interpreta, el sistema calcula, el usuario aprueba): conciliación bancaria asistida, revisión de cuadraturas, borrador de F29, cobranza.
- Mejoras del reclasificador: modificar el auxiliar/centro de costo, reclasificar por documento, deshacer con un clic.
