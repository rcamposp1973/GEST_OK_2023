# Registro de cambios — Gest_OK / Pulso Contable

Formato de versiones: **MAYOR.MENOR.PARCHE** (versionado semántico).
- **PARCHE** (1.1.1): corrige un error, sin cambiar lo que el usuario ve ni hace.
- **MENOR** (1.2.0): agrega una función nueva sin romper lo anterior.
- **MAYOR** (2.0.0): cambio grande que obliga a trabajar distinto o altera los datos de forma incompatible.

Cada versión que pasa a producción queda marcada en GitHub (etiqueta `vX.Y.Z`). En pantalla, la versión aparece con el código del despliegue (ejemplo: `v1.1.0 · 578a157`).

---

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
