# Registro de cambios — Gest_OK / Pulso Contable

Formato de versiones: **MAYOR.MENOR.PARCHE** (versionado semántico).
- **PARCHE** (1.1.1): corrige un error, sin cambiar lo que el usuario ve ni hace.
- **MENOR** (1.2.0): agrega una función nueva sin romper lo anterior.
- **MAYOR** (2.0.0): cambio grande que obliga a trabajar distinto o altera los datos de forma incompatible.

Cada versión que pasa a producción queda marcada en GitHub (etiqueta `vX.Y.Z`). En pantalla, la versión aparece con el código del despliegue (ejemplo: `v1.1.0 · 578a157`).

---

## 1.25.0 — 2026-11-23
- Finiquito por obra o faena: suma el sueldo líquido de la liquidación del mes de término más el feriado proporcional (y la indemnización del Art. 163 inc. 3° cuando corresponde). Sin aviso previo. Si falta la liquidación del mes, lo avisa.
- El sistema redacta el finiquito completo en PDF (cláusulas de término, liquidación, cotizaciones, declaración del trabajador, ratificación ante ministro de fe), individual o masivo por obra (un PDF con todos los seleccionados).

## 1.24.2 — 2026-11-23
- Cierre de obra: al poner la fecha de término en Proyectos / Obras, se cierran automáticamente los contratos por obra o faena de esa obra (Art. 159 N° 5), previa confirmación con la lista de trabajadores. Si se corrige la fecha, se corrigen los contratos; si se borra, se reabren. No toca contratos terminados por otro motivo.
- Las liquidaciones del mes del cierre siguen editables (bonos, ausencias, licencias, vacaciones); solo cambian las fechas del contrato.
- Finiquito masivo: al elegir una obra cerrada, muestra también a los trabajadores que el cierre ya terminó.
## [1.24.1] - Obras solo para contratos por obra o faena
- La obra se asigna únicamente a contratos "Por obra o faena"; en los demás tipos aparece "No aplica".
- El término masivo muestra solo trabajadores con contrato por obra o faena.

## [1.24.0] - Obras con fechas, trabajadores por obra y liquidación hasta el término
- Proyectos / Obras tiene fecha de inicio y de término.
- Cada contrato del trabajador se asocia a una obra del maestro (o texto libre si la empresa no tiene obras).
- Término masivo: se filtra por obra y la fecha de término se toma de la obra.
- La liquidación de sueldo cuenta los días hasta la fecha de término del contrato (antes solo consideraba la fecha de ingreso). Terminar el último día del mes = mes completo.
- Contratos de 30 días o menos: el finiquito no calcula feriado proporcional (Art. 44 inc. 4°) y lo avisa.

## [1.23.0] - Historial de contratos del trabajador
- La ficha del trabajador tiene una sección "Contratos": cada contrato con su tipo, obra o faena, fecha de inicio, fecha de término y causal. "Registrar término" cierra el contrato vigente; "Nuevo contrato" registra una recontratación (por obra, plazo fijo o indefinido).
- Al recontratar, la antigüedad y el finiquito se calculan solo sobre el contrato que termina: no se acumulan contratos anteriores ya finiquitados. El cambio de tipo de contrato rige desde el inicio del nuevo contrato para las liquidaciones.
- El término masivo de obra o faena puede registrarse directamente en las fichas (con confirmación), y la búsqueda incluye el nombre de la obra.

## [1.22.0] - Finiquito por término de obra o faena
- La causal Art. 159 N° 5 ahora calcula la indemnización del Art. 163 inc. 3° (Ley 21.122): días por mes trabajado y fracción superior a 15 días, según la fecha del contrato (1 / 1,5 / 2 / 2,5 días), con tope de 90 UF. Al elegir un trabajador por obra o faena se propone esa causal.
- Nuevo modo "Término de obra o faena (varios)": marca varios trabajadores, una fecha de término, y obtén indemnización, feriado proporcional y total de cada uno; exporta a Excel/CSV y abre el finiquito PDF individual.
- El cálculo de finiquitos pasa a un módulo con pruebas automáticas.

