# Registro de cambios — Gest_OK / Pulso Contable

Formato de versiones: **MAYOR.MENOR.PARCHE** (versionado semántico).
- **PARCHE** (1.1.1): corrige un error, sin cambiar lo que el usuario ve ni hace.
- **MENOR** (1.2.0): agrega una función nueva sin romper lo anterior.
- **MAYOR** (2.0.0): cambio grande que obliga a trabajar distinto o altera los datos de forma incompatible.

Cada versión que pasa a producción queda marcada en GitHub (etiqueta `vX.Y.Z`). En pantalla, la versión aparece con el código del despliegue (ejemplo: `v1.1.0 · 578a157`).

---

## 1.9.5 — 11 de noviembre de 2026 — Liquidación de sueldo más limpia

- Se quitó de la liquidación el recuadro de "Aportes del empleador / Costo Empresa" (no es exigido en la liquidación).
- El giro que se imprime ahora es el de la empresa empleadora (antes salía un texto fijo). Si la empresa no tiene giro, no se muestra.
- Se quitó la referencia "Ley N° 18.018 y Art. 54 Código del Trabajo" del encabezado.
- Títulos simplificados: "Haberes" y "Descuentos" (también en la planilla de remuneraciones).

## 1.9.4 — 11 de noviembre de 2026 — Remuneraciones con menos repetición

- **Una sola fila de cifras** en la nómina: imponible, retenciones al trabajador, líquido a pagar y costo para la empresa, con nombres distintos. Se quitaron las tarjetas duplicadas del encabezado ("Leyes sociales totales" se confundía con "Leyes sociales y retenciones").
- **Período una sola vez**: en el selector. Se quitó de la insignia junto al título, de los botones ("Reprocesar", "Procesar") y del título de la planilla.
- Se quitó el botón "Guardar liquidaciones" de la planilla: hacía exactamente lo mismo que "Procesar" del encabezado.
- **Resumen compacto**: las cuatro cifras en una sola franja baja, y se quitó el aviso amarillo "Período sin procesar" (repetía el botón Procesar de arriba); ahora basta una marca "Vista previa, sin procesar" junto al título de la planilla.
- **Parámetros del período** (UF, UTM, ingreso mínimo, tope, SIS) en una línea discreta en vez de una franja negra.
- Se quitaron las líneas descriptivas y la insignia "Capa 1: Módulo Operativo" del encabezado de los módulos.

## 1.9.3 — 11 de noviembre de 2026 — Panel del Super Administrador, alertas por correo y página de inicio

- **Panel rediseñado para teléfono**: tarjetas en vez de tablas, botones grandes, pestañas deslizables (también en la barra superior del Super Administrador).
- **Sin consultas automáticas**: antes leía toda la base cada 30 segundos y mantenía un flujo en vivo. Ahora carga una vez al abrir (o usa una copia de hasta 10 minutos) y solo consulta de nuevo al pulsar "Actualizar". Los totales usan consultas de conteo, mucho más baratas que leer cada registro. La actividad detallada se lee solo al abrir esa pestaña.
- **Estado del sistema real**: servidor, base de datos, sesión, indicadores UF/dólar (fecha del último valor) y clave SII, con aviso si algo falla. Antes eran etiquetas fijas "ONLINE 100 %".
- **Cifras exactas de actividad** (hoy, 7 y 30 días) en vez del tope de 800 registros.
- **Alertas por correo**: revisión diaria (9:00 hora de Chile) que escribe solo si hay algo por revisar: indicadores UF/dólar sin actualizar, estudios sin actividad por 7 días y estudios cerca de su límite de plan. Botón "Enviar correo de prueba" en el panel. Requiere configurar en Vercel `RESEND_API_KEY`, `ALERT_EMAIL_TO` y `CRON_SECRET`.
- **Página de inicio rediseñada**: más limpia y moderna, con un solo mensaje, las funciones en lista, planes en UF (desde el panel) y formulario de contacto. Se quitaron las demostraciones con pestañas (sus cifras de ejemplo no cuadraban), los testimonios inactivos, el campo de correo del portada y las insignias. Una sola escucha a la base de datos (planes) en vez de dos.
- Se quitaron textos que confundían: "propagada a todos los estudios", proveedor y endpoint que no hacían nada, "alta disponibilidad", insignias y banners de relleno. La clave del SII se declara tal como funciona: se guarda solo en este navegador.

