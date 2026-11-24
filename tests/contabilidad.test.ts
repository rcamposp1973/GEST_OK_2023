import * as C from '../src/utils/compras';
import * as V from '../src/utils/ventas';
let fallos=0; const ok=(n:string,v:boolean)=>{console.log((v?'OK   ':'FALLA ')+n); if(!v) fallos++;};
const L=(id:string,q:number,p:number,cont:boolean,key:string):any=>({id,code:id,name:id,type:'PRODUCT',unit:'UN',quantity:q,unitPriceNeto:p,[key]:cont,receivedQty:0,deliveredQty:0,accountId:'CTA_'+id});
type Mov={cta:string,d:number,c:number};
const saldo=(m:Mov[],cta:string)=>m.filter(x=>x.cta===cta).reduce((s,x)=>s+x.d-x.c,0);

// ===== COMPRAS =====
{
  const lines=[L('A',10,1000,true,'contabilizaEnRecepcion'),L('B',2,5000,false,'contabilizaEnRecepcion')];
  const oc:any={id:'1',number:7,customerName:'x',supplierName:'Prov',lines,receipts:[],invoices:[]};
  const libro:Mov[]=[];
  const recibir=(qA:number)=>{
    const rl=[{lineId:'A',quantity:qA,amountNeto:C.montoRecepcionLinea(lines[0],qA)}];
    const a=C.armarAsientoRecepcion(oc,rl,l=>l.accountId,'FXR');
    ok(`compras: asiento recepción ${qA} cuadra`,a.lines.reduce((s,l)=>s+l.debit-l.credit,0)===0);
    a.lines.forEach(l=>libro.push({cta:l.accountId,d:l.debit,c:l.credit}));
    lines[0].receivedQty+=qA; oc.receipts.push({totalNeto:a.total});
  };
  recibir(4); recibir(6);
  ok('compras: con B pendiente sigue parcial',C.estadoSegunRecepcion(lines)==='RECIBIDA_PARCIAL');
  lines[1].receivedQty=2; ok('compras: B (sin contabilizar) recibido -> completa',C.estadoSegunRecepcion(lines)==='RECIBIDA'&&C.montoRecepcionLinea(lines[1],2)===0);
  ok('compras: FxR acreedor 10.000',saldo(libro,'FXR')===-10000);
  // factura única por todo (A 10.000 + B 10.000 = 20.000)
  const fxr=C.sugerirFxrNeto(oc,20000);
  ok('compras: factura mixta -> FxR sugerido = lo recibido (10.000)',fxr===10000);
  libro.push({cta:'FXR',d:fxr,c:0},{cta:'GASTO',d:20000-fxr,c:0}); oc.invoices.push({fxrNeto:fxr});
  ok('compras: FxR queda en 0',saldo(libro,'FXR')===0&&C.fxrAbierto(oc)===0);
  // factura que cubre solo A (10.500) en orden mixta: el excedente va a gasto, FxR cierra
  const oc2:any={...oc,invoices:[]};
  ok('compras: factura solo de lo recibido (10.500) -> FxR 10.000',C.sugerirFxrNeto(oc2,10500)===10000);
}
{ // orden sin líneas "con factura": toda la factura va contra FxR y la diferencia queda abierta
  const lines=[L('A',10,1000,true,'contabilizaEnRecepcion')];
  const oc:any={id:'2',number:8,supplierName:'P',lines,receipts:[{totalNeto:10000}],invoices:[]};
  const f=C.sugerirFxrNeto(oc,10500); oc.invoices.push({fxrNeto:f});
  ok('compras: diferencia (+500) queda abierta en FxR',f===10500&&C.fxrAbierto(oc)===-500);
}
// ===== VENTAS =====
{
  const lines=[L('A',10,2000,true,'contabilizaEnEntrega')];
  const oc:any={id:'3',number:3,customerName:'Cli',lines,deliveries:[],invoices:[]};
  const libro:Mov[]=[];
  const entregar=(q:number)=>{
    const rl=[{lineId:'A',quantity:q,amountNeto:V.montoEntregaLinea(lines[0],q)}];
    const a=V.armarAsientoEntrega(oc,rl,l=>l.accountId,'FXE');
    ok(`ventas: asiento entrega ${q} cuadra`,a.lines.reduce((s,l)=>s+l.debit-l.credit,0)===0);
    ok('ventas: Debe es Facturas por Emitir',a.lines[0].accountId==='FXE'&&a.lines[0].debit>0&&a.lines[0].conAuxiliar===true);
    a.lines.forEach(l=>libro.push({cta:l.accountId,d:l.debit,c:l.credit}));
    lines[0].deliveredQty+=q; oc.deliveries.push({totalNeto:a.total});
  };
  entregar(3); ok('ventas: parcial',V.estadoSegunEntrega(lines)==='ENTREGADA_PARCIAL'); entregar(7);
  ok('ventas: estado entregada',V.estadoSegunEntrega(lines)==='ENTREGADA');
  ok('ventas: ingreso devengado 20.000',saldo(libro,'CTA_A')===-20000&&saldo(libro,'FXE')===20000);
  const fxe=V.sugerirFxeNeto(oc,20000);
  libro.push({cta:'CLIENTES',d:23800,c:0},{cta:'FXE',d:0,c:fxe},{cta:'IVA',d:0,c:3800}); oc.invoices.push({fxeNeto:fxe});
  ok('ventas: factura netea FxE a 0 sin duplicar ingreso',saldo(libro,'FXE')===0&&saldo(libro,'CTA_A')===-20000&&V.fxeAbierto(oc)===0);
}
{ // aprobación con dos niveles
  const cfg:any={...V.CONFIG_VENTAS_INICIAL,approvalLevels:2,level1Emails:['a@x.cl'],level2Emails:['b@x.cl']};
  ok('ventas: por defecto sin aprobación',V.estadoAlEnviar(V.CONFIG_VENTAS_INICIAL)==='APROBADA'&&C.estadoAlEnviar(C.CONFIG_COMPRAS_INICIAL)==='APROBADA');
  ok('1 nivel: aprobar N1 -> aprobada',V.estadoTrasAprobar(1,100,{...cfg,approvalLevels:1})==='APROBADA'&&V.estadoAlEnviar({...cfg,approvalLevels:1})==='PENDIENTE_N1');
  ok('config antigua con aprobación y N2 = 2 niveles',V.nivelesAprobacion({approvalRequired:true,level1Emails:['a'],level2Emails:['b']} as any)===2);
  ok('ventas: envío -> N1',V.estadoAlEnviar(cfg)==='PENDIENTE_N1');
  ok('ventas: N1 -> N2 con monto 0',V.estadoTrasAprobar(1,100,cfg)==='PENDIENTE_N2');
  ok('ventas: N2 -> aprobada',V.estadoTrasAprobar(2,100,cfg)==='APROBADA');
  ok('ventas: aprobador equivocado no puede',!V.puedeAprobar('b@x.cl','PENDIENTE_N1',cfg)&&V.puedeAprobar('B@X.cl','PENDIENTE_N2',cfg));
}