## [1.21.3] - Sincronización del RCV más rápida
- Ventas, compras y honorarios se consultan al SII en paralelo (antes, una tras otra) y la función tiene hasta 5 minutos. Se registra el tiempo de cada sincronización para diagnosticar.

## [1.21.2] - API general sin depender del Super Admin
- La API de SimpleAPI guardada en cualquier empresa se adopta como API general aunque sincronice un administrador de estudio.

## [1.21.1] - Una sola clave de SimpleAPI para todo el sistema
- La clave de SimpleAPI es general: si una empresa la tiene guardada y el Super Admin sincroniza, queda como clave general cifrada y sirve para todas las empresas de todos los estudios. Antes, cada empresa necesitaba la suya.

## [1.21.0] - Claves del SII cifradas
- Las claves del SII (representante y empresa), el certificado digital y su clave, y la clave de SimpleAPI ya no se guardan en el documento de la empresa: se envían al servidor y se guardan cifradas (AES-256-GCM) en una colección que el navegador no puede leer. En la empresa solo queda la marca "clave guardada".
- La sincronización del RCV ocurre completa en el servidor: el navegador solo indica empresa y período; ya no recibe ni envía claves ni certificado.
- Las credenciales antiguas sin cifrar se cifran solas al sincronizar el RCV o al guardar la empresa, y el Super Admin puede protegerlas todas de una vez (Monitor del sistema > Datos > "Proteger claves del SII"), con revisión previa.
- La clave general de SimpleAPI que estaba solo en el navegador del Super Admin se guarda cifrada en el servidor la primera vez que él sincroniza; desde ahí sirve a todos los estudios.

## [1.20.0] - Cuadratura de DJ 1887 y 1879
- Nueva pestaña "Cuadratura 1887 / 1879" en Declaraciones Juradas: compara mes a mes el impuesto único (liquidaciones vs F29 código 48 vs contabilidad) y la retención de honorarios (boletas del RCV vs F29 código 151 vs contabilidad). Marca los meses con diferencia o sin F29.
- El año comercial de Declaraciones Juradas parte en el año que corresponde a la próxima Operación Renta.

## [1.19.1] - Renta anual: PPM desde la contabilidad
- Los PPM pagados se leen de la cuenta contable donde se registran (sugerida por nombre "PPM" o "Pagos provisionales"; se puede cambiar o volver a ingreso manual). Toma los movimientos del 1-1 al 31-12, sin apertura ni anulados.

## [1.19.0] - Renta anual: hoja de trabajo de RLI y capital propio
- Nuevo módulo en Impuestos: parte del resultado contable del año, permite agregados y deducciones (con sugerencias por régimen), calcula RLI o base imponible, Primera Categoría (27 % general, 12,5 % Pro Pyme, editable), saldo referencial contra PPM y créditos, y capital propio tributario (activos − pasivos en 14 A; simplificado en Pro Pyme). Se guarda por empresa y año tributario y se exporta a CSV. Es referencial: no reemplaza al F22.

## [1.18.6] - La validación de parametrización avisa, no prohíbe
- Si una cuenta de la parametrización parece no corresponder (p. ej. IVA crédito en una cuenta de gasto), el sistema muestra un aviso y pregunta "¿Guardar de todos modos?". Si confirmas, se guarda tal cual. Antes lo impedía.

## [1.18.5] - El "Tipo" de la cuenta sigue la convención por código
- El Balance de 8 columnas muestra el Tipo según el código de la cuenta (Ventas 3xxx = Ingreso), no un valor antiguo guardado ("Patrimonio").
- Al guardar el plan de cuentas, el tipo de las cuentas 1-4 se corrige solo según el código.

## [1.18.4] - Parametrización contable valida la naturaleza de las cuentas
- Al guardar la parametrización (Parám. RCV y Matriz Maestra), el sistema rechaza errores claros: IVA crédito o Clientes que no sean de Activo, IVA débito de otra naturaleza, Ingresos por ventas que no sean de Ingresos, Gasto por defecto que no sea Gasto o Costo. Proveedores acepta Pasivo o Caja/Banco (compras al contado).

