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
console.log(fallos?`\n${fallos} FALLAS`:'\nTodas las pruebas OK'); process.exit(fallos?1:0);