## 1.9.2 — 9 de noviembre de 2026 — Cambios previsionales registrados por el contador

- Al guardar la ficha de un trabajador, si cambió AFP, salud (Fonasa/Isapre), tipo o valor del plan o tipo de contrato, el sistema pide registrarlo: desde qué mes rige, el motivo y, opcionalmente, el respaldo (FUN de Isapre, carta de AFP, anexo). Ya no se cambia en silencio. También se puede marcar como corrección de un dato mal ingresado.
- Cada cambio guarda quién lo registró y cuándo, y el respaldo se puede abrir desde la ficha. Tamaño máximo del respaldo: 700 KB (PDF o imagen).

## 1.9.1 — 9 de noviembre de 2026 — Sueldos: vigencias por fecha y seguro de cesantía

- **Cambios con vigencia (desde / hasta)** en la ficha del trabajador: AFP, Isapre/Fonasa y plan, tipo de contrato, bonos, colación, movilización, cuotas de préstamo, seguros y otros descuentos. Se pueden registrar varios cambios sucesivos (cambio de AFP, paso de Fonasa a Isapre y de vuelta, etc.). Los meses anteriores no se alteran.
- **Seguro de cesantía según contrato**: indefinido y part time 0,6 % trabajador + 2,4 % empleador; plazo fijo y obra o faena 0 % + 3,0 %; con 11 años de servicio en contrato indefinido el trabajador deja de cotizar y el empleador sigue con 0,8 %; pensionados sin seguro. Antes el part time se trataba como plazo fijo.
- **Casos de prueba de sueldos** en `tests/payrollCases.ts` (se ejecutan con `npx tsx tests/payrollCases.ts`).
- **AFP Uno**: la comisión correcta es 0,46 % (total 10,46 %); se corrigió la etiqueta de 10,49 % y se ignora ese valor antiguo guardado en fichas.

## 1.9.0 — 8 de noviembre de 2026 — Reportes alineados con la contabilidad, pareo parcial e informe mensual

- **Informe mensual (foto fija)**: nuevo módulo en Indicadores. Congela las cifras de un mes (resultados, situación financiera e indicadores) junto con los comentarios del contador. Si después la contabilidad cambia, avisa qué cifras difieren de la foto; la foto no se modifica sola. Se imprime a PDF y en modo presentación los comentarios se muestran como texto.
- Reportes Analíticos y panel Analytics HUD: ahora clasifican las cuentas con la clasificación IFRS del plan (no con el primer dígito del código), excluyen comprobantes anulados, descuadrados y el de cierre de año. Se corrigió que la fuente "Contabilidad" del análisis de ventas tomaba las cuentas que parten en 4 (gastos) como ventas; ahora usa los ingresos de actividades ordinarias.
- Balance IFRS: cada rubro tiene un botón para abrir el saldo mes a mes (acumulado), por cuenta y auxiliar, con saldo inicial si corresponde. Balance de 8 columnas: clic en una cuenta abre su detalle. En ambos, el detalle acumula como el informe (desde enero o desde la última apertura).
- Análisis de Cuentas: **pareo parcial**. Si cargos y abonos seleccionados no suman lo mismo (aportes y rescates parciales de un fondo mutuo, pagos parciales de una factura), el botón "Parear parcialmente" compensa hasta el monto menor, repartiendo el lado mayor de la partida más antigua a la más nueva; lo que sobra queda como partida abierta. La partida se muestra en fragmentos (lo pareado y lo abierto) y se puede deshacer como cualquier pareo. El cierre y apertura de año arrastra solo el resto abierto. La planilla de consultas dinámicas no da por compensada una partida pareada solo en parte.
- Detalle de cuenta › Documentos abiertos: descuenta lo pareado en Análisis de Cuentas (total o parcial) con su fecha de pareo respecto del corte, además de reconocer el documento por tipo y número.
- Detalles (Resultados, Balance IFRS, Balance 8 columnas, KPIs, informe de gastos, regla 80/20): el número de comprobante abre el comprobante completo. Estado de Resultados: cada rubro muestra el movimiento del mes frente al mes anterior y el período acumulado frente al mismo período del año anterior, con variación (se puede ocultar).