## [1.18.3] - Centralización del RCV ya no adivina cuentas
- Si falta una cuenta (por ejemplo Clientes) al centralizar un documento del RCV, el sistema antes elegía en silencio "cualquier cuenta del mismo tipo" o la primera del plan (p. ej. Caja). Ahora se detiene y avisa qué cuenta falta; no genera el comprobante.
- La búsqueda por palabra clave solo considera cuentas de la naturaleza correcta (ya no confunde "Costo de ventas" con Ventas).

## [1.18.2] - Balance de 8 columnas clasifica por código de cuenta
- El Balance Tributario de 8 columnas usaba el "tipo" interno de la cuenta, y una cuenta 3xxx (Ventas) con tipo Patrimonio caía en Pasivo, dando una pérdida falsa. Ahora usa la misma convención que los demás informes (1 Activo, 2 Pasivo, 23 Patrimonio, 3 Ingresos, 4 Gastos).

## [1.18.1] - Sin comprobantes duplicados al contabilizar el RCV
- Al contabilizar o centralizar un documento del RCV, el sistema ahora revisa en la base de datos que ese documento no tenga ya un comprobante (doble clic, pantalla desactualizada u otra pestaña). Si ya lo tiene, no crea otro.

## [1.18.0] - Agente de reclasificación (piloto, solo Pruebas)
- Nuevo agente: escribes qué reclasificar ("gastos de combustible de septiembre y octubre a movilización"); la IA solo interpreta la instrucción, y el sistema selecciona los movimientos, calcula los montos y muestra una vista previa. Nada se crea hasta que apruebas.
- Al aprobar crea un comprobante de reclasificación por mes (Debe y Haber invertidos entre las dos cuentas), con cuadre obligatorio, contador único y registro de auditoría. Los comprobantes originales no se tocan y una misma reclasificación no se aplica dos veces.
- Acceso: fase piloto. Solo Super Admin y campos.ramon@gmail.com (y este último solo en estudios a los que el Super Admin asignó el agente, en la matriz de módulos). Está listo el esquema para abrirlo después: el administrador del estudio podrá asignarlo a sus analistas y contadores (casilla "Puede usar el Agente de IA" en la ficha del usuario).
- El servidor vuelve a comprobar el acceso; no basta con ocultar el botón.

## [1.17.4] - Menos píldoras
- Las píldoras neutras (contadores, etiquetas informativas) pasan a texto simple en 16 lugares. Se mantienen las que indican estado (éxito, alerta, error).

## [1.17.3] - Login más limpio
- Se quitan la pastilla "ERP" y la versión en recuadro; textos más cortos ("Iniciar sesión", "Conexión cifrada"); autoría al pie.

## [1.17.2] - Pantallas más limpias
- Etiquetas pequeñas ya no van en MAYÚSCULAS con espaciado (287 lugares en 64 archivos); se mantienen en las cabeceras de tabla.
- Las frases explicativas largas bajo los títulos (21 pantallas) pasaron a un cuadro de ayuda: aparecen al dejar el mouse sobre el título. Los avisos de módulo restringido/deshabilitado se dejan visibles.
- Sin cambios en datos ni en contabilidad.

## [1.17.1] - Página de bienvenida
- Pie de página con la autoría: pensado y desarrollado por Ramón Campos, con el apoyo de Claude, de Anthropic.

## [1.17.0] - Preparado para facturadores externos
- Registro de Compras y Ventas: nuevo botón "Cargar XML de facturador" para cargar los DTE (XML) emitidos o recibidos desde cualquier facturador autorizado (Bsale, Nubox, Haulmer, SimpleFactura, portal del SII). Decide solo si es Venta o Compra según el RUT de la empresa, omite lo que no cuadra o no pertenece y avisa por qué. No duplica documentos ya cargados.
- Cada documento del RCV guarda su origen (digitado, RCV del SII, facturador externo, demostración) y el nombre del facturador.
- "Emisión DTE" muestra aviso de MODO DEMOSTRACIÓN: es una simulación sin validez ante el SII.