// ===== PAREO PARCIAL (compensación) =====
import { repartoParcial, pareadoPorLinea } from '../src/utils/pareoParcial';
{
  const ln=(key:string,date:string,n:number,debit:number,credit:number)=>({key,voucherDate:date,voucherNumber:n,debit,credit});
  const r=repartoParcial([ln('d1','2026-01-01',1,1000,0)],[ln('c1','2026-02-01',2,0,300),ln('c2','2026-03-01',3,0,200)]);
  ok('pareo: parea hasta el menor lado (500)',r.monto===500&&r.restoDebitos===500&&r.restoCreditos===0);
  ok('pareo: el débito mayor queda parcial',r.debitos.length===1&&r.debitos[0].completa===false&&r.debitos[0].monto===500);
  const r2=repartoParcial([ln('d1','2026-01-01',1,100,0),ln('d2','2026-01-05',2,100,0)],[ln('c1','2026-02-01',3,0,150)]);
  ok('pareo: reparte de la más antigua a la más nueva',r2.debitos[0].key==='d1'&&r2.debitos[0].completa&&r2.debitos[1].monto===50);
  ok('pareo: sin contrapartida no parea',repartoParcial([ln('d1','2026-01-01',1,100,0)],[]).monto===0);
  const m=pareadoPorLinea([{matchedLines:[{voucherId:'V1',lineIndex:0,debit:100,credit:0} as any]},{status:'DESCALZADO',matchedLines:[{voucherId:'V1',lineIndex:0,debit:999,credit:0} as any]}]);
  ok('pareo: ignora pareos descalzados',m.get('V1_0')?.debit===100);
}
// ===== NUMERACIÓN: nadie inventa números de comprobante al azar =====
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
{
  const archivos:string[]=[]; const rec=(d:string)=>readdirSync(d).forEach(f=>{const p=join(d,f); statSync(p).isDirectory()?rec(p):/\.(ts|tsx)$/.test(f)&&archivos.push(p);});
  rec('src');
  const malos=archivos.filter(f=>/(voucherNumber|nextNum\w*)\s*[:=][^\n]*Math\.random/.test(readFileSync(f,'utf8')));
  ok('numeración: ningún comprobante usa número al azar'+(malos.length?' ('+malos.join(', ')+')':''),malos.length===0);
}
// ===== CAPA CONTABLE ÚNICA =====
import { armarComprobante, reversarLineas, crearComprobante } from '../src/utils/capaContable';
{
  const u={uid:'u1',email:'a@x.cl'};
  const lns:any[]=[{id:'1',accountId:'A',debit:1000,credit:0,gloss:'g'},{id:'2',accountId:'B',debit:0,credit:1000,gloss:'g'}];
  const v=armarComprobante({date:'2026-03-15',gloss:'x',lines:lns,origin:'KARDEX',extra:{companyId:'C1'} as any},5,u,'2026-03-15T00:00:00Z');
  ok('capa: arma comprobante con período, totales y número',v.period==='2026-03'&&v.totalDebit===1000&&v.totalCredit===1000&&v.voucherNumber===5);
  ok('capa: conserva campos extra del módulo y fija origen',(v as any).companyId==='C1'&&v.origin==='KARDEX');
  const lanza=(f:()=>any)=>{try{f();return false}catch{return true}};
  ok('capa: rechaza comprobante descuadrado',lanza(()=>armarComprobante({date:'2026-03-15',gloss:'x',lines:[{...lns[0],debit:1000},{...lns[1],credit:900}]},1,u)));
  ok('capa: rechaza sin líneas / sin fecha / sin número',lanza(()=>armarComprobante({date:'2026-03-15',gloss:'x',lines:[]},1,u))&&lanza(()=>armarComprobante({date:'15-03-2026',gloss:'x',lines:lns},1,u))&&lanza(()=>armarComprobante({date:'2026-03-15',gloss:'x',lines:lns},0,u)));
  const rev=reversarLineas(lns);
  ok('capa: reverso invierte Debe y Haber',rev[0].credit===1000&&rev[1].debit===1000&&rev[0].gloss==='Reverso: g');
  const guardados:any[]=[]; let n=10;
  const ctx={verificarPeriodo:(p:string)=>{if(p==='2026-01')throw new Error('cerrado')},siguienteNumero:async()=>++n,guardar:async(x:any)=>{guardados.push(x);return 'id'+guardados.length},usuario:()=>u};
  const r1=await crearComprobante(ctx,{date:'2026-03-15',gloss:'x',lines:lns});
  ok('capa: crea y devuelve id y número',r1.id==='id1'&&r1.voucherNumber===11&&guardados.length===1);
  let bloqueado=false; try{await crearComprobante(ctx,{date:'2026-01-10',gloss:'x',lines:lns})}catch{bloqueado=true}
  ok('capa: período cerrado no guarda nada',bloqueado&&guardados.length===1);
}
// ===== IMPORTAR DTE XML DE FACTURADORES EXTERNOS =====
import { leerDtesXml } from '../src/utils/dteXmlImport';
{
  const dte=(tipo:string,folio:string,emi:string,rec:string,neto:number,iva:number,tot:number)=>`<DTE><Documento><Encabezado><IdDoc><TipoDTE>${tipo}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-10-15</FchEmis></IdDoc><Emisor><RUTEmisor>${emi}</RUTEmisor><RznSoc>Emisor &amp; Cía</RznSoc></Emisor><Receptor><RUTRecep>${rec}</RUTRecep><RznSocRecep>Cliente SA</RznSocRecep></Receptor><Totales><MntNeto>${neto}</MntNeto><IVA>${iva}</IVA><MntTotal>${tot}</MntTotal></Totales></Encabezado></Documento></DTE>`;
  const xml=`<?xml version="1.0"?><EnvioDTE><SetDTE>${dte('33','101','76.111.111-1','77.222.222-2',1000,190,1190)}${dte('33','55','78.333.333-3','76.111.111-1',2000,380,2380)}${dte('33','9','70.000.000-0','71.000.000-0',100,19,119)}${dte('33','7','76.111.111-1','77.222.222-2',1000,190,1500)}</SetDTE></EnvioDTE>`;
  const r=leerDtesXml(xml,'76111111-1','Bsale');
  ok('xml: lee 2 documentos válidos',r.documentos.length===2);
  ok('xml: emitido por la empresa = Venta; recibido = Compra',r.documentos[0].tipoRegistro==='Venta'&&r.documentos[1].tipoRegistro==='Compra');
  ok('xml: montos, período, origen y facturador',r.documentos[0].montoTotal===1190&&r.documentos[0].period==='2026-10'&&r.documentos[0].origenDocumento==='FACTURADOR_EXTERNO'&&r.documentos[0].facturadorNombre==='Bsale');
  ok('xml: decodifica caracteres especiales',r.documentos[0].razonSocialEmisor==='Emisor & Cía');
  ok('xml: omite ajeno y descuadrado con motivo',r.omitidos.length===2&&r.omitidos.some(o=>o.folio==='9')&&r.omitidos.some(o=>o.folio==='7'));
}
// ===== AGENTE: ACCESO Y RECLASIFICACIÓN =====
import { puedeUsarAgente, puedeAsignarAgente } from '../src/utils/agenteAcceso';
import { validarFiltro, armarPropuesta, armarComprobantesDeReclasificacion } from '../src/utils/agenteReclasificador';
{
  ok('agente: super admin sí',puedeUsarAgente({role:'SUPER_USER',email:'x@y.cl'}));
  ok('agente piloto: Ramón con estudio contratado sí',puedeUsarAgente({role:'ACCOUNTANT',email:'Campos.Ramon@gmail.com',estudioContrataAgente:true}));
  ok('agente piloto: Ramón sin estudio asignado no',!puedeUsarAgente({role:'ACCOUNTANT',email:'campos.ramon@gmail.com'}));
  ok('agente piloto: otro admin de estudio no, aunque tenga el módulo',!puedeUsarAgente({role:'STUDY_ADMIN',email:'otro@estudio.cl',estudioContrataAgente:true,usuarioHabilitado:true}));
  ok('agente piloto: nadie asigna salvo super admin',puedeAsignarAgente('SUPER_USER',true)&&!puedeAsignarAgente('STUDY_ADMIN',true));
  const cuentas=[{id:'a1',code:'6101',name:'Combustible'},{id:'a2',code:'6205',name:'Movilización'},{id:'a3',code:'1101',name:'Banco'}];
  const L=(acc:any,d:number,c:number,x:any={})=>({accountId:acc.id,accountCode:acc.code,accountName:acc.name,debit:d,credit:c,...x});
  const V=(id:string,n:number,date:string,gloss:string,lines:any[],x:any={})=>({id,voucherNumber:n,date,gloss,lines,status:'Valido',...x});
  const vs:any[]=[
    V('v1',1,'2026-09-10','Bencina camioneta',[L(cuentas[0],10000,0,{auxiliaryRut:'76.111.111-1'}),L(cuentas[2],0,10000)]),
    V('v2',2,'2026-09-20','Bencina reparto',[L(cuentas[0],5000,0),L(cuentas[2],0,5000)]),
    V('v3',3,'2026-10-05','Bencina octubre',[L(cuentas[0],7000,0),L(cuentas[2],0,7000)]),
    V('v4',4,'2026-11-05','Bencina fuera de rango',[L(cuentas[0],9000,0),L(cuentas[2],0,9000)]),
    V('v5',5,'2026-09-12','Devolución',[L(cuentas[2],2000,0),L(cuentas[0],0,2000)]),
  ];
  ok('agente: rechaza cuenta inexistente',!validarFiltro({cuentaOrigen:'9999',cuentaDestino:'6205'},cuentas).ok);
  ok('agente: rechaza origen = destino',!validarFiltro({cuentaOrigen:'6101',cuentaDestino:'6101'},cuentas).ok);
  const fv:any=validarFiltro({cuentaOrigen:'6101',cuentaDestino:'6205',desde:'2026-09-01',hasta:'2026-10-31'},cuentas);
  ok('agente: acepta filtro válido',fv.ok);
  const pr=armarPropuesta(fv.filtro,vs,cuentas);
  ok('agente: respeta rango de fechas (4 líneas, no incluye noviembre)',pr.totalLineas===4&&!pr.lineas.some(l=>l.voucherId==='v4'));
  ok('agente: neto = debe − haber de la cuenta origen (10000+5000+7000−2000)',pr.neto===20000);
  const cs=armarComprobantesDeReclasificacion(pr);
  ok('agente: un comprobante por período, fecha fin de mes',cs.length===2&&cs[0].date==='2026-09-30'&&cs[1].date==='2026-10-31');
  const sum=(ls:any[],k:string)=>ls.reduce((a,l)=>a+l[k],0);
  ok('agente: cada comprobante cuadra',cs.every(c=>sum(c.lines,'debit')===sum(c.lines,'credit')));
  const sept=cs[0].lines; const origSept=sept.filter((l:any)=>l.accountCode==='6101'); const destSept=sept.filter((l:any)=>l.accountCode==='6205');
  ok('agente: efecto neto en septiembre: origen −13000, destino +13000',sum(origSept,'credit')-sum(origSept,'debit')===13000&&sum(destSept,'debit')-sum(destSept,'credit')===13000);
  ok('agente: conserva auxiliar y referencia al comprobante original',sept.some((l:any)=>l.auxiliaryRut==='76.111.111-1'&&/N° 1/.test(l.gloss)));
  const yaHechos:any[]=[...vs,{id:'r1',voucherNumber:9,date:'2026-09-30',gloss:'x',origin:'AGENTE_RECLASIFICACION',lines:[],reclasificadas:cs[0].reclasificadas}];
  const pr2=armarPropuesta(fv.filtro,yaHechos,cuentas);
  ok('agente: no reclasifica dos veces lo ya reclasificado',pr2.lineas.every(l=>l.period==='2026-10')&&pr2.totalLineas===1);
  const fg:any=validarFiltro({cuentaOrigen:'6101',cuentaDestino:'6205',glosaContiene:'reparto'},cuentas);
  ok('agente: filtro por glosa',armarPropuesta(fg.filtro,vs,cuentas).totalLineas===1);
}
{
  const { getNaturaleza } = await import('../src/utils/ifrsClassification');
  ok('balance 8 col: Ventas 3101001 con tipo Patrimonio es Ingreso (Ganancia)', getNaturaleza({code:'3101001',name:'VENTAS',type:'Patrimonio'} as any)==='INGRESO');
  ok('balance 8 col: Capital 2301001 sigue siendo Patrimonio', getNaturaleza({code:'2301001',name:'CAPITAL',type:'Patrimonio'} as any)==='PATRIMONIO');
  ok('balance 8 col: Gasto 4101023 con BLCE ACTIVO por defecto sigue siendo Gasto', getNaturaleza({code:'4101023',name:'HONORARIOS CURSOS',type:'Gasto',blce8Columnas:'ACTIVO'} as any)==='GASTO');
}
{
  const { validarNaturalezaParametros } = await import('../src/utils/validarParametros');
  const plan=[{id:'a',code:'1101001',name:'CAJA',type:'Activo'},{id:'b',code:'3101001',name:'VENTAS',type:'Patrimonio'},{id:'c',code:'4101001',name:'COSTO DE VENTAS',type:'Gasto'},{id:'d',code:'2101001',name:'PROVEEDORES',type:'Pasivo'}];
  ok('parámetros: IVA crédito = Costo de ventas se rechaza', validarNaturalezaParametros({ivaCreditoAccountId:'c'},plan).length===1);
  ok('parámetros: Proveedores = Caja se acepta (compras al contado)', validarNaturalezaParametros({defaultSupplierAccountId:'a'},plan).length===0);
  ok('parámetros: Proveedores = Costo de ventas se rechaza', validarNaturalezaParametros({defaultSupplierAccountId:'c'},plan).length===1);
  ok('parámetros: configuración correcta pasa', validarNaturalezaParametros({defaultCustomerAccountId:'a',defaultSupplierAccountId:'d',defaultSalesIncomeAccountId:'b',defaultCostOrExpenseAccountId:'c'},plan).length===0);
}
{
  const R = await import('../src/utils/rentaAnual');
  const plan=[{id:'caja',code:'1101001',name:'CAJA',type:'Activo'},{id:'prov',code:'2101001',name:'PROVEEDORES',type:'Pasivo'},{id:'cap',code:'2301001',name:'CAPITAL PAGADO',type:'Patrimonio'},{id:'vta',code:'3101001',name:'VENTAS',type:'Patrimonio'},{id:'gto',code:'4101001',name:'GASTOS',type:'Gasto'}];
  const L=(id:string,d:number,c:number)=>({accountId:id,debit:d,credit:c});
  const vs=[
    {date:'2025-06-01',status:'Valido',lines:[L('caja',1000,0),L('cap',0,1000)]},
    {date:'2026-03-01',status:'Valido',lines:[L('caja',5000,0),L('vta',0,5000)]},
    {date:'2026-04-01',status:'Valido',lines:[L('gto',2000,0),L('prov',0,2000)]},
    {date:'2026-05-01',status:'Anulado',lines:[L('caja',999,0),L('vta',0,999)]},
    {date:'2027-01-05',status:'Valido',lines:[L('caja',7,0),L('vta',0,7)]},
  ];
  const d=R.datosContablesDelAnio(vs as any,plan,2026);
  ok('renta: utilidad contable 2026 = 3.000 (excluye anulados y otros años)', d.utilidadContable===3000 && d.ingresos===5000 && d.gastos===2000);
  ok('renta: activos/pasivos al 31-12 con historia previa', d.activos===6000 && d.pasivos===2000 && d.capitalSugerido===1000);
  const h=R.hojaInicial('14_D3_PROPYME_GENERAL',d); h.ajustes=[{id:'a',concepto:'GR',tipo:'AGREGADO',monto:500},{id:'b',concepto:'DNP',tipo:'DEDUCCION',monto:1500}]; h.ppmPagados=100;
  const r=R.calcularRenta(d,h);
  ok('renta 14D3: RLI 2.000, IDPC 12,5% = 250, saldo 150', r.rli===2000 && r.idpc===250 && r.saldoImpuesto===150);
  ok('renta 14D3: CPT simplificado = capital 1.000 + base 2.000', r.cpt===3000);
  const ra=R.calcularRenta(d,{...R.hojaInicial('14_A_SEMI_INTEGRADO',d),ajustes:h.ajustes});
  ok('renta 14A: IDPC 27% y CPT = activos - pasivos', ra.idpc===540 && ra.cpt===4000);
  const r8=R.calcularRenta(d,{...R.hojaInicial('14_D8_PROPYME_TRANSPARENTE',d),ajustes:[{id:'x',concepto:'p',tipo:'DEDUCCION',monto:9000}]});
  ok('renta 14D8: sin IDPC; pérdida tributaria si la base es negativa', r8.idpc===0 && r8.rli===0 && r8.perdidaTributaria===6000);
}
{
  const R = await import('../src/utils/rentaAnual');
  const plan=[{id:'ppm',code:'1105002',name:'PAGOS PROVISIONALES MENSUALES',type:'Activo'},{id:'caja',code:'1101001',name:'CAJA',type:'Activo'}];
  const L=(id:string,d:number,c:number)=>({accountId:id,debit:d,credit:c});
  const vs=[
    {date:'2026-01-01',origin:'APERTURA_ANIO',status:'Valido',lines:[L('ppm',50,0),L('caja',0,50)]},
    {date:'2026-02-20',status:'Valido',lines:[L('ppm',100,0),L('caja',0,100)]},
    {date:'2026-03-20',status:'Valido',lines:[L('ppm',120,0),L('caja',0,120)]},
    {date:'2026-04-20',status:'Anulado',lines:[L('ppm',999,0),L('caja',0,999)]},
    {date:'2027-01-20',status:'Valido',lines:[L('ppm',80,0),L('caja',0,80)]},
  ];
  ok('renta: cuenta PPM sugerida por nombre', R.sugerirCuentaPpm(plan)==='ppm');
  ok('renta: PPM del año = 220 (sin apertura, anulados ni otros años)', R.movimientoCuentaDelAnio(vs as any,plan,'ppm',2026)===220);
}
{
  const C = await import('../src/utils/cuadraturaRetenciones');
  const plan=[{id:'iu',code:'2103002',name:'IMPUESTO UNICO POR PAGAR'},{id:'rh',code:'2101020',name:'RETENCION DE 2° CATEGORIA'}];
  const liq=[{period:'2026-01',impuestoUnicoSegundaCategoria:1000},{period:'2026-01',impuestoUnicoSegundaCategoria:500},{period:'2026-02',impuestoUnicoSegundaCategoria:800}];
  const f29=[{period:'2026-01',retenciones:{impuestoUnicoTrabajadores:1500,retencionHonorarios:0}},{period:'2026-02',retenciones:{impuestoUnicoTrabajadores:700,retencionHonorarios:300}}];
  const vs=[{period:'2026-01',status:'Valido',lines:[{accountId:'iu',debit:0,credit:1500}]},{period:'2026-02',status:'Valido',lines:[{accountId:'iu',debit:1500,credit:800}]}];
  const r=C.cuadratura1887(2026,liq,f29,vs as any,plan[0]);
  ok('cuadratura 1887: enero cuadra (liquidaciones = F29 = contabilidad)', r.filas[0].cuadra && r.filas[0].contabilidad===1500);
  ok('cuadratura 1887: febrero no cuadra (F29 700 vs 800) y el pago al debe no cuenta', !r.filas[1].cuadra && r.filas[1].contabilidad===800 && r.mesesConDiferencia===1);
  const docs=[{period:'2026-02',tipoRegistro:'Honorarios',montoRetencion:300},{period:'2026-03',tipoRegistro:'Honorarios',montoRetencion:200},{period:'2026-03',tipoRegistro:'Compra',montoRetencion:999}];
  const h=C.cuadratura1879(2026,docs,f29,[] as any);
  ok('cuadratura 1879: marzo sin F29 se marca como faltante', h.filas[2].faltaF29 && !h.filas[2].cuadra && h.filas[1].cuadra && h.totalOrigen===500);
  ok('cuadratura: cuentas sugeridas por nombre', C.sugerirCuentaImpuestoUnico(plan)==='iu' && C.sugerirCuentaRetencionHonorarios(plan)==='rh');
}
{
  const K = await import('../src/utils/credencialesSii');
  const cfg:any={rutRepresentante:'11.111.111-1',claveRepLegalSii:'abc',claveEmpresaSii:'••••••••',certificadoB64:'QUJD',siiApiKey:'k1',ambiente:'Producción'};
  const {limpio,secretos,haySecretos}=K.separarCredenciales(cfg);
  ok('credenciales: ninguna clave queda en la empresa', !('claveRepLegalSii' in limpio) && !('certificadoB64' in limpio) && !('siiApiKey' in limpio) && !('claveEmpresaSii' in limpio));
  ok('credenciales: se envían las reales y no la máscara', haySecretos && secretos.claveRepresentante==='abc' && secretos.claveSii==='' && secretos.certificadoB64==='QUJD' && secretos.siiApiKey==='k1');
  ok('credenciales: quedan solo marcas', limpio.claveRepLegalSiiMasked==='••••••••' && limpio.hasCertificadoDigital===true && limpio.ambiente==='Producción');
}
{
  const F = await import('../src/utils/finiquito');
  ok('obra/faena: gradualidad Ley 21.122', F.diasPorMesObraFaena('2018-12-31')===0 && F.diasPorMesObraFaena('2019-03-01')===1 && F.diasPorMesObraFaena('2020-08-01')===1.5 && F.diasPorMesObraFaena('2021-09-01')===2 && F.diasPorMesObraFaena('2026-02-01')===2.5);
  ok('obra/faena: 6 meses y 16 días = 7 meses', F.mesesTrabajadosObra('2026-01-01','2026-07-16').meses===7);
  ok('obra/faena: 6 meses y 15 días = 6 meses', F.mesesTrabajadosObra('2026-01-01','2026-07-15').meses===6);
  ok('obra/faena: menos de un mes no da derecho', !F.mesesTrabajadosObra('2026-03-01','2026-03-20').vigenteUnMesOMas);
  const r=F.calcularFiniquito({hireDate:'2026-01-01',fechaCese:'2026-07-16',contractType:'OBRA_FAENA',requiereIAS:false,requiereAvisoPrevio:false,esConclusionObra:true,conAvisoPrevio:false,baseMensual:900000,ufCese:40000,diasVacacionesTomados:0});
  ok('obra/faena: 7 meses x 2,5 = 17,5 días = $525.000', r.diasIndemnizacionObra===17.5 && r.montoIndemnizacionObra===525000);
  const t=F.calcularFiniquito({hireDate:'2026-01-01',fechaCese:'2026-07-16',contractType:'OBRA_FAENA',requiereIAS:false,requiereAvisoPrevio:false,esConclusionObra:true,conAvisoPrevio:false,baseMensual:5000000,ufCese:40000,diasVacacionesTomados:0});
  ok('obra/faena: base topada en 90 UF', t.baseTopada===3600000 && t.montoIndemnizacionObra===2100000);
  const i=F.calcularFiniquito({hireDate:'2026-01-01',fechaCese:'2026-07-16',contractType:'INDEFINIDO',requiereIAS:false,requiereAvisoPrevio:false,esConclusionObra:true,conAvisoPrevio:false,baseMensual:900000,ufCese:40000,diasVacacionesTomados:0});
  ok('obra/faena: si el contrato no es de obra, avisa y no calcula', i.montoIndemnizacionObra===0 && !!i.avisoObra);
}
{
  const C = await import('../src/utils/contratosLaborales');
  const F = await import('../src/utils/finiquito');
  const base:any={hireDate:'2025-02-01',contractType:'OBRA_FAENA'};
  ok('contratos: ficha antigua se lee como un contrato', C.contratosDe(base).length===1 && C.contratoActual(base)!.fechaInicio==='2025-02-01');
  const t1=C.terminarContrato(base,'2025-08-31','ART_159_CONCLUSION');
  ok('contratos: término queda en el contrato y en la ficha', t1.terminationDate==='2025-08-31' && t1.contratos![0].causalTermino==='ART_159_CONCLUSION');
  let err=''; try { C.nuevoContrato(base,{tipo:'PLAZO_FIJO',fechaInicio:'2025-09-01'}); } catch(e:any){ err=e.message; }
  ok('contratos: no se recontrata sin terminar el vigente', err.includes('término'));
  const r2=C.nuevoContrato(t1,{tipo:'OBRA_FAENA',fechaInicio:'2026-01-05',obraFaena:'Edificio Sur'});
  ok('contratos: recontratación abre contrato nuevo sin término', r2.contratos!.length===2 && r2.hireDate==='2026-01-05' && r2.terminationDate==='');
  const f=F.calcularFiniquito({hireDate:r2.hireDate,fechaCese:'2026-04-04',contractType:r2.contractType,requiereIAS:false,requiereAvisoPrevio:false,esConclusionObra:true,conAvisoPrevio:false,baseMensual:600000,ufCese:40000,diasVacacionesTomados:0});
  ok('contratos: el finiquito cuenta solo el contrato nuevo (3 meses = 7,5 días)', f.mesesObra===3 && f.diasIndemnizacionObra===7.5);
  const s=C.sincronizarFicha({...r2,hireDate:'2026-01-06'});
  ok('contratos: editar la ficha ajusta el contrato actual, no el anterior', s.contratos![1].fechaInicio==='2026-01-06' && s.contratos![0].fechaInicio==='2025-02-01');
}
{
  const F = await import('../src/utils/finiquito');
  const c=F.calcularFiniquito({hireDate:'2026-11-02',fechaCese:'2026-11-24',contractType:'OBRA_FAENA',requiereIAS:false,requiereAvisoPrevio:false,esConclusionObra:true,conAvisoPrevio:false,baseMensual:900000,ufCese:40000,diasVacacionesTomados:0});
  ok('obra 2 al 24 nov: 23 días, sin indemnización ni feriado proporcional', c.diffDays===23 && c.montoIndemnizacionObra===0 && c.montoVacaciones===0 && !!c.avisoFeriado && !!c.avisoObra && c.totalLiquido===0);
}
{
  const P = await import('../src/utils/payrollCalculator');
  const emp:any={id:'e',rut:'1-9',name:'X',hireDate:'2026-11-02',terminationDate:'2026-11-24',contractType:'OBRA_FAENA',baseSalary:900000,pensionSystem:'HABITAT',healthSystem:'FONASA',hasCesantiaAFC:true};
  const prm:any={period:'2026-11'};
  let s:any; try { s=P.calculatePayrollSlip(emp,{...(P as any).getPrevisionalParametersForPeriod?.('2026-11'),period:'2026-11'}); } catch(e){ s=null; }
  ok('liquidación: obra del 2 al 24 de noviembre = 23 días', !!s && s.diasTrabajados===23);
  let s2:any; try { s2=P.calculatePayrollSlip({...emp,hireDate:'2026-10-01',terminationDate:'2026-11-30'},{...(P as any).getPrevisionalParametersForPeriod?.('2026-11'),period:'2026-11'}); } catch(e){ s2=null; }
  ok('liquidación: término el último día del mes = 30 días', !!s2 && s2.diasTrabajados===30);
}
{
  const C = await import('../src/utils/contratosLaborales');
  const w:any={hireDate:'2026-11-02',contractType:'OBRA_FAENA',contratos:[{id:'c1',tipo:'OBRA_FAENA',fechaInicio:'2026-11-02',obraId:'o1'}]};
  const a=C.aplicarCierreObra(w,'o1','2026-11-24');
  ok('cierre de obra: termina el contrato de la obra', !!a && a.terminationDate==='2026-11-24' && a.contratos![0].causalTermino==='ART_159_CONCLUSION');
  ok('cierre de obra: no toca a trabajadores de otra obra', C.aplicarCierreObra(w,'o2','2026-11-24')===null);
  const b=C.aplicarCierreObra(a!,'o1','2026-11-27','2026-11-24');
  ok('cierre de obra: corregir la fecha corrige el contrato', !!b && b.terminationDate==='2026-11-27');
  const r=C.aplicarCierreObra(b!,'o1','','2026-11-27');
  ok('cierre de obra: reabrir la obra reabre el contrato', !!r && r.terminationDate==='' && !r.contratos![0].fechaTermino);
  const renuncia=C.terminarContrato(w,'2026-11-10','ART_159_RENUNCIA');
  ok('cierre de obra: no cambia un contrato terminado por renuncia', C.aplicarCierreObra(renuncia,'o1','2026-11-24')===null);
}
{
  const F = await import('../src/utils/finiquito');
  const r = F.calcularFiniquito({hireDate:'2026-11-02',fechaCese:'2026-11-24',contractType:'OBRA_FAENA',requiereIAS:false,requiereAvisoPrevio:false,esConclusionObra:true,conAvisoPrevio:false,baseMensual:600000,ufCese:0,diasVacacionesTomados:0,sueldoLiquidoPendiente:380000});
  ok('finiquito obra: suma sueldo líquido del mes, sin aviso previo', r.totalLiquido===380000 && r.montoAvisoPrevio===0);
}
{
  const F = await import('../src/utils/finiquito');
  const r = F.calcularFiniquito({hireDate:'2026-11-02',fechaCese:'2026-11-24',contractType:'OBRA_FAENA',requiereIAS:false,requiereAvisoPrevio:false,esConclusionObra:true,conAvisoPrevio:false,baseMensual:553553,ufCese:0,diasVacacionesTomados:0});
  const c = F.cuadroDePago(r,{period:'2026-11',diasTrabajados:23,totalHaberes:520000,totalDescuentosPrevisionales:95000,liquidoAPagar:425000});
  ok('cuadro: obra corta = solo la liquidación, sin filas de finiquito', c.total===425000 && c.totalFiniquito===0 && !c.filas.some(f=>f.seccion==='FINIQUITO') && c.filas.length===2);
  const r2 = F.calcularFiniquito({hireDate:'2020-01-01',fechaCese:'2026-11-24',contractType:'INDEFINIDO',requiereIAS:true,requiereAvisoPrevio:true,esConclusionObra:false,conAvisoPrevio:false,baseMensual:1000000,ufCese:0,diasVacacionesTomados:60});
  const c2 = F.cuadroDePago(r2,null,{descuentoAfc:99999999});
  ok('cuadro: descuento AFC no supera la indemnización por años', c2.totalDescuentos===-r2.montoIAS);
}
{
  const P = await import('../api/sii/portal');
  const r = P.partirRut('76.293.672-0');
  ok('SII propia: RUT partido', r.cuerpo==='76293672' && r.dv==='0' && r.conPuntos==='76.293.672-0');
  const html = "var arr_informe_mensual = new Array();\narr_informe_mensual['nroboleta_1'] = \"55\";\narr_informe_mensual['totalhonorarios_1'] = formatMiles('1300000','.');\nvar xml_values = new Array();\nxml_values['suma'] = 0;\nxml_values['suma'] += 1300000;\n";
  const m = P.leerMapa(html,'arr_informe_mensual'), xv = P.leerMapa(html,'xml_values');
  ok('SII propia: lee mapas en línea (boletas honorarios)', m!.nroboleta_1==='55' && m!.totalhonorarios_1==='1300000' && xv!.suma==='1300000');
  ok('SII propia: página sin mapa = null', P.leerMapa('<html></html>','arr_informe_mensual')===null);
  const o = P.extraerObjeto('<script>var DatosCntrNow = {"contribuyente":{"rut":"76293672","razonSocial":"A {B} C"}}; var x=1;</script>','DatosCntrNow');
  ok('SII propia: extrae DatosCntrNow', o?.contribuyente?.razonSocial==='A {B} C');
  const f = new P.Frasco(); f.aplicar('https://zeusr.sii.cl/x',['TOKEN=abc; Domain=.sii.cl; Path=/','LOCAL=1; Path=/']);
  ok('SII propia: cookies por dominio', f.cabecera('https://www4.sii.cl/a').includes('TOKEN=abc') && !f.cabecera('https://www4.sii.cl/a').includes('LOCAL') && f.cabecera('https://zeusr.sii.cl/b').includes('LOCAL=1'));
}
{
  const P = await import('../api/sii/portal');
  const todos = [
    { periodo:'2026-07', folio:'2', fecha:'2026-08-20', total:5, estadoCodigo:'70' },
    { periodo:'2026-07', folio:'1', fecha:'2026-08-20', total:5, estadoCodigo:'1' },
    { periodo:'2026-09', folio:'3', fecha:'2026-10-20', total:7, estadoCodigo:'70' },
    { periodo:'2026-09', folio:'4', fecha:'2026-10-21', total:8, estadoCodigo:'70' },
  ];
  const r = P.consolidarF29(todos, 2026, 11, { dia20:true, inicio:'2026-07-01', termino:'', hoy:new Date('2026-11-24T12:00:00Z') });
  const per = (p:string) => r.filter((f:any)=>f.periodo===p);
  ok('F29: vigente gana a rechazado', per('2026-07').length===1 && per('2026-07')[0].folio==='1');
  ok('F29: sin vigente, el último rechazado', per('2026-09').length===1 && per('2026-09')[0].folio==='4');
  ok('F29: vencido sin declarar = PENDIENTE', per('2026-08')[0]?.estadoCodigo==='PENDIENTE' && per('2026-10')[0]?.estadoCodigo==='PENDIENTE');
  ok('F29: mes sin vencer y antes del inicio no aparecen', per('2026-11').length===0 && per('2026-06').length===0);
}
{
  const P = await import('../api/sii/portal');
  const R = await import('../src/utils/dteRepresentacion');
  const set = '<SetDTE><Caratula><FchResol>2014-08-22</FchResol><NroResol>80</NroResol></Caratula><DTE version="1.0"><Documento><Encabezado><IdDoc><TipoDTE>110</TipoDTE><Folio>7</Folio><FchEmis>2026-11-03</FchEmis></IdDoc><Emisor><RUTEmisor>77710929-4</RUTEmisor><RznSoc>A &amp; B SPA</RznSoc></Emisor><Receptor><RUTRecep>55555555-5</RUTRecep><RznSocRecep>NUTS LLC</RznSocRecep></Receptor><Transporte><Aduana><CodClauVenta>5</CodClauVenta></Aduana></Transporte><Totales><TpoMoneda>DOLAR USA</TpoMoneda><MntExe>100.5</MntExe><MntTotal>100.5</MntTotal></Totales></Encabezado><Detalle><NroLinDet>1</NroLinDet><NmbItem>Nueces</NmbItem><MontoItem>100.5</MontoItem></Detalle><TED version="1.0">\n <DD><F>7</F></DD>\n</TED></Documento></DTE><DTE version="1.0"><Documento><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>8</Folio><FchEmis>2026-11-04</FchEmis></IdDoc><Totales><MntTotal>119</MntTotal></Totales></Encabezado></Documento></DTE></SetDTE>';
  const ds = P.separarSetDte(set);
  ok('XML SII: separa el SetDTE y lee la resolución', ds.length===2 && ds[0].tipo==='110' && ds[0].nroResol==='80' && ds[1].folio==='8');
  const d = R.leerDte(ds[0].xml);
  ok('XML SII: lee exportación (moneda, aduana, decimales, &amp;)', d.esExportacion && d.totales.moneda==='DOLAR USA' && d.totales.total===100.5 && d.aduana?.CodClauVenta==='5' && d.emisor.razon==='A & B SPA');
  ok('XML SII: texto del timbre sin saltos', R.textoTimbre(d.ted)==='<TED version="1.0"><DD><F>7</F></DD></TED>');
}
{
  const P = await import('../api/sii/portal');
  ok('XML SII: conteo del listado en cualquier orden', P.cantidadListado('<input type="hidden" value="3" name="cant_reg" id="cant_reg">')===3 && P.cantidadListado('<input id=cant_reg value=0>')===0 && P.cantidadListado('<p>No hay resultados</p>')===0 && P.cantidadListado('<p>x</p>')===null);
}
{
  const T = await import('../src/utils/repararTexto');
  ok('repara Ñ y tildes rotas', T.repararTexto('CARMONA NIEMANN Y COMPAÃ‘IA LIMITADA')==='CARMONA NIEMANN Y COMPAÑIA LIMITADA' && T.repararTexto('TelefÃ³nica MÃ³viles Chile S.A.')==='Telefónica Móviles Chile S.A.' && T.repararTexto('ÑUÑOA ÁREA')==='ÑUÑOA ÁREA');
}
console.log(fallos?`\n${fallos} FALLAS`:'\nTodas las pruebas OK'); process.exit(fallos?1:0);