## 1.8.0 — 7 de noviembre de 2026 — Detalle navegable, Cierre y apertura de año
- Regla 80/20 (antes "Pareto"): ahora explica el saldo por cobrar (clientes) y por pagar (proveedores) al mes de corte, con la misma regla del Balance IFRS (rubros 1102 y 2101, acumulado desde la última apertura). Muestra el saldo contable total, saldos a favor y sin auxiliar, y las cuentas incluidas; cada fila abre los documentos abiertos y movimientos del auxiliar. Principio: la contabilidad manda.
- Indicadores Financieros › Informe de gastos: ahora usa la misma base que el Estado de Resultados (neto debe-haber, solo comprobantes cuadrados) y cada fila abre la tabla dinámica (centro de costo ⇄ ítem, por mes). El panel muestra "código - nombre" de centros de costo e ítems.
- KPIs: cada tarjeta se abre y muestra de qué cifras sale (con su fórmula), cada cifra se despliega en sus componentes y cuentas, y las de resultado abren la tabla dinámica por centro de costo, ítem y mes.
- Estado de Resultados: al hacer clic en un rubro o cuenta se abre un panel tipo tabla dinámica (filas por centro de costo / ítem / cuenta / auxiliar, columnas por mes); clic en una fila baja un nivel, clic en un mes llega a los movimientos; ruta de navegación para volver.
- Nuevo módulo **Cierre y apertura de año** (Finanzas): revisión previa, comprobante de cierre de resultados (31-12) y comprobante de apertura del año siguiente (01-01) con los saldos; las cuentas con auxiliar o documento se abren partida por partida (solo lo pendiente). Se puede revertir.
- Balance IFRS, Balance de 8 columnas y Estado de Resultados ignoran el comprobante de cierre para no vaciar el resultado del año.
- Las cuentas sin auxiliar que se analizan con pareos se abren partida por partida (solo lo no pareado al 31-12).
- Botón para cerrar los 12 meses del año tras el cierre (deja abierto enero del año siguiente).
- "Todo el ejercicio" en los balances no suma años anteriores a la última apertura generada (evita duplicar saldos).
- **Modo presentación** (botón "Presentación" arriba): oculta la barra lateral, los avisos internos y los botones de auditoría para mostrar los estados al cliente.
- Análisis de Auxiliares: el Excel exportado incluye la fecha de corte.
- Cuentas: **Compensar y registrar diferencia**: si cargos y abonos marcados no cuadran (ej: aporte vs rescate de un fondo mutuo), crea el comprobante con la diferencia contra la cuenta de resultado elegida (se sugiere la financiera) y compensa todo el grupo; recuerda la cuenta elegida.
- Cuentas: panel **Posiciones por identificador** (aportes, rescates y saldo abierto por cada fondo/folio); un clic filtra sus partidas.
- **Detalle navegable**: en el Balance IFRS y el Estado de Resultados, un clic en una cuenta abre un panel con sus movimientos y, según los datos de la cuenta, auxiliares, documentos abiertos, centros de costo, ítems, proyectos y productos, al período mostrado.

---

## 1.7.0 — 7 de noviembre de 2026
**Análisis de cuentas a fecha de corte y pantalla Cuentas más compacta.**
- Análisis de Cuentas: campo **Analizar a la fecha**. Una partida cuenta como compensada solo si su pareo ya existía a esa fecha (fecha de pareo = la del movimiento más nuevo del grupo). Muestra el control: saldo de la cuenta a la fecha vs partidas abiertas.
- Cuentas: la banda flotante de compensación ya no tapa las últimas partidas; filas más bajas, tablas que usan la altura de la ventana y filtros avanzados plegados por defecto.

---

## 1.6.1 — 7 de noviembre de 2026
**Período por pestaña.**
- Cada pestaña recuerda su propio mes: Balance de 8 columnas, Balance IFRS, Estado de Resultados y Conciliación bancaria ya no vuelven al último mes al cambiar de pestaña. El mes elegido en una no cambia las otras, y se olvida al cerrar la pestaña. Al abrir una pestaña parte en el período de arriba (último abierto).
- Los selectores de mes del Balance IFRS y del Balance de 8 columnas ofrecen también los períodos recién abiertos en Configuraciones (antes solo los meses con movimientos).

---