## [1.16.6] - Orden técnico: más módulos con numeración única
- Cobranza, Nóminas de pago, Formulario 29 y la contabilización de documentos del RCV ahora numeran con el contador único (antes "mayor número + 1", que podía repetirse si dos personas guardaban a la vez).
- Cobranza, Nóminas y F29 rechazan un comprobante descuadrado con un mensaje claro.
- Se deja sin tocar lo más delicado (Conciliación, DTE, importaciones masivas) para hacerlo de a uno con pruebas.

## [1.16.5] - Etapa 2 del orden técnico: capa contable única (primera parte)
- Nuevo `src/utils/capaContable.ts`: un solo lugar que valida que el comprobante cuadre, calcula período y totales, revisa período cerrado y pide el número al contador único.
- Ya la usan: Compras/Ventas (recepciones, entregas y reversos), Kardex, Activo fijo y Rendición de gastos.
- Efecto visible: un comprobante descuadrado ahora se rechaza con un mensaje claro en esos módulos (antes se guardaba).
- Pendiente (siguientes entregas): migrar RCV, Conciliación, DTE, Nóminas, F29, Cobranza, Libro Banco, Importaciones.

## [1.16.4] - Etapa 3 del orden técnico: numeración única
- Kardex, Activo fijo, Rendición de gastos y Gestión Comercial ya no inventan el número del comprobante al azar: usan el contador único de la empresa (no repite ni retrocede respecto de los existentes).
- Ajustes de Kardex y operaciones comerciales también pasan por ese contador.
- Nueva prueba automática que impide volver a numerar al azar.

## [1.16.3] - Etapa 1 del orden técnico: red de seguridad
- Nuevo `npm test`: pruebas automáticas de asientos de compras/ventas, aprobación y compensación parcial.
- Nuevo `npm run typecheck`: revisa tipos en cada despliegue y falla solo si aparecen errores NUEVOS (los 50 antiguos quedan en `scripts/tsc-baseline.txt` y se irán eliminando).
- Sin cambios visibles para el usuario ni en la contabilidad.

## 1.16.2 — 19 de noviembre de 2026 — Aprobación de Compras y Ventas: sin aprobación por defecto, 1 o 2 niveles a elección [solo Pruebas]

- Las órdenes de compra y de venta parten sin aprobación: al emitirlas quedan aprobadas.
- En Configuración, cada empresa elige: Sin aprobación, 1 nivel o 2 niveles, y los correos de los aprobadores de cada nivel (se exige al menos uno por nivel elegido). Un administrador del estudio siempre puede aprobar.
- Se eliminó el monto mínimo para el nivel 2: ahora el nivel lo define la empresa.
- Las configuraciones ya guardadas siguen funcionando.

---

## 1.16.1 — 19 de noviembre de 2026 — Compras y Ventas son módulos adicionales por plan [solo Pruebas]

- Compras y Ventas ahora se contratan aparte: aparecen en la matriz de módulos del estudio (Super Administrador) y ningún plan los incluye por defecto.
- La casilla de la ficha de la empresa solo se puede marcar si el estudio tiene contratado el módulo. Si el estudio deja de tenerlo, el módulo se oculta aunque la empresa lo tuviera marcado.
- Ajuste: en órdenes con líneas que "se contabilizan solo con la factura", la factura sugiere aplicar contra Facturas por Recibir/Emitir solo lo pendiente en la cuenta puente.

---

## 1.16.0 — 17 de noviembre de 2026 — Módulo opcional de Ventas (Orden de Venta → Entrega → Factura) [solo Pruebas]

- Se activa por empresa: ficha de la empresa › casilla "Módulo de Ventas". Sin la casilla no aparece nada.
- Es un módulo de ventas, no de facturación: el sistema no emite facturas electrónicas. La factura se emite por fuera (o con el facturador que se contrate después) y se asocia a la orden desde el RCV de ventas.
- Orden de Venta con productos o servicios, cliente, condiciones de pago y entrega, neto/exento/IVA/total, aprobación opcional en dos niveles e impresión en formato estándar (indica que no es documento tributario).
- Entregas totales o parciales: si el producto tiene marcada "Devengar ingreso al entregar", la entrega genera el comprobante (Debe Facturas por Emitir, Haber ingreso). La cuenta Facturas por Emitir la elige el contador del plan de cuentas.
- Al contabilizar en RCV la factura de venta asociada, el ingreso ya devengado se netea contra Facturas por Emitir con la referencia OV-N; si el monto facturado difiere de lo entregado, la diferencia queda abierta en esa cuenta.
- Anular una entrega genera comprobante de reverso.
- Pendiente (anotado): el costo de venta y la salida de inventario al entregar, y la nota de crédito referenciada a la O/V.

