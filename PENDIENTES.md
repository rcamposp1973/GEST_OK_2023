# Pendientes y mejoras futuras

Lista viva. Cada punto se pasa al CHANGELOG cuando se hace.

## Versión 2.0.0
- **Asistente conversacional con IA**, como servicio de pago.
  - Etapa 1, solo lectura: preguntas sobre una empresa ("¿por qué subieron los gastos de administración?", "¿qué clientes explican el 80 % por cobrar?"), con respuestas que enlazan a la cifra y al comprobante de origen. La IA no calcula: pide las cifras al sistema y las explica. La contabilidad manda.
  - Etapa 2: acciones con confirmación del contador (por ejemplo, preparar el informe mensual).
  - Modelo de cobro: interruptor por estudio activado por el Super Administrador, con verificación en el servidor; complemento de precio fijo en UF más un cupo mensual de preguntas, con paquetes adicionales. Medir el costo real antes de fijar precios.
  - Antes de construirlo: elegir proveedor con plan de pago y condiciones de privacidad que no usen los datos para entrenar modelos; definir qué datos se envían y avisarlo en los contratos; respetar permisos y separación entre estudios; que nunca invente cifras; mostrar el consumo por estudio en el panel del Super Administrador.

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