## 1.6.0 — 7 de noviembre de 2026
**Importaciones, Importación inteligente y vistas compactas.**
- El aviso de clasificación del Balance IFRS aparece solo cuando hay cuentas realmente dudosas; ya no queda pegado cuando todo está bien resuelto.
- Balance IFRS y Estado de Resultados más compactos: más información visible sin desplazarse.
- El grupo "CARGA (SII)" pasa a llamarse **Importaciones** y reúne RCV, parámetros, carga masiva y plantillas.
- **Importación inteligente** (nuevo): subes el libro de remuneraciones, el agente revisa que cuadre, te pregunta lo que no sabe (centros de costo, cuenta de gasto, ítems) y entrega el comprobante cuadrado en formato de carga masiva. Las respuestas quedan guardadas por empresa.

---

## 1.5.3 — 7 de noviembre de 2026
- **Corrección**: en el Estado de Resultados, cada cuenta ahora respeta el mes de corte elegido (antes mostraba el año completo y no coincidía con el total del rubro).

---

## 1.5.2 — 7 de noviembre de 2026
- **Corrección**: cuentas con código propio (ej: 5101001) ahora se clasifican en Balance y Estado de Resultados según su clasificación IFRS (ej: 3101 = ingreso).

---

## 1.5.1 — 6 de noviembre de 2026
- Página de inicio: la sección de testimonios queda inactiva hasta contar con opiniones reales de clientes (se reactiva cambiando un interruptor en `LandingHome.tsx`). Ya no aparecen testimonios de ejemplo.

---

## 1.5.0 — 6 de noviembre de 2026
**Conciliación bancaria: propuestas más inteligentes.**
- Abono parcial: si el pago del banco no calza con facturas completas, propone aplicarlo como abono a la factura más antigua (queda en amarillo para revisión).
- Propuestas según el tipo de RUT del auxiliar: proveedor, cliente, trabajador u honorarios (por ejemplo, pago a proveedor sin documento sugiere anticipo a proveedores; a trabajador, anticipo o préstamo).

---

## 1.4.1 — 6 de noviembre de 2026
**Módulo Personal: parámetros legales y cálculos corregidos.**
- Tasa SIS según Previred de cada mes (1,54 % ene-mar, 1,62 % abr-jun, 2,00 % jul; desde agosto integrada en la cotización del empleador, Ley 21.735).
- UF del último día del mes (Previred) para los topes imponibles; tope de enero 89,9 UF.
- Sueldo mínimo $553.553 y asignación familiar nueva ($22.601 / $13.870 / $4.382) desde mayo 2026.
- Horas extras con la fórmula de la Dirección del Trabajo y jornada legal de 42 horas.
- Finiquito: indemnización por años de servicio solo con 1 año o más, tope de 90 UF con la UF real y base de cálculo según Art. 172.
- Centralización de sueldos: cuadra con todos los descuentos (APV, anticipos, préstamos, judiciales) y ya no usa cuentas al azar.
- Sin valores de UF/UTM inventados: si falta el dato oficial, el sistema lo avisa.

---

## 1.4.0 — 6 de noviembre de 2026

### Nuevo
- KPIs de clientes para Startup: clientes activos, churn, ingreso por cliente, CAC, LTV, LTV/CAC y recuperación del CAC, a partir de "Datos del negocio" que ingresa el contador por año.
- Catálogo de módulos único: "Todas las Aplicaciones", "+ Nueva Pestaña" y Alt+T abren Inicio. Se elimina el catálogo oscuro duplicado.

### Mejora
- Las pestañas de Indicadores Financieros usan la misma clasificación que los informes.

---

## 1.3.0 — 5 de noviembre de 2026

### Nuevo
- **Mis KPIs** (Indicadores Financieros): 34 indicadores (liquidez, endeudamiento, rentabilidad, márgenes, actividad, crecimiento y caja para Startup), calculados con la misma clasificación y comprobantes que los informes.
- Paquetes listos por industria (Básico, Comercio, Servicios, Construcción, Restaurantes) y Startup. El contador puede elegir paquete o marcar los KPIs que ve cada empresa.

### Corrección
- El Estado de Resultados ahora excluye los comprobantes descuadrados, igual que el Balance de 8 columnas y el Balance IFRS, para que el resultado coincida en los tres informes.
- Balance IFRS: préstamos bancarios y tarjetas de crédito se clasifican como pasivos financieros, y AFP, salud, remuneraciones y similares como provisiones laborales, según el nombre de la cuenta.

---

## 1.2.1 — 4 de noviembre de 2026

### Corrección
- "Contabilizar y Conciliar en 1 Clic" (Libro Banco) fallaba con "addDoc() called with invalid data. Unsupported field value: undefined" cuando el RUT auxiliar o la referencia iban vacíos. Ahora los campos vacíos se omiten al guardar (en toda la aplicación).
- El número de comprobante de ese flujo usa el correlativo atómico, para evitar repetidos si se crean comprobantes en paralelo.