---

## 1.15.2 — 17 de noviembre de 2026 — El sistema ya no crea ni borra datos por su cuenta (solo Pruebas)

- Bodega Central: ya no se guarda sola en la base; se muestra una bodega virtual hasta que el usuario cree o edite una.
- Cuadernos: ya no se crea el "Cuaderno Cierre Mensual" de ejemplo (traía tareas marcadas como hechas).
- RCV: al abrir una empresa ya no se borran ni modifican documentos "duplicados" en la base de datos; solo se ocultan en pantalla. Borrar duplicados queda solo en el botón Depurar duplicados.
- Super Administradores: ya no se crea un usuario de ejemplo (con clave de prueba) ni se borran usuarios al abrir la pantalla.
- Centro de entrenamiento Junior: ya no se precarga conocimiento por defecto.

---

## 1.15.1 — 17 de noviembre de 2026 — Se acabaron los productos de ejemplo automáticos

- Corregido: cuando una empresa no tenía productos, el sistema creaba solos dos de ejemplo ("Asesoría y Consultoría Contable Mensual" y "Resma Papel Carta") y los guardaba en la base de datos. Por eso aparecían productos que nadie había creado (caso Mundo Call). Ya no se crean.
- El catálogo de Productos / Servicios parte vacío y solo muestra lo que el usuario crea. Los dos ejemplos ya guardados en empresas existentes no se tocan: se eliminan desde el Catálogo y ya no vuelven.

---

## 1.15.0 — 17 de noviembre de 2026 — Compensar desde el detalle de cuenta

- En el detalle de cuenta (Balance de 8 columnas › Documentos abiertos) ahora se puede compensar sin salir de la pantalla: se abre el documento, se marcan los cargos y abonos y se pulsa "Compensar". Hay casillas por partida, por documento y por auxiliar.
- Si cargos y abonos cuadran en $0, se compensan completos. Si no cuadran, se ofrece el pareo parcial (hasta el monto menor; el resto queda abierto), igual que en Análisis de Cuentas.
- Reglas: solo partidas de un mismo auxiliar a la vez; una partida ya compensada no se vuelve a usar mientras no se descompense; no disponible para perfiles Analista ni Observador. Queda registrado en la auditoría y se ve igual en Análisis de Cuentas y Auxiliares.

---

## 1.14.0 — 17 de noviembre de 2026 — Módulo opcional de Compras (Orden de Compra → Recepción → Factura)

- Se activa por empresa en el panel del estudio: ficha de la empresa › casilla "Módulo de Compras". Si no está marcada, no aparece nada y la empresa trabaja las compras como siempre.
- Órdenes de Compra con productos o servicios, numeración correlativa, condiciones de pago y entrega, neto/exento/IVA/total. Se imprimen o guardan como PDF en formato estándar (datos de la empresa, proveedor, líneas, totales, observaciones, firmas).
- Aprobación en dos niveles (correos de aprobadores y monto desde el cual se exige el nivel 2, ambos configurables) o sin aprobación si se desmarca.
- Recepciones totales o parciales. Cada producto/servicio tiene la casilla "Contabilizar al recibir": si está marcada, la recepción genera el comprobante (Debe gasto o existencia, Haber Facturas por Recibir, por el neto). La cuenta Facturas por Recibir la elige el contador entre las del plan de cuentas; el sistema no crea ninguna.
- La factura del proveedor se asocia a la O/C desde la misma pantalla y, al contabilizarla en RCV, netea Facturas por Recibir con la misma referencia (OC-N). Si el monto facturado difiere de lo recibido, la diferencia queda abierta en esa cuenta y se muestra como saldo abierto.
- Anular una recepción genera un comprobante de reverso; no se borra nada.

---

## 1.13.1 — 17 de noviembre de 2026 — Resumen de ventas por mes para enviar por correo

