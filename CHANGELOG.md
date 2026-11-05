# Registro de cambios — Gest_OK / Pulso Contable

Formato de versiones: **MAYOR.MENOR.PARCHE** (versionado semántico).
- **PARCHE** (1.1.1): corrige un error, sin cambiar lo que el usuario ve ni hace.
- **MENOR** (1.2.0): agrega una función nueva sin romper lo anterior.
- **MAYOR** (2.0.0): cambio grande que obliga a trabajar distinto o altera los datos de forma incompatible.

Cada versión que pasa a producción queda marcada en GitHub (etiqueta `vX.Y.Z`). En pantalla, la versión aparece con el código del despliegue (ejemplo: `v1.1.0 · 578a157`).

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