## 1.2.0 — 4 de noviembre de 2026

### Plantillas de plan de cuentas alineadas a la convención
- Plan de cuentas por defecto, plan inicial del tablero, plantilla Excel y empresa demo: 1 Activo · 2 Pasivo · 23 Patrimonio · 3 Ingresos · 4 Gastos (antes: 3 Patrimonio, 4 Ingresos, 5 Gastos / 5 Ingresos).
- Búsquedas de cuentas de ventas, costo y gastos (centralizaciones, DTE, productos, operativa comercial) usan los códigos nuevos y siguen reconociendo los antiguos.
- Al crear una cuenta, el Tipo se asigna por la convención (23 = Patrimonio, 3 = Ingreso, 4 = Gasto).
- El Auditor de Estados Financieros usa el mismo motor de clasificación que el Balance IFRS y el Estado de Resultados.
- Las empresas ya creadas no se renumeran.

### Corrección: la naturaleza de la cuenta la define el código
- Balance IFRS y Estado de Resultados clasifican por el primer dígito del código: 1 Activo · 2 Pasivo (23 = Patrimonio) · 3 Ingresos · 4 Gastos. El "Tipo" de la cuenta solo se usa si el código no entra en la convención (p. ej. planes antiguos con 5).
- Corregido: cuentas de Patrimonio (23…) con Tipo "Pasivo" aparecían dentro de los pasivos.
- El rubro dentro de cada sección se toma del nombre de la cuenta (o del rubro escrito en ella), no de subcódigos, porque cada plan de cuentas es distinto.
- El resultado del ejercicio (Ingresos − Gastos) se mantiene dentro del Patrimonio.

### Estado de Resultados: vista NIIF 18
- Selector "NIC 1 (vigente) / NIIF 18 (desde 2027)" en el Estado de Resultados.
- Vista NIIF 18: categorías Operación, Inversión y Financiamiento, con los subtotales "Resultado Operacional" y "Resultado antes de Financiamiento e Impuestos", impuestos y resultado del ejercicio, más nota de gastos por naturaleza (personal, depreciación).
- Es una vista preliminar: el cierre 2025 se presenta en NIC 1. La matriz de 12 meses, la exportación y la impresión siguen en NIC 1.

### Estados financieros IFRS: una sola clasificación
- Nuevo motor único de clasificación para Balance IFRS y Estado de Resultados (antes cada uno tenía reglas propias y se contradecían: el código 5 era gasto en uno e ingreso en el otro).
- Naturaleza de la cuenta: primero su Tipo; luego la convención 1 Activo · 2 Pasivo · 23 Patrimonio · 3 Ingresos · 4 Gastos.
- Rubros con denominaciones NIC 1 / CMF (Efectivo, Deudores comerciales, Activos por impuestos corrientes, Otros pasivos financieros, Ganancias acumuladas, Costo de ventas, Costos financieros, etc.).
- Corregido: "Gastos bancarios e intereses" de la plantilla caía como depreciación; ahora va a Costos financieros. IVA y retenciones, remuneraciones y préstamos se ordenan por nombre y estructura.
- Nuevo panel "Revisión de clasificación" en el Balance IFRS con las cuentas que no calzan con la convención o no tienen Tipo.

### Cartola: sin duplicados al cargar provisoria + definitiva
- Al importar una cartola, un movimiento se considera ya existente si coincide fecha y monto (la glosa puede cambiar entre provisoria y definitiva), o mismo N° de documento y monto, o mismo monto y glosa con pocos días de diferencia.
- Movimientos legítimos idénticos dentro de una misma cartola ya no se descartan.
- Nuevo botón "Limpiar duplicados" para eliminar movimientos pendientes repetidos ya cargados (no toca los conciliados).

### Períodos ordenados
- Al entrar a una empresa, todas las pantallas (Centralizaciones, Conciliación, F29, etc.) parten en el último período abierto, nunca uno futuro.
- Ya no se recuerda un período antiguo de otra sesión/empresa: el usuario puede ir a uno anterior, pero al volver a entrar parte en el último abierto.
- Los selectores de mes no permiten elegir períodos futuros.