- Nuevo informe "Resumen de ventas por mes": nombre y RUT de la empresa, y una tabla mes a mes con el monto neto del año elegido contra el año anterior, más el total. Se ve en Indicadores Financieros › KPIs (contador) y en el Resumen del cliente observador.
- Botón "Copiar para correo": copia la tabla con su formato (colores y filas) para pegarla directo en un mail.
- Fuente: Registro de Ventas del SII. Monto neto = neto afecto + exento; las notas de crédito restan.

---

## 1.13.0 — 16 de noviembre de 2026 — Auxiliares: clasificación "Empleados" por cuenta

- Auxiliares: el botón "Personal / Trabajadores" pasa a llamarse "Empleados" y agrupa todas las cuentas clasificadas como empleado (anticipos, préstamos, sueldos, finiquitos…).
- Nuevo botón "Clasificar cuentas": el contador elige para cada cuenta de auxiliares si es Cliente, Proveedor, Empleado, Deudor vario o Acreedor vario (o "Automático"). Se guarda en el Plan de Cuentas (campo nuevo y opcional `auxiliaryClass`; no cambia ningún dato existente).
- Mejor deducción automática (cuando una cuenta está en "Automático"): ahora se guía primero por el nombre y después por el código. Antes todo lo que empezaba con 1104 se trataba como personal, aunque fuera "Clientes por ventas". Honorarios ya no se consideran empleados. "Anticipo a proveedores" cuenta como deudor y "Anticipo de clientes" como acreedor.
- Aviso en la ventana: lista las cuentas que parecen de personal pero no piden auxiliar (RUT), y por eso no aparecen en Auxiliares.

---

## 1.12.5 — 15 de noviembre de 2026 — Una partida compensada no se compensa dos veces

- Pizarra Dinámica: si entre las partidas elegidas hay una que ya está compensada, el sistema no permite compensar y avisa que primero hay que descompensar la anterior. (Compensación de Cuentas ya tenía esta protección.)

---

## 1.12.4 — 15 de noviembre de 2026 — Auxiliares respeta la Compensación de Cuentas

- Análisis de Auxiliares: las partidas ya compensadas en "Compensación de Cuentas" se consideran cerradas y se netean entre sí, aunque tengan distinto número de documento, tipo o vencimiento. Un documento compensado aparece como "Compensado ($0)" y, con el filtro "Solo con saldo pendiente", se oculta.
- Si una partida se compensó solo en parte, el documento muestra únicamente lo que sigue abierto.
- Los totales de cargos, abonos y saldo por RUT y por cuenta no cambian: solo cambia qué documentos se consideran por cerrar.

---

## 1.12.3 — 15 de noviembre de 2026 — RUT con puntos en todas las pantallas

- Todas las pantallas que muestran un RUT (auxiliares, libros, informes, DTE, remuneraciones, certificados, cobranza, etc.) ahora lo muestran siempre como 11.111.111-1, aunque el registro antiguo esté guardado sin puntos.
- Los datos nuevos ya se guardan con esa regla; los antiguos se corrigen en la base con Super Administrador › Datos.

---

## 1.12.2 — 15 de noviembre de 2026 — RUT con puntos también en Auxiliares

- Análisis de Auxiliares: los RUT siempre se muestran como 11.111.111-1, aunque el registro antiguo esté guardado sin puntos (la corrección definitiva de la base de datos se hace en Super Administrador › Datos).

---

## 1.12.1 — 15 de noviembre de 2026 — Auxiliares: sin repetir la cuenta

- Análisis por RUT: cuando el RUT tiene una sola cuenta (por ejemplo al filtrar por una cuenta), ya no se muestra de nuevo la cuenta: al abrir el RUT salen directo sus documentos, con los pendientes primero.

---

## 1.12.0 — 15 de noviembre de 2026 — Todos los RUT en formato 11.111.111-1 (solo en Pruebas)

- Regla única: todo RUT se guarda como 11.111.111-1, sin importar si se digitó 111111111, 11111111-1 o 11.111.111-1. Se aplica en una sola capa por la que pasan todas las escrituras a la base de datos (formularios, importación del SII, cargas masivas, comprobantes, auxiliares, empresas, trabajadores…).
- Campos cubiertos: RUT de empresa, estudio, auxiliares, representante legal, emisor/receptor de documentos, contraparte, trabajadores y RUT en las líneas de comprobantes.
- Valores que no parecen un RUT (texto, "SIN RUT", largos imposibles) no se tocan.
- Nueva herramienta (Super Administrador › Datos): revisa y corrige los registros antiguos de TODOS los estudios y empresas. Primero "Revisar" (no cambia nada), luego "Aplicar". Cada cambio queda respaldado y se puede devolver con un botón.

---

## 1.11.6 — 15 de noviembre de 2026 — Auxiliares más fáciles de leer

- Análisis de Auxiliares: al abrir, se ven las cuentas y cada RUT cerrado, con su saldo; el detalle de documentos se abre solo al pulsar la fila (antes todo salía desplegado y era muy largo).
- Textos en lenguaje simple: "Nos deben" / "Debemos" según la cuenta, "Cargos" y "Abonos" en vez de Débito/Crédito, "Falta por cerrar" por documento y "N doc. por cerrar" por RUT.
- Dentro de cada RUT, los documentos pendientes aparecen primero.
- Nueva franja "Cómo leer esta pantalla" con la explicación en tres líneas.

---

## 1.11.5 — 15 de noviembre de 2026 — Asignar empresas a observadores

- La ficha de la empresa (pestaña Personal Asignado) ahora también lista a los observadores, marcados como "Observador", además de contadores y analistas. Antes no aparecían y no se les podía asignar empresa.
- La pestaña "Asignaciones" estaba vacía: ahora tiene un formulario para asignar una empresa a un usuario (contador, analista u observador) y una tabla con todas las asignaciones, con botón para quitarlas.
- Corregido un aviso de error falso que podía aparecer después de crear un usuario o una asignación correctamente.

---

## 1.11.4 — 15 de noviembre de 2026 — Ajustes al resumen del F29

- El PPM se muestra como cálculo: Base imponible, Tasa PPM y, separado por una línea, Impuesto determinado (PPM). Ya no parece una suma.
- El plazo de pago ya no repite la fecha: la explicación solo aparece cuando el día 20 se corre por fin de semana o feriado. El campo de fecha se ve completo.

---

## 1.11.3 — 15 de noviembre de 2026 — Resumen del F29 para el cliente, completo y correcto

- Compras primero, luego ventas y, al final, exportaciones solo si el cliente las tiene (lo mismo en el texto para WhatsApp y en la imagen).
- Las compras muestran su neto y su exento completos, también cuando el IVA no da derecho a crédito. Ese IVA aparece aparte, como "IVA sin crédito".
- El PPM ahora muestra cómo se calcula: ingresos del mes (ventas afectas + exentas + exportaciones), la tasa y el monto a pagar.
- El plazo de pago se calcula solo: día 20 del mes siguiente al período declarado. Si cae sábado, domingo o feriado, pasa al siguiente día hábil, y el informe explica por qué. Se puede escribir otra fecha a mano, y al cambiar de período se recalcula.

---

## 1.11.2 — 13 de noviembre de 2026 — Corrección urgente

- Corregido un error que mostraba "Ocurrió un error inesperado" al entrar al panel del estudio (un orden incorrecto en el código de la ventana de configuración de clientes).

---

## 1.11.1 — 13 de noviembre de 2026 — Clientes del estudio en grilla de cristal

- La pantalla principal del estudio ahora es una grilla de clientes, estilo planilla con los colores y letras del sistema y efecto vidrio: buscar por nombre, RUT, giro o contador; filtrar por estado, SII y contador; ordenar por columna.
- Cada cliente tiene su flecha "Contabilidad" (también con doble clic), y para el administrador, íconos de Configuración y Credenciales SII.
- Registrar y administrar empresas, contadores y asignaciones ahora está en una ventana, con el botón "Registrar y administrar".
- Los contadores y analistas ven la misma grilla, solo con sus empresas asignadas.
- El panel asistente del observador (1.10.0) queda visible solo en Pruebas; en producción está oculto hasta que se apruebe.