### Indicadores económicos oficiales (sin valores inventados)
- El servidor copia UF, Dólar, Euro y UTM desde la fuente oficial (mindicador.cl, que replica Banco Central y SII) y los publica en un solo lugar (`globalExchangeRates`). Todas las pantallas leen de ahí.
- La UF se toma completa según se publica (un mes por adelantado junto con el IPC); no se proyecta ni se estima.
- Eliminados todos los valores de respaldo inventados (UF 38.250, dólar 955, yen, UTM proyectada) y el generador de valores aleatorios por empresa.
- Si un dato no existe, se muestra "No disponible" en lugar de un número falso.

## 1.1.0 — 3 de noviembre de 2026

### Conciliación bancaria
- **Bandeja de pendientes:** lista todos los movimientos de la cartola sin contabilizar, con semáforo (seguro, por revisar, sin propuesta), cuenta propuesta y motivo. Permite aprobar en lote los movimientos seguros; cada uno genera su comprobante y queda conciliado.
- **Filtros por columna** en la bandeja (fecha, glosa, cargo/abono y monto, propuesta) y selección de todos los seguros visibles.
- **Propuesta automática de cuenta** en "+ Asiento": por reglas aprendidas, historial de la empresa y conceptos típicos (comisiones, IVA de comisión, Previred, F29, Transbank, servicios básicos), siempre dentro del plan de cuentas de la empresa. No inventa cuentas.
- **Aprendizaje:** al corregir una cuenta, el sistema ofrece recordar la regla para movimientos parecidos.
- **Calce con facturas pendientes:** por monto exacto o suma exacta de varias facturas del mismo proveedor o cliente. Usa el RUT que el Santander escribe en la glosa (validado con módulo 11) y el nombre como respaldo.
- **Clasificación por RUT:** para trabajadores y otras personas con saldos (remuneraciones por pagar, anticipos, préstamos, fondos por rendir), propone la cuenta según sus saldos pendientes y movimientos anteriores, y cierra el saldo del mismo folio.
- **Ajuste por redondeo:** diferencias de hasta $2 entre el banco y las facturas van a una cuenta de ajuste (se crea con confirmación si no existe).
- **Opciones de conciliación por empresa:** diferencia de redondeo configurable (0 a $50; antes fija en $2) y aprobación automática de los movimientos seguros al importar la cartola, con registro de auditoría de cada lote.
- **Cierre de cartola:** una cartola cuadrada se puede cerrar para que nadie la cambie por error; para reabrirla hay que indicar un motivo, que queda registrado.
- **Notas de crédito** al aplicar un pago: aparecen con saldo negativo, rebajan lo que se paga o cobra y quedan en el comprobante del lado contrario de las facturas. El calce automático las incluye (facturas menos notas de crédito = monto del banco).
- **Vencimiento** tomado desde el documento; botón **Desmarcar todo** en facturas pendientes.
- **Importador de cartola:** ignora filas que no son movimientos (por ejemplo, el "saldo final") y se corrigió el error al abrir la importación inteligente.

### Seguridad y consistencia
- **Numeración de comprobantes atómica** en los flujos del banco: evita números repetidos si dos personas graban a la vez.
- Los endpoints de IA quedan preparados en el servidor de producción (se activan al configurar la clave).
- Se retiró el botón de purga "Diagon" del panel de Super Admin.

### Navegación
- **Pantalla de inicio de la empresa:** ahora es el panel de accesos a los módulos (con buscador), en lugar del listado de comprobantes. Los comprobantes pasan a ser un módulo más.
- **Buscador de Comprobantes** (Finanzas): busca por N° de comprobante, N° de factura, proveedor o cliente (nombre o RUT), glosa, cuenta o monto, con filtros de tipo, estado y fechas; al hacer clic abre el comprobante.
- **Tecla ESC** cierra la ventana abierta.

### Interfaz
- Se retiraron 1.039 emojis, se reemplazaron los degradados por colores sólidos y se quitaron textos grandilocuentes e insignias técnicas.
- El nombre de la empresa aparece solo en la barra superior (se mantiene en los documentos imprimibles).
- Se corrigió la versión que se mostraba duplicada ("vv").

### Versionado
- Se adopta versionado semántico, este registro de cambios y etiquetas en GitHub.

---

## 1.0.0 — punto de partida

Punto de partida de la numeración. Contiene la revisión de seguridad y normativa, la migración a Vercel y el ingreso con permisos por usuario. Se usó como prueba de conexión entre el desarrollo y producción.