- Corrección: al configurar un cliente (engranaje o llave) la ventana muestra solo a ese cliente, sin las pestañas ni la lista de las demás empresas; al guardar o cancelar se cierra sola. Desactivar y eliminar quedaron dentro de la ficha de la empresa.

---

## 1.10.0 — 13 de noviembre de 2026 — Panel asistente para el observador

- Nuevo panel conversacional a la derecha en el portal del Cliente Observador (se puede cerrar y abrir).
- Informes con un botón, que preguntan lo que falta: Balance (pregunta la fecha), Estado de resultados (a una fecha), Cuenta corriente (pide nombre o RUT, sea cliente o proveedor), Por cobrar, Por pagar, Vencimientos e IVA del período.
- También entiende frases simples escritas, como "balance al 31-10-2026" o "saldo de Nubox".
- Todo se calcula con las cifras del sistema, sin inteligencia artificial: no tiene costo por consulta. Es solo de lectura.

---

## 1.9.11 — 13 de noviembre de 2026 — RCV: IVA crédito e IVA sin derecho ya no se duplican

- Una compra no puede mostrar IVA crédito y a la vez el mismo IVA como "sin derecho a crédito". Ahora, si ambos suman más que el total, lo que está sin derecho se descuenta del IVA crédito (en pantalla, en el comprobante, en el resumen y al importar o editar).
- El IVA sin derecho a crédito se carga al gasto, en la misma cuenta del valor neto (el exento sigue en su cuenta de exentos).
- Para corregir un comprobante ya generado con el error, basta abrir "Editar" en la factura y guardar: el comprobante se rehace cuadrado.

---

## 1.9.10 — 13 de noviembre de 2026 — RCV: la factura y su comprobante quedan amarrados

- Al editar una factura ya contabilizada (por ejemplo, marcar IVA sin derecho a crédito), el sistema te advierte, muestra el comprobante y, al guardar, lo actualiza para que factura y contabilidad queden iguales.
- Si el comprobante tiene partidas ya compensadas o conciliadas, no lo toca: te pide descalzarlas primero. Si el período está cerrado, también lo bloquea.
- En lugar de "Registrado", cada factura contabilizada muestra un botón "Comp. N° X" que abre su comprobante.
- Nueva columna "Exento" en la tabla del RCV: las facturas exentas ahora muestran su monto igual que en el SII.

---

## 1.9.9 — 13 de noviembre de 2026 — Compensación de partidas en todas las cuentas

- Nuevo botón "Compensar todas las cuentas" en Análisis de Cuentas: revisa a la vez todas las cuentas de activo y pasivo (proveedores, clientes, honorarios, anticipos, etc.) y propone compensar cada partida contra su pago, cobro o nota de crédito/débito, sin importar la cuenta del banco ni la fecha.
- Niveles de seguridad: "Exacto" (mismo RUT y documento dentro de la misma cuenta, y el debe y el haber suman igual) y "Revisar" (documento escrito distinto, partidas del mismo RUT entre cuentas distintas, o un cargo y un abono del mismo monto). Hay un botón "Solo exactos" y cada propuesta se puede aplicar por separado.
- Las cuentas con conciliación bancaria quedan fuera (se concilian contra la cartola), igual que los RUT y documentos genéricos (apertura, "otro").
- No cambia nada hasta que se aplica una propuesta; los pagos parciales todavía no se proponen.

## 1.9.8 — 11 de noviembre de 2026 — Liquidación en una sola hoja

- La liquidación de sueldo se ajusta de tamaño para imprimirse en una hoja. Si tiene demasiados ítems (más del límite legible), continúa en una segunda hoja.

## 1.9.7 — 11 de noviembre de 2026 — Impresión de la liquidación (refuerzo)

- La ventana de impresión ahora copia directamente el diseño ya cargado en pantalla, sin volver a descargarlo.

## 1.9.6 — 11 de noviembre de 2026 — Impresión de la liquidación

- Corrige la impresión de la liquidación de sueldo: salía sin diseño (textos pegados, sin cuadros ni colores). Ahora se imprime igual que se ve en pantalla.

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
