(() => {
const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTH = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const QN = ['','FIRST','SECOND','THIRD','FOURTH'];
const DIA = ['D','L','M','M','J','V','S'];
const DAY = ['S','M','T','W','T','F','S'];

const S = { db:null, dl:null, live:false, canWrite:true, trucks:{}, entries:{}, months:{}, unsubM:null, quarters:{}, unsubQ:null, focusNext:null, truckId:null,
  month:'', year:0, q:1, avg:'weighted', tab:'log', unsubE:null, chains:{}, logKey:'' };

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');
const r2 = x => Math.round(x*100)/100;
const r3 = x => Math.round(x*1000)/1000;
const num = v => { if (v===''||v==null) return null; const n = Number(String(v).replace(/[,$\s']/g,'')); return isFinite(n) ? n : null; };
const fOdo = n => n==null ? '' : Math.round(n).toLocaleString('en-US');
const fMoney = n => n==null ? '' : '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fGal = n => n==null ? '' : n.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
const fPrice = n => n==null ? '' : '$' + n.toFixed(3);
const esc = s => String(s??'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const usDate = d => { const [y,m,dd] = d.split('-'); return `${+m}/${+dd}/${y}`; };
// Date boxes are plain text in US order (MM/DD/YYYY) so the browser's language never flips them to day/month.
// The app keeps dates as YYYY-MM-DD internally; usPad() shows one, isoOf() reads one back ('' when invalid).
const usPad = d => { if (!d) return ''; const [y,m,dd] = d.split('-'); return `${m}/${dd}/${y}`; };
function isoOf(v){
  const s=String(v||'').trim(); if (!s) return '';
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y, mo, d;
  if (m) { y=+m[1]; mo=+m[2]; d=+m[3]; }
  else if ((m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/))) { mo=+m[1]; d=+m[2]; y=+m[3]; if (y<100) y+=2000; }
  else return '';
  if (mo<1||mo>12||d<1||d>new Date(y,mo,0).getDate()) return '';
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
// one line that identifies the vehicle on every sheet and report: unit, make/model, VIN, plate
const vehicleLine = t => [`Truck # ${t.number}`, t.model, t.vin && `VIN ${t.vin}`, t.plate && `Plate ${t.plate}${t.plateState?' ('+t.plateState+')':''}`].filter(Boolean).join(' · ');
const USD_ATTRS = 'class="usd" inputmode="numeric" maxlength="10" placeholder="MM/DD/YYYY" autocomplete="off"';
const dim = (y,m) => new Date(y,m,0).getDate();
const safeId = s => String(s).trim().replace(/[^A-Za-z0-9_\-.~]/g,'-');

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true,2600); }

// ---------- derived data ----------
const costOf = e => e.cost!=null ? e.cost : (e.gal!=null && e.price!=null ? r2(e.gal*e.price) : null);
function truckEntries(tid){ return Object.values(S.entries).filter(e=>e.truck===tid).sort((a,b)=>a.date<b.date?-1:1); }
function odoChain(tid){
  const miles={}, prev={}; let last=null;
  for (const e of truckEntries(tid)) {
    prev[e.date]=last;
    if (e.odo!=null && !e.off) { miles[e.date] = last!=null ? e.odo-last : null; last=e.odo; }
  }
  return {miles, prev, current:last};
}
function flagsFor(e, chain){
  const out=[]; if (!e) return out;
  const p = chain.prev[e.date], m = chain.miles[e.date];
  if (e.odo!=null && p!=null && e.odo < p) out.push(['bad','Odómetro menor que el día anterior']);
  else if (m!=null && m>900) out.push(['warn',`${fOdo(m)} millas en un día`]);
  if (e.gal!=null && e.price!=null && e.cost!=null && Math.abs(e.gal*e.price - e.cost) > 0.05)
    out.push(['warn',`Galones × precio = ${fMoney(r2(e.gal*e.price))}`]);
  if (e.gal!=null && e.cost==null && e.price==null) out.push(['warn','Falta precio o costo']);
  if (e.fuelOdo!=null && e.odo!=null && e.fuelOdo > e.odo) out.push(['warn','Odómetro de carga mayor que el del día']);
  if (e.odo!=null && !e.driver) out.push(['warn','Falta chofer']);
  return out;
}
function monthStats(tid,y,m){
  const pre=`${y}-${pad(m)}`, chain=odoChain(tid);
  const st={miles:0,gal:0,cost:0,prices:[],fuel:[],off:0,days:0,flags:0};
  for (const e of truckEntries(tid)) {
    if (!e.date.startsWith(pre)) continue;
    if (e.off) st.off++;
    if (chain.miles[e.date]!=null) { st.miles+=chain.miles[e.date]; st.days++; }
    st.flags += flagsFor(e,chain).length;
    if (e.gal>0) {
      const c=costOf(e)??0, p=e.price!=null?e.price:(c/e.gal);
      st.gal+=e.gal; st.cost+=c; st.prices.push(p); st.fuel.push({...e,cost:c,price:p});
    }
  }
  st.cost=r2(st.cost); st.gal=r3(st.gal);
  st.avgW = st.gal ? st.cost/st.gal : null;
  st.avgS = st.prices.length ? st.prices.reduce((a,b)=>a+b,0)/st.prices.length : null;
  st.odoMiles = st.miles>0;
  // months entered as totals only (no individual loads / no odometer)
  const man=S.months[`${tid}_${pre}`];
  if (man) {
    if (!st.fuel.length && (man.cost!=null || man.gal!=null)) {
      st.manualFuel=true; st.cost=man.cost??0; st.gal=man.gal??0;
      st.avgW = st.gal ? st.cost/st.gal : (man.price??null);
      st.avgS = man.price ?? st.avgW;
    }
    if (!st.odoMiles && man.miles!=null) st.miles=man.miles;
  }
  st.mpg = st.gal && st.miles ? st.miles/st.gal : null;
  return st;
}
const avgOf = st => S.avg==='simple' ? st.avgS : st.avgW;

// quarter miles = closing odometer − opening odometer; the closing reading of one quarter opens the next
function lastOdoEntry(tid, beforeExcl, fromIncl){
  return truckEntries(tid).filter(e=>e.odo!=null && !e.off && e.date<beforeExcl && (!fromIncl || e.date>=fromIncl)).pop() || null;
}
function quarterOdo(tid,y,q){
  const qs=`${y}-${pad(3*q-2)}-01`, qe = q===4 ? `${y+1}-01-01` : `${y}-${pad(3*q+1)}-01`;
  const man=S.quarters[`${tid}_${y}-Q${q}`]||{}, [py,pq] = q===1 ? [y-1,4] : [y,q-1], prevMan=S.quarters[`${tid}_${py}-Q${pq}`]||{};
  const r={startSrc:'',endSrc:''};
  if (man.endOdo!=null) Object.assign(r,{end:man.endOdo,endDate:man.endDate,endSrc:'manual'});
  else { const e=lastOdoEntry(tid,qe,qs); if (e) Object.assign(r,{end:e.odo,endDate:e.date,endSrc:'log'}); }
  if (man.startOdo!=null) Object.assign(r,{start:man.startOdo,startDate:man.startDate,startSrc:'manual'});
  else if (prevMan.endOdo!=null) Object.assign(r,{start:prevMan.endOdo,startDate:prevMan.endDate,startSrc:'prev'});
  else { const e=lastOdoEntry(tid,qs); if (e) Object.assign(r,{start:e.odo,startDate:e.date,startSrc:'prev'}); }
  r.miles = r.start!=null && r.end!=null ? r.end-r.start : null;
  return r;
}

// ---------- store ----------
function writeEntry(id, data){
  if (!S.db) { if (data) S.entries[id]=data; else delete S.entries[id]; refreshAll(); return; }
  const ref=S.db.collection('entries').doc(id);
  S.chains[id]=(S.chains[id]||Promise.resolve())
    .then(()=> data ? ref.set(data) : ref.delete())
    .catch(err=>{ toast(err&&err.code==='quota_exceeded' ? 'Se llenó el almacenamiento: borra meses antiguos.' : 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
      if (err&&err.code==='invalid_argument') { S.canWrite=false; refreshAll(); } });
}
async function writeTruck(id, data){
  if (!S.db) { if (data) S.trucks[id]=data; else delete S.trucks[id]; trucksChanged(); return; }
  try { const ref=S.db.collection('trucks').doc(id); data ? await ref.set(data) : await ref.delete(); }
  catch(e){ toast('No se pudo guardar el camión.'); }
}

// ---------- monthly log ----------
function renderLog(){
  const box=$('#logBody'), t=S.trucks[S.truckId];
  if (!t) { box.innerHTML=`<div class="empty"><b>Sin camiones todavía</b>Agrega tu primer camión en la pestaña Camiones para empezar la bitácora.</div>`; $('#logTiles').innerHTML=''; S.logKey=''; return; }
  const key=S.truckId+'|'+S.month+'|'+S.canWrite;
  if (key!==S.logKey) {
    S.logKey=key;
    const [y,m]=S.month.split('-').map(Number), n=dim(y,m), dis=S.canWrite?'':' disabled';
    let rows='';
    for (let d=1; d<=n; d++) {
      const date=`${y}-${pad(m)}-${pad(d)}`, wd=new Date(y,m-1,d).getDay(), ip=(f,lbl)=>`id="f-${date}-${f}" data-f="${f}" aria-label="${lbl} ${usDate(date)}" autocomplete="off"`;
      rows+=`<tr data-date="${date}" class="${wd===0&&d>1?'sun':''}">
        <td class="day">${DAY[wd]}</td><td class="date">${usDate(date)}</td>
        <td><input ${ip('driver','Driver')}${dis}></td>
        <td><input ${ip('odo','Dashboard miles')}${dis}></td>
        <td class="calc" data-c="miles"></td>
        <td><input ${ip('fuelOdo','Fuel miles')} inputmode="numeric"${dis}></td>
        <td><input ${ip('gal','Fuel gallons')} inputmode="decimal"${dis}></td>
        <td><input ${ip('cost','Fuel cost')} inputmode="decimal"${dis}></td>
        <td><input ${ip('price','Price per gallon')} inputmode="decimal"${dis}></td>
        <td class="fl" data-c="notes"></td></tr>`;
    }
    const hin=(k,ph,extra)=>`<input id="lh-${k}" data-t="${k}" placeholder="${ph}" autocomplete="off"${extra||''}${dis}>`;
    box.innerHTML=`<div class="sheet paperlog"><div class="pscroll">
      <div class="lhead">
        <div class="obox"><div class="ol">New Oil Change</div>${hin('oilDate','MM/DD/YYYY',' '+USD_ATTRS)}${hin('oilOdo','millas',' inputmode="numeric"')}</div>
        <div class="lmid"><div class="lt">MONTHLY LOG MILES</div>
          <div class="lrow"><span>COMPANY NAME:</span>${hin('company','nombre de la compañía')}<span>TRUCK # ${esc(t.number)}</span></div>
          <div class="lrow"><span>MONTH OF: ${MONTH[m-1]}</span><span class="sp"></span><span>YEAR: ${y}</span></div>
          <div class="lrow"><span>VIN:</span>${hin('vin','17 caracteres',' maxlength="17" class="up"')}<span>PLATE:</span>${hin('plate','placa',' maxlength="10" class="up plate"')}${hin('plateState','ST',' maxlength="2" class="up st"')}</div></div>
        <div class="obox"><div class="ol">Last Oil Change</div>${hin('prevOilDate','MM/DD/YYYY',' '+USD_ATTRS)}${hin('prevOilOdo','millas',' inputmode="numeric"')}</div>
      </div>
      <table class="plog"><thead><tr><th>Day</th><th>Date</th><th>Driver<br>name</th><th>Dashboard<br>miles</th><th>Total miles<br>driven</th><th>Fuel<br>miles</th><th>Fuel<br>glns.</th><th>Fuel<br>cost</th><th>Price<br>per gal</th><th class="fl"></th></tr></thead>
      <tbody><tr class="carry" id="carryRow"></tr>${rows}<tr class="ptot" id="totRow"></tr></tbody></table></div>
      <div id="logFlags" class="lflags"></div></div>`;
  }
  refreshLog();
}
function refreshLog(){
  const t=S.trucks[S.truckId]; if (!t || !$('#carryRow')) return;
  const [y,m]=S.month.split('-').map(Number), chain=odoChain(S.truckId), pre=S.month;
  // carry-over: last odometer before the month
  const before=truckEntries(S.truckId).filter(e=>e.date<pre+'-01' && e.odo!=null && !e.off).pop();
  const b=before, bm=b?chain.miles[b.date]:null;
  $('#carryRow').innerHTML = b
    ? `<td class="day">${DAY[new Date(b.date+'T12:00').getDay()]}</td><td class="date">${usDate(b.date)}</td><td>${esc(b.driver||'')}</td><td>${fOdo(b.odo)}</td><td>${bm!=null?fOdo(bm):''}</td><td>${fOdo(b.fuelOdo)}</td><td>${b.gal!=null?fGal(b.gal):''}</td><td>${fMoney(costOf(b))}</td><td>${b.price!=null?fPrice(b.price):''}</td><td></td>`
    : `<td></td><td colspan="9">Primer mes: las millas del día 1 se calculan cuando haya una lectura anterior.</td>`;
  const active=document.activeElement;
  for (const k of ['oilDate','oilOdo','company','prevOilDate','prevOilOdo','vin','plate','plateState']) {
    const el=$('#lh-'+k); if (!el || el===active) continue;
    const v=t[k]; el.value = v==null ? '' : (k.endsWith('Odo') ? fOdo(v) : k.endsWith('Date') ? usPad(v) : v);
  }
  const flagList=[];
  document.querySelectorAll('#logBody tr[data-date]').forEach(tr=>{
    const date=tr.dataset.date, e=S.entries[S.truckId+'_'+date];
    const set=(f,v)=>{ const el=tr.querySelector(`[data-f="${f}"]`); if (el!==active) el.value=v??''; };
    set('driver',e?.driver); set('odo',e?.off?'OFF DUTY':(e?.odo!=null?fOdo(e.odo):''));
    set('fuelOdo',e?.fuelOdo!=null?fOdo(e.fuelOdo):''); set('gal',e?.gal!=null?fGal(e.gal):'');
    set('price',e?.price!=null?e.price.toFixed(3):''); set('cost',e?.cost!=null?e.cost.toFixed(2):'');
    tr.classList.toggle('off',!!e?.off);
    tr.querySelector('[data-c="miles"]').textContent = e?.off ? 'OFF DUTY' : (chain.miles[date]!=null ? fOdo(chain.miles[date]) : '');
    const fl=flagsFor(e,chain);
    tr.classList.toggle('flagged',fl.length>0);
    tr.querySelector('[data-c="notes"]').innerHTML = fl.length ? `<span class="dot" title="${esc(fl.map(f=>f[1]).join(' · '))}">!</span>` : '';
    fl.forEach(([k,msg])=>flagList.push(`<li><b>${usDate(date)}</b> <span class="chip ${k}">${esc(msg)}</span></li>`));
  });
  const st=monthStats(S.truckId,y,m);
  $('#totRow').innerHTML=`<td colspan="4">TOTAL ${MONTH[m-1]}</td><td>${fOdo(st.miles)}</td><td></td><td>${fGal(st.gal)}</td><td>${fMoney(st.cost)}</td><td>${avgOf(st)!=null?fPrice(avgOf(st)):''}</td><td></td>`;
  $('#logFlags').innerHTML = flagList.length ? `<h2 class="sec">Para revisar</h2><ul>${flagList.join('')}</ul>` : '';
  // tiles
  let oil='—', oilS='Configura el cambio de aceite en Camiones';
  if (t.oilOdo!=null && chain.current!=null) {
    const since=chain.current-t.oilOdo, intv=t.oilInterval||20000, left=intv-since;
    oil=fOdo(since); oilS = left<0 ? `<span class="chip bad">Vencido por ${fOdo(-left)} mi</span>` : left<1500 ? `<span class="chip warn">Faltan ${fOdo(left)} mi</span>` : `Próximo a ${fOdo(t.oilOdo+intv)}`;
  }
  $('#logTiles').innerHTML=`<div class="tiles">
    <div class="tile"><div class="k">Millas del mes</div><div class="v">${fOdo(st.miles)}</div><div class="s">${st.days} días manejados · ${st.off} off duty</div></div>
    <div class="tile"><div class="k">Galones</div><div class="v">${fGal(st.gal)}</div><div class="s">${st.fuel.length} cargas</div></div>
    <div class="tile"><div class="k">Costo diésel</div><div class="v">${fMoney(st.cost)}</div><div class="s">${st.miles?fMoney(st.cost/st.miles)+' por milla':'&nbsp;'}</div></div>
    <div class="tile"><div class="k">Precio promedio</div><div class="v">${avgOf(st)!=null?fPrice(avgOf(st)):'—'}</div><div class="s">${S.avg==='simple'?'Promedio simple':'Ponderado'}</div></div>
    <div class="tile"><div class="k">Rendimiento</div><div class="v">${st.mpg?st.mpg.toFixed(2):'—'}</div><div class="s">millas por galón</div></div>
    <div class="tile"><div class="k">Desde cambio de aceite</div><div class="v">${oil}</div><div class="s">${oilS}</div></div>
    <div class="tile"><div class="k">Para revisar</div><div class="v">${st.flags}</div><div class="s">${st.flags?'Ver la lista debajo de la hoja':'Todo cuadra'}</div></div></div>`;
}
function saveRow(tr, changed){
  const date=tr.dataset.date, id=S.truckId+'_'+date, t=S.trucks[S.truckId];
  const g=f=>tr.querySelector(`[data-f="${f}"]`);
  const rawOdo=g('odo').value.trim(), off=/^off/i.test(rawOdo);   // "OFF DUTY" typed in the dashboard cell, like on paper
  const d={ truck:S.truckId, date, driver:g('driver').value.trim(), odo:off?null:num(rawOdo), off,
    fuelOdo:num(g('fuelOdo').value), gal:num(g('gal').value), price:num(g('price').value), cost:num(g('cost').value) };
  if (d.gal!=null && d.price!=null && d.cost==null) { d.cost=r2(d.gal*d.price); }
  else if (d.gal && d.cost!=null && d.price==null) { d.price=r3(d.cost/d.gal); }
  if (!d.driver && (d.odo!=null||d.off||d.gal!=null) && t?.driver) d.driver=t.driver;
  const empty = !d.driver && d.odo==null && !d.off && d.fuelOdo==null && d.gal==null && d.price==null && d.cost==null;
  writeEntry(id, empty ? null : d);
  if (S.db) { if (empty) delete S.entries[id]; else S.entries[id]=d; refreshLog(); }
}

// ---------- reports ----------
function quarterReport(t,y,q){
  const months=[3*q-2,3*q-1,3*q], last=months[2];
  const sts=months.map(m=>({m,st:monthStats(t.id,y,m)}));
  const title=(t.model?t.model:'TRUCK #'+t.number).toUpperCase();
  let h=`<div class="rpt"><h1>${QN[q]} QUARTER FUEL TAXES, ${MONTH[last-1]} ${y}</h1><h2>${esc(title)} MILES</h2>
    <div class="meta">${esc(t.company||'')}${t.company?' · ':''}${esc(vehicleLine(t))}</div>`;
  for (const {m,st} of sts) {
    h+=`<h3>${MONTH[m-1]} ${y}, FUELING COST AND GALLONS</h3>`;
    if (!st.fuel.length && st.manualFuel) {
      h+=`<table><thead><tr><th>Date</th><th class="n">Fueling price</th><th class="n">Fueling gallons</th><th class="n">Price per gallon</th></tr></thead><tbody>
        <tr class="tot"><td>TOTAL</td><td class="n">${fMoney(st.cost)}</td><td class="n">${fGal(st.gal)}</td><td class="n">${avgOf(st)!=null?fPrice(avgOf(st)):''}</td></tr></tbody></table>
        <div class="meta">Miles driven: <b>${fOdo(st.miles)}</b>${st.mpg?` · MPG: <b>${st.mpg.toFixed(2)}</b>`:''}</div>`; continue; }
    if (!st.fuel.length) { h+=`<p class="meta">No fueling recorded.</p>`; continue; }
    h+=`<table><thead><tr><th>Date</th><th class="n">Fueling price</th><th class="n">Fueling gallons</th><th class="n">Price per gallon</th></tr></thead><tbody>`;
    for (const f of st.fuel) h+=`<tr><td>${usDate(f.date)}</td><td class="n">${fMoney(f.cost)}</td><td class="n">${fGal(f.gal)}</td><td class="n">${fPrice(f.price)}</td></tr>`;
    h+=`<tr class="tot"><td>TOTAL</td><td class="n">${fMoney(st.cost)}</td><td class="n">${fGal(st.gal)}</td><td class="n">${fPrice(avgOf(st))}</td></tr></tbody></table>
      <div class="meta">Miles driven: <b>${fOdo(st.miles)}</b>${st.mpg?` · MPG: <b>${st.mpg.toFixed(2)}</b>`:''}</div>`;
  }
  h+=quarterTail(t,y,q,sts,false)+`<p class="meta">Price per gallon: ${S.avg==='simple'?'simple average of fueling prices':'total cost ÷ total gallons'}.</p></div>`;
  return h;
}
function logReport(t,y,m){
  const chain=odoChain(t.id), n=dim(y,m);
  const before=truckEntries(t.id).filter(e=>e.date<`${y}-${pad(m)}-01` && e.odo!=null && !e.off).pop();
  let rows='';
  if (before) rows+=`<tr><td>${DAY[new Date(before.date).getUTCDay()]}</td><td>${usDate(before.date)}</td><td>${esc(before.driver||'')}</td><td class="n">${fOdo(before.odo)}</td><td class="n">${chain.miles[before.date]!=null?fOdo(chain.miles[before.date]):''}</td><td class="n">${fOdo(before.fuelOdo)}</td><td class="n">${before.gal!=null?fGal(before.gal):''}</td><td class="n">${fMoney(costOf(before))}</td><td class="n">${before.price!=null?fPrice(before.price):''}</td></tr>`;
  for (let d=1; d<=n; d++) {
    const date=`${y}-${pad(m)}-${pad(d)}`, wd=new Date(y,m-1,d).getDay(), e=S.entries[t.id+'_'+date]||{};
    const odo = e.off ? 'OFF DUTY' : fOdo(e.odo), mi = e.off ? 'OFF DUTY' : (chain.miles[date]!=null?fOdo(chain.miles[date]):'');
    rows+=`<tr class="${wd===0&&d>1?'sun':''}"><td>${DAY[wd]}</td><td>${usDate(date)}</td><td>${esc(e.driver||'')}</td><td class="n">${odo}</td><td class="n">${mi}</td><td class="n">${fOdo(e.fuelOdo)}</td><td class="n">${e.gal!=null?fGal(e.gal):''}</td><td class="n">${fMoney(costOf(e))}</td><td class="n">${e.price!=null?fPrice(e.price):''}</td></tr>`;
  }
  const st=monthStats(t.id,y,m);
  rows+=`<tr class="tot"><td colspan="4">TOTAL ${MONTH[m-1]}</td><td class="n">${fOdo(st.miles)}</td><td></td><td class="n">${fGal(st.gal)}</td><td class="n">${fMoney(st.cost)}</td><td class="n">${avgOf(st)!=null?fPrice(avgOf(st)):''}</td></tr>`;
  const oil = t.oilDate ? `New oil change: ${usDate(t.oilDate)} @ ${fOdo(t.oilOdo)}` : '';
  const prev = t.prevOilDate ? `Last oil change: ${usDate(t.prevOilDate)} @ ${fOdo(t.prevOilOdo)}` : '';
  return `<div class="rpt log"><h1>MONTHLY LOG MILES — ${MONTH[m-1]} ${y}</h1>
    <div class="meta">Company: ${esc(t.company||'')} · ${esc(vehicleLine(t))}</div>
    <div class="meta">${[oil,prev].filter(Boolean).join(' · ')}</div><br>
    <table><thead><tr><th>Day</th><th>Date</th><th>Driver</th><th class="n">Dashboard miles</th><th class="n">Total miles driven</th><th class="n">Fuel miles</th><th class="n">Fuel glns.</th><th class="n">Fuel cost</th><th class="n">Price/gal</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="meta">Miles: ${fOdo(st.miles)} · Gallons: ${fGal(st.gal)} · MPG: ${st.mpg?st.mpg.toFixed(2):'—'}</p></div>`;
}
// ---------- PDF (jsPDF + autotable) ----------
function makePdf(build){
  if (!window.jspdf || !window.jspdf.jsPDF) { toast('No se pudo preparar el PDF. Recarga la página e intenta de nuevo.'); return null; }
  try { return build().output('arraybuffer'); } catch(e){ console.error(e); toast('No se pudo generar el PDF.'); return null; }
}
const PDF_M=54;
function pdfBase(orientation){
  const doc=new window.jspdf.jsPDF({unit:'pt',format:'letter',orientation});
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
  const st={doc,W,H,Y:PDF_M};
  st.center=(s,size,bold)=>{ doc.setFont('helvetica',bold?'bold':'normal'); doc.setFontSize(size); doc.setTextColor(17); doc.text(String(s),W/2,st.Y,{align:'center'}); st.Y+=size+5; };
  st.room=need=>{ if (st.Y+need>H-PDF_M) { doc.addPage(); st.Y=PDF_M; } };
  st.table=(opts)=>{ doc.autoTable({theme:'plain',startY:st.Y,margin:{left:PDF_M,right:PDF_M},
      styles:{font:'helvetica',fontSize:10,cellPadding:{top:2.5,bottom:2.5,left:5,right:5},textColor:17},
      headStyles:{fontStyle:'bold',fontSize:8.5},
      footStyles:{fontStyle:'bold',fontSize:11,lineWidth:{top:1},lineColor:30},
      ...opts}); st.Y=doc.lastAutoTable.finalY+6; };
  st.note=(s)=>{ doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60); doc.text(String(s),W/2,st.Y+4,{align:'center'}); st.Y+=16; };
  st.footer=()=>{ const n=doc.getNumberOfPages(); for (let i=1;i<=n;i++){ doc.setPage(i); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(110);
      doc.text(`Page ${i} of ${n}`, W-PDF_M, H-28, {align:'right'}); } };
  return st;
}
const RIGHT={halign:'right'};
function quarterPdf(t,y,q){
  const P=pdfBase('portrait'), months=[3*q-2,3*q-1,3*q], last=months[2];
  const sts=months.map(m=>({m,st:monthStats(t.id,y,m)})), qo=quarterOdo(t.id,y,q);
  P.center(`${QN[q]} QUARTER FUEL TAXES, ${MONTH[last-1]} ${y}`,13,true);
  P.center(`${(t.model||'TRUCK #'+t.number).toUpperCase()} MILES`,12,true);
  P.center(`${t.company?t.company+'  -  ':''}${vehicleLine(t).replace(/ · /g,'  -  ')}`,9);
  P.Y+=4;
  const cols={1:RIGHT,2:RIGHT,3:RIGHT};
  for (const {m,st} of sts) {
    P.room(80);
    P.Y+=8; P.center(`${MONTH[m-1]} ${y}, FUELING COST AND GALLONS`,11.5,true);
    if (!st.fuel.length && !st.manualFuel) { P.note('No fueling recorded.'); continue; }
    P.table({head:[['DATE','FUELING PRICE','FUELING GALLONS','PRICE PER GALLON']], columnStyles:cols,
      body: st.fuel.map(f=>[usDate(f.date),fMoney(f.cost),fGal(f.gal),fPrice(f.price)]),
      foot:[['TOTAL',fMoney(st.cost),fGal(st.gal),avgOf(st)!=null?fPrice(avgOf(st)):'']],
      headStyles:{fontStyle:'bold',fontSize:8.5,halign:'right'}, didParseCell:d=>{ if (d.column.index===0) d.cell.styles.halign='left'; else if (d.section!=='body') d.cell.styles.halign='right'; }});
    P.note(`Miles driven: ${st.miles?fOdo(st.miles):'-'}${st.mpg?'   |   MPG: '+st.mpg.toFixed(2):''}`);
  }
  // quarter miles = closing - opening odometer
  const T={cost:0,gal:0,miles:0,avgs:[]};
  for (const {st} of sts) { T.cost+=st.cost; T.gal+=st.gal; T.miles+=st.miles; if (avgOf(st)!=null) T.avgs.push(avgOf(st)); }
  T.cost=r2(T.cost); T.gal=r3(T.gal);
  const qMiles = qo.miles!=null ? qo.miles : T.miles;
  const tAvg = S.avg==='simple' ? (T.avgs.length?T.avgs.reduce((a,b)=>a+b,0)/T.avgs.length:null) : (T.gal?T.cost/T.gal:null);
  const align=d=>{ if (d.column.index>0) d.cell.styles.halign='right'; };
  P.room(110); P.Y+=8; P.center(`${QN[q]} QUARTER MILES AND FUELING COST`,11.5,true);
  P.table({head:[['DATE','MILES','FUELING PRICE']], didParseCell:align,
    body:[[qo.endDate?usDate(qo.endDate):'',fOdo(qo.end),''],[qo.startDate?usDate(qo.startDate):'',fOdo(qo.start),'']],
    foot:[['TOTAL',qo.miles!=null?fOdo(qo.miles):'-',fMoney(T.cost)]]});
  P.room(130); P.Y+=8; P.center(`${QN[q]} QUARTER TOTAL FUELING COST AND GALLONS`,11.5,true);
  P.table({head:[['MONTH','FUELING COST','FUELING GALLONS','PRICE PER GALLON','MILES','MPG']], didParseCell:align,
    body: sts.map(({m,st})=>[MONTH[m-1],fMoney(st.cost),fGal(st.gal),avgOf(st)!=null?fPrice(avgOf(st)):'-',st.miles?fOdo(st.miles):'-',st.mpg?st.mpg.toFixed(2):'-']),
    foot:[['TOTAL',fMoney(T.cost),fGal(T.gal),tAvg!=null?fPrice(tAvg):'-',qMiles?fOdo(qMiles):'-',T.gal&&qMiles?(qMiles/T.gal).toFixed(2):'-']]});
  P.note(`Quarter miles = closing odometer - opening odometer.  Price per gallon: ${S.avg==='simple'?'simple average of fueling prices':'total cost / total gallons'}.`);
  P.footer();
  return P.doc;
}
function logPdf(t,y,m){
  const P=pdfBase('landscape'), doc=P.doc, W=P.W, chain=odoChain(t.id), n=dim(y,m), st=monthStats(t.id,y,m);
  // header box like the paper form
  const x0=PDF_M, w=W-2*PDF_M, bw=130, top=P.Y-14, hh=76;
  doc.setDrawColor(30); doc.setLineWidth(1.2); doc.rect(x0,top,w,hh); doc.line(x0+bw,top,x0+bw,top+hh); doc.line(x0+w-bw,top,x0+w-bw,top+hh);
  const txt=(s,x,yy,size,bold,align)=>{ doc.setFont('helvetica',bold?'bold':'normal'); doc.setFontSize(size); doc.setTextColor(17); doc.text(String(s),x,yy,{align:align||'left'}); };
  txt('NEW OIL CHANGE',x0+bw/2,top+13,7.5,true,'center');
  txt(t.oilDate?usDate(t.oilDate):'',x0+bw/2,top+30,11,false,'center'); txt(t.oilOdo!=null?fOdo(t.oilOdo):'',x0+bw/2,top+47,11,false,'center');
  txt('LAST OIL CHANGE',x0+w-bw/2,top+13,7.5,true,'center');
  txt(t.prevOilDate?usDate(t.prevOilDate):'',x0+w-bw/2,top+30,11,false,'center'); txt(t.prevOilOdo!=null?fOdo(t.prevOilOdo):'',x0+w-bw/2,top+47,11,false,'center');
  const mx=x0+bw, mw=w-2*bw;
  txt('MONTHLY LOG MILES',mx+mw/2,top+15,13,true,'center');
  doc.setLineWidth(.6); doc.line(mx,top+21,mx+mw,top+21); doc.line(mx,top+40,mx+mw,top+40);
  txt(`COMPANY NAME: ${t.company||''}`,mx+8,top+34,9.5,true); txt(`TRUCK # ${t.number}`,mx+mw-8,top+34,9.5,true,'right');
  txt(`MONTH OF: ${MONTH[m-1]}`,mx+8,top+53,9.5,true); txt(`YEAR: ${y}`,mx+mw-8,top+53,9.5,true,'right');
  doc.line(mx,top+59,mx+mw,top+59);
  txt(`VIN: ${t.vin||''}`,mx+8,top+71,9.5,true); txt(`PLATE: ${t.plate||''}${t.plateState?' ('+t.plateState+')':''}`,mx+mw-8,top+71,9.5,true,'right');
  P.Y=top+hh;
  const before=truckEntries(t.id).filter(e=>e.date<`${y}-${pad(m)}-01` && e.odo!=null && !e.off).pop();
  const row=(date,e,carry)=>{ const wd=new Date(date+'T12:00').getDay(), mi=chain.miles[date];
    return {sun: !carry && wd===0 && date.slice(8)!=='01', carry, cells:[DAY[wd],usDate(date),e?.driver||'', e?.off?'OFF DUTY':fOdo(e?.odo), e?.off?'OFF DUTY':(mi!=null?fOdo(mi):''),
      fOdo(e?.fuelOdo), e?.gal!=null?fGal(e.gal):'', fMoney(costOf(e||{})), e?.price!=null?fPrice(e.price):''] }; };
  const rows=[]; if (before) rows.push(row(before.date,before,true));
  for (let d=1; d<=n; d++) { const date=`${y}-${pad(m)}-${pad(d)}`; rows.push(row(date,S.entries[t.id+'_'+date],false)); }
  doc.autoTable({theme:'grid',startY:P.Y,margin:{left:PDF_M,right:PDF_M},
    head:[['DAY','DATE','DRIVER NAME','DASHBOARD MILES','TOTAL MILES DRIVEN','FUEL MILES','FUEL GLNS.','FUEL COST','PRICE PER GAL']],
    body:rows.map(r=>r.cells),
    foot:[[{content:`TOTAL ${MONTH[m-1]}`,colSpan:4},fOdo(st.miles),'',fGal(st.gal),fMoney(st.cost),avgOf(st)!=null?fPrice(avgOf(st)):'']],
    styles:{font:'helvetica',fontSize:8.5,halign:'center',cellPadding:1.8,lineColor:30,lineWidth:.6,textColor:17},
    headStyles:{fillColor:false,fontStyle:'bold',fontSize:7.5,valign:'middle'},
    footStyles:{fillColor:[236,239,244],fontStyle:'bold',fontSize:9.5},
    columnStyles:{0:{cellWidth:30},1:{cellWidth:62}},
    didParseCell:d=>{ if (d.section!=='body') return; const r=rows[d.row.index];
      if (r.carry) d.cell.styles.fillColor=[243,245,248];
      if (r.sun) d.cell.styles.lineWidth={top:2,right:.6,bottom:.6,left:.6}; }});
  P.Y=doc.lastAutoTable.finalY+6;
  P.note(`Miles: ${fOdo(st.miles)}   |   Gallons: ${fGal(st.gal)}   |   Fuel cost: ${fMoney(st.cost)}   |   MPG: ${st.mpg?st.mpg.toFixed(2):'-'}`);
  P.footer();
  return doc;
}
function standalone(title, body){
  const css=[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n').split('/* report')[1]||'';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>/* report${css.replace(/@media \(max-width[\s\S]*$/,'')}
body{margin:0;padding:24px;background:#fff} @page{size:letter;margin:.5in} @media print{body{padding:0}}</style></head><body>${body}</body></html>`;
}
function offer(filename, data){
  const type = filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/octet-stream';
  const url=URL.createObjectURL(new Blob([data],{type}));
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  toast('Descargando '+filename);
}
function csvFor(tid, from, to){
  const chain=odoChain(tid), q=v=>v==null?'':`"${String(v).replace(/"/g,'""')}"`;
  const t=S.trucks[tid]||{}, veh=[q(t.number),q(t.vin),q(t.plate),q(t.plateState)].join(',');
  const lines=['Truck,VIN,Plate,Plate state,Date,Driver,Dashboard miles,Miles driven,Off duty,Fuel miles,Gallons,Price per gallon,Fuel cost'];
  for (const e of truckEntries(tid)) if (e.date>=from && e.date<=to)
    lines.push([veh,usDate(e.date),q(e.driver),e.odo??'',chain.miles[e.date]??'',e.off?'YES':'',e.fuelOdo??'',e.gal??'',e.price??'',costOf(e)??''].join(','));
  return lines.join('\r\n');
}
// editable report sheet: same layout as the printed report, with inputs
function quarterEdit(t,y,q){
  const months=[3*q-2,3*q-1,3*q], last=months[2], dis=S.canWrite?'':' disabled';
  const title=(t.model?t.model:'TRUCK #'+t.number).toUpperCase();
  const inp=(id,v,cls,ph)=>`<input type="text" id="${id}" class="${cls||''}" value="${esc(v)}" placeholder="${ph||''}" inputmode="decimal" autocomplete="off"${dis}>`;
  let h=`<div class="rpt edit"><h1>${QN[q]} QUARTER FUEL TAXES, ${MONTH[last-1]} ${y}</h1><h2>${esc(title)} MILES</h2>
    <div class="meta">${esc(t.company||'')}${t.company?' · ':''}${esc(vehicleLine(t))}</div>`;
  const sts=[];
  for (const m of months) {
    const ym=`${y}-${pad(m)}`, st=monthStats(t.id,y,m), man=S.months[t.id+'_'+ym]||{}; sts.push({m,st});
    const min=`${ym}-01`, max=`${ym}-${pad(dim(y,m))}`;
    h+=`<h3>${MONTH[m-1]} ${y}, FUELING COST AND GALLONS</h3>
      <table><thead><tr><th>Date</th><th class="n">Fueling price</th><th class="n">Fueling gallons</th><th class="n">Price per gallon</th><th class="x"></th></tr></thead><tbody data-ym="${ym}">`;
    for (const f of st.fuel) {
      const p=`r-${f.date}`;
      h+=`<tr data-date="${f.date}"><td><input type="text" ${USD_ATTRS} id="${p}-date" data-k="date" value="${usPad(f.date)}"${dis}></td>
        <td class="n">${inp(p+'-cost',f.cost.toFixed(2),'n" data-k="cost')}</td><td class="n">${inp(p+'-gal',fGal(f.gal),'n" data-k="gal')}</td>
        <td class="n">${inp(p+'-price',f.price.toFixed(3),'n" data-k="price')}</td>
        <td class="x">${S.canWrite?`<button type="button" class="rm" data-rm="${f.date}" aria-label="Borrar carga del ${usDate(f.date)}">×</button>`:''}</td></tr>`;
    }
    if (S.canWrite) h+=`<tr class="new" data-new="${ym}"><td><input type="text" ${USD_ATTRS} id="n-${ym}-date" data-k="date"></td>
        <td class="n">${inp(`n-${ym}-cost`,'','n" data-k="cost','$ costo')}</td><td class="n">${inp(`n-${ym}-gal`,'','n" data-k="gal','galones')}</td>
        <td class="n">${inp(`n-${ym}-price`,'','n" data-k="price','$/gal')}</td><td class="x"></td></tr>`;
    if (st.fuel.length) {
      h+=`<tr class="tot"><td>TOTAL</td><td class="n">${fMoney(st.cost)}</td><td class="n">${fGal(st.gal)}</td><td class="n">${fPrice(avgOf(st))}</td><td></td></tr>`;
    } else {
      h+=`<tr class="tot man" data-man="${ym}"><td>TOTAL <span class="mhint">(solo totales)</span></td>
        <td class="n">${inp(`m-${ym}-cost`,man.cost!=null?man.cost.toFixed(2):'','n" data-k="cost','$ total')}</td>
        <td class="n">${inp(`m-${ym}-gal`,man.gal!=null?fGal(man.gal):'','n" data-k="gal','galones')}</td>
        <td class="n">${inp(`m-${ym}-price`,man.price!=null?man.price.toFixed(3):'','n" data-k="price','$/gal')}</td><td></td></tr>`;
    }
    h+=`</tbody></table><div class="meta">Miles driven: `;
    h+= st.odoMiles ? `<b>${fOdo(st.miles)}</b> <span class="mhint">(de la bitácora)</span>`
      : `<span data-man="${ym}">${inp(`m-${ym}-miles`,man.miles!=null?fOdo(man.miles):'','n mi" data-k="miles','millas')}</span>`;
    h+= st.mpg ? ` · MPG: <b>${st.mpg.toFixed(2)}</b>` : '';
    h+=`</div>`;
  }
  h+=quarterTail(t,y,q,sts,true)+`</div>`;
  return h;
}
// quarter miles block (odometers) + quarter summary; shared by the editable sheet and the download
function quarterTail(t,y,q,sts,edit){
  const qo=quarterOdo(t.id,y,q), key=`${y}-Q${q}`, dis=S.canWrite?'':' disabled';
  const T={cost:0,gal:0,miles:0,avgs:[]};
  for (const {st} of sts) { T.cost+=st.cost; T.gal+=st.gal; T.miles+=st.miles; if (avgOf(st)!=null) T.avgs.push(avgOf(st)); }
  T.cost=r2(T.cost); T.gal=r3(T.gal);
  const qMiles = qo.miles!=null ? qo.miles : T.miles;
  const src = s => s==='log' ? 'de la bitácora' : s==='prev' ? 'cierre del trimestre anterior' : s==='manual' ? 'escrito a mano' : 'falta';
  const cell=(which)=>{
    const d=qo[which+'Date'], o=qo[which];
    if (!edit) return `<td>${d?usDate(d):''}</td><td class="n">${fOdo(o)}</td>`;
    return `<td><input type="text" ${USD_ATTRS} id="q-${key}-${which}Date" data-q="${key}" data-k="${which}Date" value="${usPad(d)}"${dis}></td>
      <td class="n"><input type="text" class="n" id="q-${key}-${which}" data-q="${key}" data-k="${which}" value="${o!=null?fOdo(o):''}" placeholder="odómetro" inputmode="numeric"${dis}>
      <div class="mhint">${src(qo[which+'Src'])}</div></td>`;
  };
  let h=`<h3>${QN[q]} QUARTER MILES AND FUELING COST</h3>
    <table><thead><tr><th>Date</th><th class="n">Miles</th><th class="n">Fueling price</th></tr></thead><tbody>
    <tr>${cell('end')}<td></td></tr>
    <tr>${cell('start')}<td></td></tr>
    <tr class="tot"><td>TOTAL</td><td class="n">${qo.miles!=null?fOdo(qo.miles):'—'}</td><td class="n">${fMoney(T.cost)}</td></tr></tbody></table>`;
  if (edit && qo.miles!=null && qo.miles<0) h+=`<p class="meta flag">El odómetro final es menor que el inicial.</p>`;
  h+=`<h3>${QN[q]} QUARTER TOTAL FUELING COST AND GALLONS</h3><table><thead><tr><th>Month</th><th class="n">Fueling cost</th><th class="n">Fueling gallons</th><th class="n">Price per gallon</th><th class="n">Miles</th><th class="n">MPG</th></tr></thead><tbody>`;
  for (const {m,st} of sts)
    h+=`<tr><td>${MONTH[m-1]}</td><td class="n">${fMoney(st.cost)}</td><td class="n">${fGal(st.gal)}</td><td class="n">${avgOf(st)!=null?fPrice(avgOf(st)):'—'}</td><td class="n">${st.miles?fOdo(st.miles):'—'}</td><td class="n">${st.mpg?st.mpg.toFixed(2):'—'}</td></tr>`;
  const tAvg = S.avg==='simple' ? (T.avgs.length?T.avgs.reduce((a,b)=>a+b,0)/T.avgs.length:null) : (T.gal?T.cost/T.gal:null);
  h+=`<tr class="tot"><td>TOTAL</td><td class="n">${fMoney(T.cost)}</td><td class="n">${fGal(T.gal)}</td><td class="n">${tAvg!=null?fPrice(tAvg):'—'}</td><td class="n">${qMiles?fOdo(qMiles):'—'}</td><td class="n">${T.gal&&qMiles?(qMiles/T.gal).toFixed(2):'—'}</td></tr></tbody></table>`;
  if (qo.miles!=null) h+=`<p class="meta">Quarter miles = closing odometer − opening odometer${qo.miles!==T.miles && T.miles?` (monthly logs add up to ${fOdo(T.miles)})`:''}.</p>`;
  return h;
}
function writeQuarter(key, patch){
  const id=S.truckId+'_'+key, d={truck:S.truckId, q:key, startDate:null, startOdo:null, endDate:null, endOdo:null, ...(S.quarters[id]||{}), ...patch};
  const empty = d.startOdo==null && d.endOdo==null;
  if (empty) delete S.quarters[id]; else S.quarters[id]=d;
  if (!S.db) return;
  const ref=S.db.collection('quarters').doc(id);
  S.chains[id]=(S.chains[id]||Promise.resolve()).then(()=> empty ? ref.delete() : ref.set(d)).catch(()=>toast('No se pudo guardar. Revisa tu conexión.'));
}
function renderReport(){
  const box=$('#rptBox'), t=S.trucks[S.truckId];
  const a=document.activeElement, keep = a && box.contains(a) && a.id ? {id:a.id, v:a.value, s:a.selectionStart, e:a.selectionEnd} : null;
  const drafts={}; box.querySelectorAll('tr.new input').forEach(i=>{ if (i.value) drafts[i.id]=i.value; });
  box.innerHTML = t ? quarterEdit(t,S.year,S.q) : `<p style="text-align:center">Agrega un camión para llenar el reporte.</p>`;
  for (const [id,v] of Object.entries(drafts)) { const i=document.getElementById(id); if (i) i.value=v; }
  if (keep) { const i=document.getElementById(keep.id); if (i && i.value!==keep.v && !S.focusNext) i.value=keep.v; }
  const target = S.focusNext ? document.getElementById(S.focusNext) : keep && document.getElementById(keep.id);
  S.focusNext=null;
  if (target) { target.focus(); try { if (keep && target.id===keep.id && keep.s!=null) target.setSelectionRange(keep.s,keep.e); } catch(e){} }
}
const BLANK = {fuelOdo:null,gal:null,price:null,cost:null};
function patchEntry(date, patch){
  const id=S.truckId+'_'+date;
  const d={truck:S.truckId,date,driver:'',odo:null,off:false,fuelOdo:null,gal:null,price:null,cost:null,...(S.entries[id]||{}),...patch};
  const empty = !d.driver && d.odo==null && !d.off && d.fuelOdo==null && d.gal==null && d.price==null && d.cost==null;
  if (S.db) { if (empty) delete S.entries[id]; else S.entries[id]=d; }
  writeEntry(id, empty?null:d);
}
function completeFuel(v){
  if (v.gal!=null && v.price!=null && v.cost==null) v.cost=r2(v.gal*v.price);
  else if (v.gal && v.cost!=null && v.price==null) v.price=r3(v.cost/v.gal);
  else if (v.price && v.cost!=null && v.gal==null) v.gal=r3(v.cost/v.price);
  return v;
}
function writeMonth(ym, patch){
  const id=S.truckId+'_'+ym, d={truck:S.truckId, ym, cost:null, gal:null, price:null, miles:null, ...(S.months[id]||{}), ...patch};
  const empty = d.cost==null && d.gal==null && d.price==null && d.miles==null;
  if (empty) delete S.months[id]; else S.months[id]=d;
  if (!S.db) return;
  const ref=S.db.collection('months').doc(id);
  S.chains[id]=(S.chains[id]||Promise.resolve()).then(()=> empty ? ref.delete() : ref.set(d)).catch(()=>toast('No se pudo guardar. Revisa tu conexión.'));
}
const later = () => setTimeout(refreshAll, 0);
function onReportChange(e){
  if (!S.canWrite) return;
  const el=e.target, tr=el.closest('tr'), val=k=>{ const x=tr.querySelector(`[data-k="${k}"]`); return x ? num(x.value) : null; };
  // quarter opening/closing odometer: an odometer and its date are saved together
  if (el.dataset.q) {
    const key=el.dataset.q, k=el.dataset.k, which=k.replace('Date',''), oEl=$(`#q-${key}-${which}`), dEl=$(`#q-${key}-${which}Date`);
    const odo=num(oEl.value);
    writeQuarter(key, {[which+'Odo']:odo, [which+'Date']: odo==null ? null : (isoOf(dEl.value)||null)});
    return later();
  }
  // manual month totals / miles
  const manBox=el.closest('[data-man]');
  if (manBox) {
    const ym=manBox.dataset.man;
    if (el.dataset.k==='miles') writeMonth(ym,{miles:num(el.value)});
    else { const v=completeFuel({cost:val('cost'),gal:val('gal'),price:val('price')}); writeMonth(ym,v); }
    return later();
  }
  if (!tr) return;
  const date=isoOf(tr.querySelector('[data-k="date"]').value);
  const v={cost:val('cost'),gal:val('gal'),price:val('price')};
  if (tr.dataset.new) {
    const filled=[v.cost,v.gal,v.price].filter(x=>x!=null).length;
    if (!date || filled<2) return;               // wait until the row is complete
    if (S.entries[S.truckId+'_'+date]?.gal!=null) { toast(`Ya hay una carga el ${usDate(date)}. Edítala en su renglón.`); return; }
    completeFuel(v);
    tr.querySelectorAll('input').forEach(i=>i.value='');
    patchEntry(date,v);
    S.focusNext=`n-${tr.dataset.new}-date`;
    toast(`Carga del ${usDate(date)} agregada.`);
    return later();
  }
  const old=tr.dataset.date;
  if (el.dataset.k==='date') {
    if (!date || date===old) return later();
    if (S.entries[S.truckId+'_'+date]?.gal!=null) { toast(`Ya hay una carga el ${usDate(date)}.`); return later(); }
    const cur=S.entries[S.truckId+'_'+old]||{};
    patchEntry(date,{gal:cur.gal,price:cur.price,cost:cur.cost,fuelOdo:cur.fuelOdo??null});
    patchEntry(old,BLANK);
    S.focusNext=`r-${date}-date`;
    return later();
  }
  // edited one value: recompute the dependent one
  const k=el.dataset.k;
  if (k==='price' && v.gal!=null && v.price!=null) v.cost=r2(v.gal*v.price);
  else if ((k==='cost'||k==='gal') && v.gal && v.cost!=null) v.price=r3(v.cost/v.gal);
  if (v.gal==null && v.cost==null) { patchEntry(old,BLANK); return later(); }
  patchEntry(old,v); later();
}

// ---------- today: one-day form for the driver ----------
const todayStr = () => { const n=new Date(); return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`; };
const tdFuelVals = () => completeFuel({gal:num($('#tdGal').value), price:num($('#tdPrice').value), cost:num($('#tdCost').value)});
function loadToday(force){
  if (S.tdDirty && !force) { renderTodayCalc(); renderRecent(); return; }
  const t=S.trucks[S.truckId], date=isoOf($('#tdDate').value), e=t ? S.entries[S.truckId+'_'+date] : null;
  $('#tdDriver').value = e?.driver || t?.driver || '';
  $('#tdOff').checked = !!e?.off;
  $('#tdOdo').value = e?.odo!=null ? fOdo(e.odo) : '';
  const hasFuel = e?.gal!=null;
  $('#tdFuel').checked = hasFuel;
  $('#tdGal').value = hasFuel ? fGal(e.gal) : '';
  $('#tdPrice').value = e?.price!=null ? e.price.toFixed(3) : '';
  $('#tdCost').value = e?.cost!=null ? e.cost.toFixed(2) : '';
  $('#tdFuelOdo').value = e?.fuelOdo!=null ? fOdo(e.fuelOdo) : '';
  $('#tdSave').textContent = e ? 'Actualizar el día' : 'Guardar el día';
  $('#todayForm').querySelectorAll('input,button').forEach(x=>x.disabled=!S.canWrite || !t);
  S.tdDirty=false;
  renderTodayCalc(); renderRecent();
}
function renderTodayCalc(){
  const date=isoOf($('#tdDate').value), off=$('#tdOff').checked, fuel=$('#tdFuel').checked;
  $('#tdMilesBox').hidden=off; $('#tdFuelBox').hidden=!fuel;
  const prev = S.truckId && date ? lastOdoEntry(S.truckId, date) : null, odo=num($('#tdOdo').value);
  let h='';
  if (!prev) h = odo!=null ? 'Primer registro de este camión: las millas se calculan a partir del siguiente día.' : '';
  else if (odo==null) h = `Última lectura: <b>${fOdo(prev.odo)}</b> el ${usDate(prev.date)}`;
  else { const m=odo-prev.odo;
    h = m<0 ? `<span class="chip bad">Es menor que la última lectura: ${fOdo(prev.odo)} el ${usDate(prev.date)}</span>`
            : `Recorriste <b>${fOdo(m)}</b> millas desde el ${usDate(prev.date)} (${fOdo(prev.odo)})${m>900?' <span class="chip warn">revisa: más de 900</span>':''}`; }
  $('#tdMiles').innerHTML=h;
  if (fuel) {
    const raw={gal:num($('#tdGal').value),price:num($('#tdPrice').value),cost:num($('#tdCost').value)}, v=tdFuelVals();
    let f = v.gal && v.cost!=null ? `${fGal(v.gal)} gal × ${fPrice(v.price)} = <b>${fMoney(v.cost)}</b>` : 'Con dos de los tres (galones, precio, total) el tercero se calcula.';
    if (raw.gal!=null && raw.price!=null && raw.cost!=null && Math.abs(raw.gal*raw.price-raw.cost)>0.05) f += ` <span class="chip warn">galones × precio da ${fMoney(r2(raw.gal*raw.price))}</span>`;
    $('#tdFuelCalc').innerHTML=f;
  }
}
function renderRecent(){
  const box=$('#tdRecent');
  if (!S.trucks[S.truckId]) { box.innerHTML='<div class="empty"><b>Sin camiones</b>Agrega un camión en la pestaña Camiones.</div>'; return; }
  const chain=odoChain(S.truckId), list=truckEntries(S.truckId).slice(-7).reverse();
  box.innerHTML = list.length ? list.map(e=>`<button type="button" class="day" data-date="${e.date}">
      <span class="d">${DIA[new Date(e.date+'T12:00').getDay()]} ${usDate(e.date)}</span>
      <span class="m">${e.off?'OFF DUTY':(e.odo!=null?fOdo(e.odo):'')}</span>
      <span class="m">${chain.miles[e.date]!=null?fOdo(chain.miles[e.date])+' mi':''}</span>
      <span class="s">${e.gal!=null?`Diésel ${fGal(e.gal)} gal · ${fMoney(costOf(e))}`:'Sin carga de diésel'}${e.driver?' · '+esc(e.driver):''}</span></button>`).join('')
    : '<div class="empty">Todavía no hay días guardados.</div>';
}
function saveToday(ev){
  ev.preventDefault();
  const st=$('#tdStatus'), err=msg=>{ st.className='tdstatus err'; st.textContent=msg; };
  st.className='tdstatus';
  if (!S.canWrite) return err('Tienes acceso de solo lectura.');
  if (!S.trucks[S.truckId]) return err('Primero agrega un camión en la pestaña Camiones.');
  const date=isoOf($('#tdDate').value); if (!date) return err('Escribe la fecha como MM/DD/YYYY.');
  const off=$('#tdOff').checked, odo=off?null:num($('#tdOdo').value), fuel=$('#tdFuel').checked;
  let v={gal:null,price:null,cost:null,fuelOdo:null};
  if (fuel) { v=tdFuelVals(); v.fuelOdo=num($('#tdFuelOdo').value); if (!v.gal || v.cost==null) return err('Para el diésel escribe galones y precio, o galones y total pagado.'); }
  if (!off && odo==null && !fuel) return err('Escribe el odómetro del tablero, o marca que no trabajaste.');
  const prev=lastOdoEntry(S.truckId,date);
  if (odo!=null && prev && odo<prev.odo) return err(`El odómetro ${fOdo(odo)} es menor que la última lectura (${fOdo(prev.odo)} el ${usDate(prev.date)}). Revísalo.`);
  const m = odo!=null && prev ? odo-prev.odo : null;
  S.tdDirty=false;
  patchEntry(date,{driver:$('#tdDriver').value.trim(), off, odo, ...v});
  st.className='tdstatus';
  st.textContent = off ? `Guardado: ${usDate(date)}, off duty.` : `Guardado: ${usDate(date)}${m!=null?` · ${fOdo(m)} millas`:''}${fuel?` · diésel ${fMoney(v.cost)}`:''}.`;
  later();
}

// ---------- import: read photos of filled sheets with OCR.space ----------
// The photo goes to the Supabase function "read-sheet" (it holds the OCR.space key); the text that
// comes back is sorted into columns here, and the review screen flags anything that doesn't add up.
const IMP = { jobs:[], seq:0, busy:false, ocr:null };
if (location.hostname==='127.0.0.1' || location.hostname==='localhost') window.__bcImp=IMP;   // local testing hook only

async function toJpegDataUrl(file){
  // OCR.space's free plan takes files up to 1 MB: shrink to a long side of 2200 px and lower quality until it fits
  const bmp=await createImageBitmap(file);
  let scale=Math.min(1, 2200/Math.max(bmp.width,bmp.height));
  for (let tries=0; tries<8; tries++) {
    const c=document.createElement('canvas'); c.width=Math.round(bmp.width*scale); c.height=Math.round(bmp.height*scale);
    const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); g.drawImage(bmp,0,0,c.width,c.height);
    for (const q of [.88,.78,.68]) { const url=c.toDataURL('image/jpeg',q); if (url.length*0.75 < 990000) return url; }
    scale*=0.82;
  }
  throw new Error('La foto es demasiado grande.');
}
IMP.recognize = async dataUrl => {
  if (!SB) throw new Error('Falta configurar Supabase (ver README).');
  const {data, error} = await SB.functions.invoke('read-sheet', {body:{image:dataUrl}});
  if (error) { let msg=''; try { msg=(await error.context.json()).error; } catch(e){} throw new Error(msg || 'No se pudo conectar con el lector de fotos.'); }
  if (data?.error) throw new Error(data.error);
  return data?.text || '';
};
function addFiles(files){
  for (const f of files) {
    if (!/^image\//.test(f.type)) { toast(`${f.name}: sube una foto (JPG o PNG), no ${f.type||'este tipo de archivo'}.`); continue; }
    const job={id:++IMP.seq, file:f, url:URL.createObjectURL(f), status:'queued', data:null};
    IMP.jobs.unshift(job);
  }
  renderJobs(); pump();
}
async function pump(){
  if (IMP.busy) return;
  const job=IMP.jobs.slice().reverse().find(j=>j.status==='queued'); if (!job) return;
  IMP.busy=true; job.status='reading'; renderJobs();
  try {
    const text=await IMP.recognize(await toJpegDataUrl(job.file));
    if (!text.trim()) throw new Error('No se encontró texto en la foto. Prueba con una foto más clara y derecha.');
    job.raw=text; job.data=normalize(parseOcr(text)); job.truckId=truckForSheet(job.data); job.status='review';
  } catch(e){ job.status='error'; job.err=e.message||'No se pudo leer la foto. Presiona Leer otra vez.'; }
  IMP.busy=false; renderJobs(); pump();
}

// --- turning OCR text into rows ---
const MONTH_IDX = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12,ENE:1,ABR:4,AGO:8,DIC:12};
const monthOf = w => { const k=String(w||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3); return MONTH_IDX[k]||null; };
const DATE_RE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/;
function readNum(t){
  // "1'096,060" → 1096060 · "$348.66" → 348.66 · "109.409" → 109.409 (3 decimals = gallons/price) · OCR slips O→0, l→1
  let raw=String(t).trim().replace(/[;:,.'"`]+$/,''); const dollar=raw.includes('$');
  let s=raw.replace(/\$/g,'');
  // handwriting slips: O→0, l/I/|→1, S→5, B→8, Z→2 (only inside tokens that already have digits)
  if (/\d/.test(s)) s=s.replace(/[Oo]/g,'0').replace(/[lI|]/g,'1').replace(/[Ss](?=\d)/g,'5').replace(/B/g,'8').replace(/[Zz]/g,'2');
  if (!/^\d[\d',.]*\d$|^\d$/.test(s)) return null;
  let decimals=0;
  // "1.090,699": the apostrophe was read as a dot; when the last mark is a comma every mark is a thousands mark
  if (s.includes('.') && s.includes(',') && s.lastIndexOf(',')>s.lastIndexOf('.')) s=s.replace(/[.,']/g,'');
  if (/[',]/.test(s)) s=s.replace(/[',](?=\d{3}(\D|$))/g,'');      // thousands marks
  if ((s.match(/\./g)||[]).length>1) s=s.replace(/\./g,'');         // 1.096.060
  const m=s.match(/\.(\d+)$/); if (m) decimals=m[1].length;
  s=s.replace(/[',]/g,'');
  let v=Number(s); if (!isFinite(v)) return null;
  if (decimals && Math.floor(v)>=100000) decimals=0;                // odometer written with a dot
  // "1'090,699" read as 11,090,699: the apostrophe became a 1. Truck odometers have 7 digits, so drop it.
  if (!decimals && v>=10000000 && v<20000000) v=Number(String(v)[0]+String(v).slice(2));
  return {v, decimals, dollar};
}
function parseDate(tok, sheet){
  const m=String(tok).match(DATE_RE); if (!m) return null;
  let mo=+m[1], d=+m[2], y=+m[3]; if (y<100) y+=2000;
  if (mo<1||mo>12||d<1||d>31||y<2000||y>2100) return null;
  // a row like 2/28 on an August sheet is a slip of the pen: use the sheet's month
  if (sheet && sheet.month && mo!==sheet.month && mo!==((sheet.month+10)%12)+1 && d<=dim(y,sheet.month)) mo=sheet.month;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
function parseOcr(text){
  const lines=text.replace(/\r/g,'').split('\n').map(l=>l.trim()).filter(Boolean);
  const all=lines.join(' ');
  const out={kind:'other', truck:null, company:null, month:null, year:null, newOilChange:null, lastOilChange:null, rows:[], monthTotals:[], quarterMiles:null, notes:''};
  if (/FUEL\s*TAX/i.test(all)) out.kind='fuel_report'; else if (/MONTHLY\s*LOG|DASHBOARD/i.test(all)) out.kind='monthly_log';
  const co=all.match(/COMPANY\s*NAME\s*[:;]?\s*(.+?)\s*(?:TRUCK|MONTH|$)/i); if (co) out.company=co[1].replace(/\s+/g,' ').trim();
  const tr=all.match(/TRUCK\s*#?\s*[:;]?\s*(\d{2,6})/i); if (tr) out.truck=tr[1];
  const mo=all.match(/MONTH\s*OF\s*[:;]?\s*([A-Za-z]{3,})/i) || all.match(/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s*,?\s*(20\d\d)\b/i);
  if (mo) out.month=monthOf(mo[1]);
  const yr=all.match(/YEAR\s*[:;]?\s*(20\d\d)/i) || all.match(/\b(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s*,?\s*(20\d\d)\b/i);
  if (yr) out.year=+yr[1];
  const sheet={month: out.kind==='monthly_log' ? out.month : null};   // the "2/28 on an August sheet" fix only applies to the monthly log
  const headerDates=[], headerOdos=[]; let seenRow=false, unplaced=0;
  for (const line of lines) {
    // "$502.71$4.319" → "$502.71 $4.319" · "$ 502.71" → "$502.71"
    const toks=line.replace(/([^\s$])\$/g,'$1 $').replace(/\$\s+(?=[\dOoSB])/g,'$').split(/[\t ]+/).filter(Boolean);
    if (/^TOTAL/i.test(line)) continue;
    if (!seenRow && /COMPANY|MONTH\s*OF|YEAR\s*:|TRUCK\s*#|OIL\s*CHANGE/i.test(line)) {   // sheet header: oil change dates and odometers, left box first
      toks.forEach(t=>{ const d=parseDate(t,null); if (d) headerDates.push(d); });
      toks.map(readNum).filter(n=>n && n.decimals===0 && n.v>=100000).forEach(n=>headerOdos.push(n.v));
      continue;
    }
    const di=toks.findIndex(t=>DATE_RE.test(t));
    const date = di>=0 ? parseDate(toks[di], sheet) : null;
    const after = di>=0 ? toks.slice(di+1) : toks;
    const nums=[], words=[];
    for (const t of after) { const n=readNum(t); if (n) nums.push(n); else if (/[A-Za-z]/.test(t)) words.push(t); }
    // month total line in the quarter summary: "APRIL $ 11,424.94 2,228.226 $ 5.129"
    const mIdx = !date && toks.length ? monthOf(toks[0]) : null;
    if (mIdx && /^[A-Za-z]{3,}$/.test(toks[0]) && monthOf(toks[0]) && toks[0].length>=3 && nums.some(n=>n.decimals===3 && n.v>=10)) {
      const cost=nums.find(n=>n.decimals===2), gal=nums.find(n=>n.decimals===3 && n.v>=10), price=nums.find(n=>n.decimals===3 && n.v<10);
      if (cost||gal) out.monthTotals.push({month:mIdx, year:out.year, cost:cost?.v??null, gallons:gal?.v??null, pricePerGallon:price?.v??null});
      continue;
    }
    if (!date) {
      if (!seenRow) {   // header area: oil change dates and odometers, left box first
        toks.forEach(t=>{ const d=parseDate(t,null); if (d) headerDates.push(d); });
        nums.filter(n=>n.decimals===0 && n.v>=100000).forEach(n=>headerOdos.push(n.v));
        if (!out.year) { const y=toks.map(Number).find(v=>v>=2000&&v<=2100); if (y) out.year=y; }
      }
      continue;
    }
    // OFF DUTY is often read as junk ("0FF", "DJITY", "bury"): a log row with words but no numbers at all is a day off
    const offWords=/\b[0O]FF\b|D[UV]T|DUTY|DITY|JITY|BUTY|BURY/i.test(after.join(' '));
    const r={date, driver:null, dashboard:null, offDuty: offWords || (out.kind!=='fuel_report' && !nums.length && words.length>=2), milesDriven:null, fuelMiles:null, gallons:null, cost:null, pricePerGallon:null, unclear:false};
    // driver = the one word in the DRIVER column (right after the date), never leftover text from other cells
    const first=after.find(t=>!/^[SMTWF]$/i.test(t));
    if (first && !readNum(first) && /^[A-Za-z][A-Za-z.'-]{0,11}$/.test(first) && !/^(OFF|0FF|DUTY)$/i.test(first)) r.driver=first;
    const odos=[], money=[]; let extra=0;
    for (const n of nums) {
      if (n.decimals===0 && n.v>=100000) odos.push(n.v);
      else if (n.decimals>=2 && n.v>=2 && n.v<10) r.pricePerGallon ??= n.v;
      else if (n.dollar && n.decimals===0 && n.v>=2000 && n.v<10000 && String(n.v).length===4) r.pricePerGallon ??= n.v/1000;   // "$5349" = $5.349
      else if (n.decimals>0 && n.v>=10 && n.v<5000) money.push(n);                                              // gallons or cost
      else if (n.decimals===0 && n.v<=1500 && r.milesDriven==null) r.milesDriven=n.v;
      else extra++;
    }
    // gallons vs cost: a $ sign or 3 decimals decide; otherwise use the column order of the form
    // (monthly log: FUEL GLNS. then FUEL COST · fuel taxes report: FUELING PRICE then FUELING GALLONS)
    if (money.length) {
      let gal = money.find(n=>n.decimals===3 && !n.dollar), cost = money.find(n=>n.dollar && n!==gal);
      const rest = money.filter(n=>n!==gal && n!==cost);
      if (!gal && !cost && rest.length>=2) { [cost,gal] = out.kind==='fuel_report' ? [rest[0],rest[1]] : [rest[1],rest[0]]; }
      else { if (!cost) cost = rest.find(n=>n!==gal); if (!gal) gal = rest.find(n=>n!==cost); }
      if (gal) r.gallons=gal.v; if (cost) r.cost=cost.v;
      extra += money.filter(n=>n!==gal && n!==cost).length;
    }
    if (out.kind==='fuel_report' && odos.length && r.gallons==null && r.cost==null) {   // quarter miles table: date + odometer
      out.quarterMiles ||= {closingDate:null, closing:null, openingDate:null, opening:null};
      if (out.quarterMiles.closing==null) { out.quarterMiles.closing=odos[0]; out.quarterMiles.closingDate=date; }
      else { out.quarterMiles.opening=odos[0]; out.quarterMiles.openingDate=date; }
      continue;
    }
    r.dashboard=r.offDuty?null:(odos[0]??null); r.fuelMiles=odos[1]??null;
    if (r.offDuty) r.dashboard=null;
    const fuelBits=[r.gallons,r.cost,r.pricePerGallon].filter(v=>v!=null).length;
    r.unclear = extra>0 || (fuelBits>0 && fuelBits<2) || (out.kind!=='fuel_report' && !r.offDuty && r.dashboard==null);
    if (r.dashboard!=null || r.offDuty || r.gallons!=null || r.cost!=null) { out.rows.push(r); seenRow=true; if (r.unclear) unplaced++; }
  }
  if (out.kind==='other' && out.rows.length) out.kind = out.rows.some(r=>r.dashboard!=null) ? 'monthly_log' : 'fuel_report';
  // cross-check each day with the one before: dashboard = previous dashboard + miles driven
  if (out.kind==='monthly_log') {
    out.rows.sort((a,b)=>a.date<b.date?-1:1);
    let prev=null;
    for (const r of out.rows) {
      if (r.offDuty) continue;
      const expect = prev!=null && r.milesDriven!=null ? prev + r.milesDriven : null;
      if (expect!=null && r.dashboard!=null && Math.abs(r.dashboard-expect)>2) {
        // the only odometer read on a fuel day is often FUEL MILES (the dashboard cell was unreadable)
        if (r.fuelMiles==null && r.dashboard<expect && expect-r.dashboard<1500 && (r.gallons!=null||r.cost!=null)) { r.fuelMiles=r.dashboard; r.dashboard=expect; r.unclear=true; }
        // FUEL MILES read as the dashboard and vice versa
        else if (r.fuelMiles!=null && Math.abs(r.fuelMiles-expect)<=2) { const t=r.dashboard; r.dashboard=r.fuelMiles; r.fuelMiles=t; r.unclear=true; }
      }
      if (r.dashboard==null && expect!=null) { r.dashboard=expect; r.unclear=true; }   // filled in from the miles column; flagged for review
      if (r.dashboard!=null) prev=r.dashboard;
    }
  }
  if (headerDates[0] || headerOdos[0]) out.newOilChange={date:headerDates[0]||null, miles:headerOdos[0]??null};
  if (headerDates[1] || headerOdos[1]) out.lastOilChange={date:headerDates[1]||null, miles:headerOdos[1]??null};
  // when the sheet's year is known, make sure each row uses it (OCR often misreads the last digit)
  if (out.year) out.rows.forEach(r=>{ const [y,m,d]=r.date.split('-'); if (Math.abs(+y-out.year)<=1 && +y!==out.year && !(+m===12 && out.month===1)) r.date=`${out.year}-${m}-${d}`; });
  if (unplaced) out.notes=`${unplaced} renglón(es) con números que no pude acomodar con seguridad; revísalos con la foto.`;
  return out;
}
function normalize(d){
  const isoOk=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const rows=(d.rows||[]).map((r,i)=>({ i, on:true, date:isoOk(r.date)?r.date:'', driver:r.driver?String(r.driver):'',
    off:!!r.offDuty, odo:num(r.dashboard), sheetMiles:num(r.milesDriven), fuelOdo:num(r.fuelMiles),
    gal:num(r.gallons), cost:num(r.cost), price:num(r.pricePerGallon), unclear:!!r.unclear }))
    .filter(r=>r.date||r.odo!=null||r.gal!=null||r.off);
  rows.forEach(r=>{ if (!r.date) r.on=false; });
  rows.sort((a,b)=>(a.date||'9')<(b.date||'9')?-1:1);
  const oil=o=>o&&(o.date||o.miles!=null)?{date:isoOk(o.date)?o.date:null, odo:num(o.miles)}:null;
  const totals=(d.monthTotals||[]).map(m=>({on:true, m:+m.month, y:+m.year||+d.year, cost:num(m.cost), gal:num(m.gallons), price:num(m.pricePerGallon)})).filter(m=>m.m>=1&&m.m<=12&&m.y&&(m.cost!=null||m.gal!=null));
  const q=d.quarterMiles, qm = q && (num(q.closing)!=null || num(q.opening)!=null) ? {on:true, endDate:isoOk(q.closingDate)?q.closingDate:null, end:num(q.closing), startDate:isoOk(q.openingDate)?q.openingDate:null, start:num(q.opening)} : null;
  return { kind:d.kind, truck:d.truck?String(d.truck):'', company:d.company||'', month:+d.month||null, year:+d.year||null,
    newOil:oil(d.newOilChange), lastOil:oil(d.lastOilChange), headerOn:true, rows, totals, qm, notes:d.notes||'' };
}
// the sheet says "TRUCK # 2021": use that truck when it's registered; otherwise ask (create it or pick one)
function truckForSheet(d){
  if (d.truck) { const id=safeId(d.truck); return S.trucks[id] ? id : null; }
  return S.trucks[S.truckId] ? S.truckId : null;
}
function reviewChecks(d, tid){
  // miles from the odometer vs. what the sheet says, cost vs gallons × price, clashes with saved days
  const first=d.rows.find(r=>r.date);
  let prev = first && tid ? (lastOdoEntry(tid, first.date)?.odo ?? null) : null;
  for (const r of d.rows) {
    r.flags=[]; r.calcMiles=null;
    if (!r.date) r.flags.push(['bad','Falta la fecha']);
    if (r.odo!=null && !r.off) { if (prev!=null) r.calcMiles=r.odo-prev; prev=r.odo; }
    if (r.calcMiles!=null && r.calcMiles<0) r.flags.push(['bad','Odómetro menor que el día anterior']);
    if (r.sheetMiles!=null && r.calcMiles!=null && r.sheetMiles!==r.calcMiles) r.flags.push(['warn',`La hoja dice ${fOdo(r.sheetMiles)}; el odómetro da ${fOdo(r.calcMiles)}`]);
    if (r.gal!=null && r.price!=null && r.cost!=null && Math.abs(r.gal*r.price-r.cost)>0.05) r.flags.push(['warn',`Galones × precio = ${fMoney(r2(r.gal*r.price))}`]);
    if (r.unclear) r.flags.push(['warn','Letra difícil: revisa']);
    const ex=r.date && tid && S.entries[tid+'_'+r.date];
    if (ex && ((r.odo!=null && ex.odo!=null && ex.odo!==r.odo) || (r.gal!=null && ex.gal!=null && ex.gal!==r.gal))) r.flags.push(['bad','Ya hay otros datos guardados este día: se reemplazan']);
  }
}
function renderJobs(){
  const box=$('#impList');
  const a=document.activeElement, keep = a && box.contains(a) && a.id ? a.id : null;
  box.innerHTML = IMP.jobs.map(j=>{
    const stat = j.status==='queued' ? 'En espera…' : j.status==='reading' ? 'Leyendo la hoja… puede tardar hasta un minuto.'
      : j.status==='error' ? j.err : j.status==='saved' ? j.savedMsg : j.status==='saving' ? 'Guardando…' : 'Listo: revisa los datos y guarda.';
    const cls = j.status==='error' ? 'err' : j.status==='saved' ? 'ok' : '';
    const btn = j.status==='reading' ? ''
      : j.status==='error' ? `<button class="btn" data-retry="${j.id}">Leer otra vez</button><button class="btn" data-drop="${j.id}">Quitar</button>`
      : j.status==='saved' ? `<button class="btn" data-view="${j.id}">Ver la hoja</button><button class="btn" data-drop="${j.id}">Quitar</button>` : '';
    return `<div class="job"><div class="jhead"><img src="${j.url}" alt="Foto ${esc(j.file.name)}"><div class="jn"><b>${esc(j.file.name)}</b><div class="jstat ${cls}">${esc(stat)}</div></div>${btn}</div>
      <div class="jbody">${j.status==='review' ? reviewHTML(j) : ''}</div></div>`;
  }).join('');
  if (keep) document.getElementById(keep)?.focus();
}
function reviewHTML(j){
  const d=j.data, tid=j.truckId; reviewChecks(d, tid);
  const kind = d.kind==='monthly_log' ? 'Hoja mensual' : d.kind==='fuel_report' ? 'Reporte de fuel taxes' : 'No reconocida';
  const trucks=Object.values(S.trucks);
  const tsel = trucks.length ? `<select id="jt-${j.id}" data-jt="${j.id}">${tid?'':'<option value="" selected>— Escoge el camión —</option>'}${trucks.map(t=>`<option value="${esc(t.id)}"${t.id===tid?' selected':''}>#${esc(t.number)}${t.plate?' · '+esc(t.plate):''}</option>`).join('')}</select>` : '';
  const exists = d.truck && S.trucks[safeId(d.truck)];
  const mismatch = !d.truck ? `<span class="chip warn">No encontré el número de camión en la hoja: escógelo</span>`
    : !exists ? `<span class="chip warn">La hoja dice truck #${esc(d.truck)}, que no está registrado</span> ${S.canWrite?`<button class="btn" data-mktruck="${j.id}">Crear truck #${esc(d.truck)}</button>`:''}`
    : tid===safeId(d.truck) ? `<span class="chip ok">Detectado en la hoja: truck #${esc(d.truck)}</span>`
    : `<span class="chip warn">La hoja dice truck #${esc(d.truck)}</span>`;
  const inp=(r,k,v,w)=>`<input type="text" id="jr-${j.id}-${r.i}-${k}" data-j="${j.id}" data-r="${r.i}" data-k="${k}" value="${esc(v)}" style="min-width:${w}px" autocomplete="off">`;
  const rows=d.rows.map(r=>`<tr class="${!r.on?'skip':r.flags.length?'warn':''}">
      <td><input type="checkbox" id="jr-${j.id}-${r.i}-on" data-j="${j.id}" data-r="${r.i}" data-k="on"${r.on?' checked':''} aria-label="Importar renglón"></td>
      <td><input type="text" ${USD_ATTRS} id="jr-${j.id}-${r.i}-date" data-j="${j.id}" data-r="${r.i}" data-k="date" value="${usPad(r.date)}"></td>
      <td>${inp(r,'driver',r.driver,60)}</td>
      <td>${inp(r,'odo',r.off?'OFF DUTY':fOdo(r.odo),96)}</td>
      <td class="calc">${r.off?'OFF DUTY':(r.calcMiles!=null?fOdo(r.calcMiles):'')}</td>
      <td>${inp(r,'fuelOdo',fOdo(r.fuelOdo),96)}</td>
      <td>${inp(r,'gal',r.gal!=null?fGal(r.gal):'',72)}</td>
      <td>${inp(r,'cost',r.cost!=null?r.cost.toFixed(2):'',72)}</td>
      <td>${inp(r,'price',r.price!=null?r.price.toFixed(3):'',62)}</td>
      <td class="nt">${r.flags.map(([k,m])=>`<span class="chip ${k}">${esc(m)}</span>`).join('')}</td></tr>`).join('');
  const nOn=d.rows.filter(r=>r.on).length, nWarn=d.rows.filter(r=>r.on&&r.flags.length).length;
  const ex=[];
  if (d.company || d.newOil || d.lastOil) ex.push(`<label><input type="checkbox" data-j="${j.id}" data-x="header" id="jx-${j.id}-h"${d.headerOn?' checked':''}> Guardar en el camión: ${[d.company&&`compañía ${esc(d.company)}`, d.newOil&&`cambio de aceite ${d.newOil.date?usDate(d.newOil.date):''} @ ${fOdo(d.newOil.odo)}`, d.lastOil&&`cambio anterior ${d.lastOil.date?usDate(d.lastOil.date):''} @ ${fOdo(d.lastOil.odo)}`].filter(Boolean).join(' · ')}</label>`);
  d.totals.forEach((m,k)=>ex.push(`<label><input type="checkbox" data-j="${j.id}" data-x="tot" data-n="${k}" id="jx-${j.id}-t${k}"${m.on?' checked':''}> Total de ${MES[m.m-1]} ${m.y}: ${fMoney(m.cost)} · ${fGal(m.gal)} gal${m.price!=null?' · '+fPrice(m.price):''} <span class="jstat">(solo se usa si ese mes no tiene cargas)</span></label>`));
  if (d.qm) ex.push(`<label><input type="checkbox" data-j="${j.id}" data-x="qm" id="jx-${j.id}-q"${d.qm.on?' checked':''}> Odómetros del trimestre: apertura ${d.qm.startDate?usDate(d.qm.startDate):''} ${fOdo(d.qm.start)} · cierre ${d.qm.endDate?usDate(d.qm.endDate):''} ${fOdo(d.qm.end)}</label>`);
  return `<div class="jmeta"><div><span class="k">Tipo</span><span class="v">${kind}</span></div>
      ${d.month?`<div><span class="k">Mes</span><span class="v">${MONTH[d.month-1]} ${d.year||''}</span></div>`:''}
      <div><span class="k">Camión de esta hoja</span>${tsel} ${mismatch}</div>
      <div><span class="k">Renglones</span><span class="v">${nOn} a guardar${nWarn?` · <span class="chip warn">${nWarn} por revisar</span>`:''}</span></div></div>
    ${d.notes?`<div class="jstat">Nota: ${esc(d.notes)}</div>`:''}${j.raw?`<details><summary class="jstat">Ver el texto que leyó OCR</summary><pre class="rawocr">${esc(j.raw)}</pre></details>`:''}
    ${d.rows.length?`<div class="scroll"><table class="rv"><thead><tr><th></th><th>Date</th><th>Driver</th><th>Dashboard miles</th><th style="text-align:right">Miles driven</th><th>Fuel miles</th><th>Fuel glns.</th><th>Fuel cost</th><th>Price/gal</th><th>Revisar</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="jstat">No se encontraron renglones de días o cargas.</div>'}
    ${ex.length?`<div class="extras">${ex.join('')}</div>`:''}
    <div class="jact"><button class="btn primary" data-save="${j.id}"${!S.canWrite||!S.trucks[tid]?' disabled':''}>Guardar en truck #${esc(S.trucks[tid]?.number||'—')}</button><button class="btn" data-drop="${j.id}">Descartar</button></div>`;
}
async function patchEntryFresh(date, patch){
  const id=S.truckId+'_'+date;
  if (!S.entries[id] && S.db) { try { const snap=await S.db.collection('entries').doc(id).get(); if (snap.exists) S.entries[id]={...snap.data()}; } catch(e){} }
  patchEntry(date, patch);
}
async function saveJob(j){
  const d=j.data; if (!S.trucks[j.truckId] || !S.canWrite) return;
  if (j.truckId!==S.truckId) { S.truckId=j.truckId; S.tdDirty=false; truckOptions(); subscribeEntries(); refreshAll(); }
  const t=S.trucks[S.truckId];
  j.status='saving'; renderJobs();
  let n=0; const months=new Set();
  for (const r of d.rows) {
    if (!r.on || !r.date) continue;
    const p={};
    if (r.driver) p.driver=r.driver;
    if (r.off) { p.off=true; p.odo=null; } else if (r.odo!=null) { p.off=false; p.odo=r.odo; }
    if (r.fuelOdo!=null) p.fuelOdo=r.fuelOdo;
    if (r.gal!=null || r.cost!=null || r.price!=null) Object.assign(p, completeFuel({gal:r.gal, price:r.price, cost:r.cost}));
    if (!Object.keys(p).length) continue;
    await patchEntryFresh(r.date, p); n++; months.add(r.date.slice(0,7));
  }
  if (d.headerOn && (d.company || d.newOil || d.lastOil)) {
    const up={...t};
    if (d.company) up.company=d.company;
    if (d.newOil) { if (d.newOil.date) up.oilDate=d.newOil.date; if (d.newOil.odo!=null) up.oilOdo=d.newOil.odo; }
    if (d.lastOil) { if (d.lastOil.date) up.prevOilDate=d.lastOil.date; if (d.lastOil.odo!=null) up.prevOilOdo=d.lastOil.odo; }
    writeTruck(S.truckId, up);
  }
  for (const m of d.totals) if (m.on) writeMonth(`${m.y}-${pad(m.m)}`, {cost:m.cost, gal:m.gal, price:m.price});
  if (d.qm && d.qm.on) {
    // the quarter is the one the closing date falls in; with only an opening date, 4/1 opens Q2 and 3/31 also opens Q2
    let qy=null, qq=null;
    if (d.qm.endDate) { const [y,m]=d.qm.endDate.split('-').map(Number); qy=y; qq=Math.ceil(m/3); }
    else if (d.qm.startDate) { const [y,m,dd]=d.qm.startDate.split('-').map(Number); qy=y; qq=Math.ceil(m/3);
      if (dd!==1) { qq++; if (qq>4) { qq=1; qy++; } } }
    if (qy) writeQuarter(`${qy}-Q${qq}`, {startDate:d.qm.startDate, startOdo:d.qm.start, endDate:d.qm.endDate, endOdo:d.qm.end});
  }
  const mainMonth = d.month && d.year ? `${d.year}-${pad(d.month)}` : [...months].pop();
  j.view = mainMonth || null;
  j.status='saved'; j.savedMsg=`Guardado en truck #${t.number}: ${n} ${n===1?'día':'días'}${months.size?` (${[...months].map(ym=>{const [y,m]=ym.split('-');return MES[+m-1]+' '+y;}).join(', ')})`:''}.`;
  toast(j.savedMsg); renderJobs(); later();
}
function onReviewEdit(e){
  const el=e.target, j=IMP.jobs.find(x=>x.id===+el.dataset.j); if (!j || !j.data) return;
  if (el.dataset.jt) { j.truckId=el.value||null; renderJobs(); return; }
  if (el.dataset.x) {
    if (el.dataset.x==='header') j.data.headerOn=el.checked;
    if (el.dataset.x==='tot') j.data.totals[+el.dataset.n].on=el.checked;
    if (el.dataset.x==='qm') j.data.qm.on=el.checked;
    return;
  }
  const r=j.data.rows.find(x=>x.i===+el.dataset.r), k=el.dataset.k; if (!r) return;
  if (k==='on') r.on=el.checked;
  else if (k==='date') r.date=isoOf(el.value);
  else if (k==='driver') r.driver=el.value.trim();
  else if (k==='odo') { const v=el.value.trim(); r.off=/^off/i.test(v); r.odo=r.off?null:num(v); }
  else r[k]=num(el.value);
  if (k!=='on' && k!=='driver') r.unclear=false;
  setTimeout(renderJobs,0);
}

// ---------- trucks ----------
function renderTrucks(){
  const list=Object.values(S.trucks).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
  $('#truckList').innerHTML = list.length ? `<div class="trucks">${list.map(t=>{
    const cur=odoChain(t.id).current;
    return `<div class="truck"><h3>Truck #${esc(t.number)}</h3><dl>
      <dt>Compañía</dt><dd>${esc(t.company||'—')}</dd><dt>Modelo</dt><dd>${esc(t.model||'—')}</dd>
      <dt>VIN</dt><dd>${esc(t.vin||'—')}</dd><dt>Placa</dt><dd>${t.plate?esc(t.plate)+(t.plateState?' ('+esc(t.plateState)+')':''):'—'}</dd>
      <dt>Chofer</dt><dd>${esc(t.driver||'—')}</dd><dt>Odómetro actual</dt><dd>${cur!=null?fOdo(cur):'—'}</dd>
      <dt>Último aceite</dt><dd>${t.oilDate?usDate(t.oilDate)+' @ '+fOdo(t.oilOdo):'—'}</dd>
      <dt>Aceite anterior</dt><dd>${t.prevOilDate?usDate(t.prevOilDate)+' @ '+fOdo(t.prevOilOdo):'—'}</dd></dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${S.canWrite?`<button class="btn" data-edit="${esc(t.id)}">Editar</button><button class="btn" data-del="${esc(t.id)}">Quitar</button>`:''}</div>
      <div data-confirm="${esc(t.id)}" hidden style="margin-top:8px"><span class="chip bad">¿Quitar este camión?</span> Sus registros diarios se conservan.
        <div style="display:flex;gap:8px;margin-top:6px"><button class="btn primary" data-delyes="${esc(t.id)}">Sí, quitar</button><button class="btn" data-delno="${esc(t.id)}">No</button></div></div></div>`;}).join('')}</div>`
    : `<div class="empty" style="margin-bottom:16px"><b>Ningún camión registrado</b>Llena el formulario de abajo con el número del camión para empezar.</div>`;
  $('#truckForm').hidden=!S.canWrite;
}
function fillForm(t){
  $('#tfTitle').textContent = t ? `Editar truck #${t.number}` : 'Agregar camión';
  $('#tfNum').value=t?.number||''; $('#tfNum').disabled=!!t; $('#tfCo').value=t?.company||''; $('#tfModel').value=t?.model||''; $('#tfVin').value=t?.vin||''; $('#tfPlate').value=t?.plate||''; $('#tfState').value=t?.plateState||'';
  $('#tfDriver').value=t?.driver||''; $('#tfPrevDate').value=usPad(t?.prevOilDate); $('#tfPrevOdo').value=t?.prevOilOdo??'';
  $('#tfOilDate').value=usPad(t?.oilDate); $('#tfOilOdo').value=t?.oilOdo??''; $('#tfInt').value=t?.oilInterval??20000;
  $('#tfCancel').hidden=!t; S.editing=t?t.id:null;
}

// ---------- glue ----------
function truckOptions(){
  const sel=$('#truckSel'), list=Object.values(S.trucks).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
  if (!S.truckId || !S.trucks[S.truckId]) S.truckId = list[0]?.id || null;
  sel.innerHTML = list.length ? list.map(t=>`<option value="${esc(t.id)}"${t.id===S.truckId?' selected':''}>#${esc(t.number)}${t.model?' · '+esc(t.model):''}${t.plate?' · '+esc(t.plate):''}</option>`).join('') : '<option>Sin camiones</option>';
  sel.disabled=!list.length;
}
function trucksChanged(){ const before=S.truckId; truckOptions(); if (S.truckId!==before) subscribeEntries(); refreshAll(); }
function refreshAll(){ loadToday(); renderLog(); renderReport(); renderTrucks(); }
function subscribeEntries(){
  if (!S.db) return;
  if (S.unsubE) S.unsubE();
  if (S.unsubM) S.unsubM();
  if (S.unsubQ) S.unsubQ();
  S.unsubE=S.unsubM=S.unsubQ=null; S.logKey='';
  if (!S.truckId) return;
  S.unsubQ = S.db.collection('quarters').where('truck','==',S.truckId).onSnapshot(snap=>{
    for (const k of Object.keys(S.quarters)) if (S.quarters[k].truck===S.truckId) delete S.quarters[k];
    snap.docs.forEach(d=>{ S.quarters[d.id]={...d.data()}; });
    refreshAll();
  }, ()=>{});
  S.unsubM = S.db.collection('months').where('truck','==',S.truckId).onSnapshot(snap=>{
    for (const k of Object.keys(S.months)) if (S.months[k].truck===S.truckId) delete S.months[k];
    snap.docs.forEach(d=>{ S.months[d.id]={...d.data()}; });
    refreshAll();
  }, ()=>{});
  S.unsubE = S.db.collection('entries').where('truck','==',S.truckId).onSnapshot(snap=>{
    for (const k of Object.keys(S.entries)) if (S.entries[k].truck===S.truckId) delete S.entries[k];
    snap.docs.forEach(d=>{ S.entries[d.id]={...d.data()}; });
    // first load: if this month is empty, open the latest month that has records
    if (!S.jumped && (snap.size || !snap.metadata.fromCache)) {
      S.jumped=true;
      const list=truckEntries(S.truckId);
      if (list.length && !list.some(e=>e.date.startsWith(S.month))) {
        S.month=list[list.length-1].date.slice(0,7); const [y,m]=S.month.split('-').map(Number);
        S.year=y; S.q=Math.ceil(m/3); $('#monthSel').value=S.month; $('#yearSel').value=y; $('#qSel').value=S.q;
      }
    }
    refreshAll();
  }, ()=>banner('Se perdió la conexión con los datos. Recarga la página.'));
}
function banner(msg){ const b=$('#banner'); b.textContent=msg; b.hidden=!msg; }

document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>{
  S.tab=b.dataset.tab;
  document.querySelectorAll('nav.tabs button').forEach(x=>x.setAttribute('aria-selected',x===b));
  ['today','log','report','import','trucks'].forEach(k=>$('#tab-'+k).hidden=k!==S.tab);
  try{ localStorage.setItem('bc.tab',S.tab); }catch(e){}
}));
$('#truckSel').addEventListener('change',e=>{ S.truckId=e.target.value; S.tdDirty=false; subscribeEntries(); refreshAll(); });
$('#todayForm').addEventListener('submit', saveToday);
$('#impFile').addEventListener('change', e=>{ addFiles([...e.target.files]); e.target.value=''; });
['dragenter','dragover'].forEach(ev=>$('#impDrop').addEventListener(ev, e=>{ e.preventDefault(); $('#impDrop').classList.add('over'); }));
['dragleave','drop'].forEach(ev=>$('#impDrop').addEventListener(ev, e=>{ e.preventDefault(); $('#impDrop').classList.remove('over'); }));
$('#impDrop').addEventListener('drop', e=>{ if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]); });
$('#impList').addEventListener('change', onReviewEdit);
$('#impList').addEventListener('keydown', e=>{ if (e.key==='Enter' && e.target.tagName==='INPUT') { e.preventDefault(); e.target.blur(); } });
$('#impList').addEventListener('click', e=>{
  const b=e.target.closest('button'); if (!b) return;
  const id=+(b.dataset.retry||b.dataset.drop||b.dataset.save||b.dataset.view||b.dataset.mktruck), j=IMP.jobs.find(x=>x.id===id); if (!j) return;
  if (b.dataset.retry) { j.status='queued'; renderJobs(); pump(); }
  if (b.dataset.drop) { URL.revokeObjectURL(j.url); IMP.jobs=IMP.jobs.filter(x=>x!==j); renderJobs(); }
  if (b.dataset.save) saveJob(j);
  if (b.dataset.mktruck && j.data?.truck) {
    const d=j.data, id=safeId(d.truck);
    writeTruck(id, {id, number:d.truck, company:d.company||'', model:'', vin:null, plate:null, plateState:null,
      driver:(d.rows.find(r=>r.driver)||{}).driver||'', oilDate:d.newOil?.date||null, oilOdo:d.newOil?.odo??null,
      prevOilDate:d.lastOil?.date||null, prevOilOdo:d.lastOil?.odo??null, oilInterval:20000});
    S.trucks[id] ||= {id, number:d.truck};
    j.truckId=id; toast(`Truck #${d.truck} creado. Completa su VIN y placa en Camiones.`); renderJobs();
  }
  if (b.dataset.view && j.view) { $('#monthSel').value=j.view; $('#monthSel').dispatchEvent(new Event('change')); document.querySelector('nav.tabs [data-tab="log"]').click(); window.scrollTo({top:0,behavior:'smooth'}); }
});
$('#todayForm').addEventListener('input', e=>{ if (e.target.id==='tdDate') return; S.tdDirty=true; $('#tdStatus').textContent=''; renderTodayCalc(); });
$('#tdDate').addEventListener('change', ()=>{ $('#tdStatus').textContent=''; loadToday(true); });
$('#tdRecent').addEventListener('click', e=>{ const b=e.target.closest('[data-date]'); if (!b) return; $('#tdDate').value=usPad(b.dataset.date); $('#tdStatus').textContent=''; loadToday(true); $('#todayForm').scrollIntoView({behavior:'smooth',block:'start'}); });
$('#monthSel').addEventListener('change',e=>{ if (!e.target.value) return; S.month=e.target.value; const [y,m]=S.month.split('-').map(Number); S.year=y; S.q=Math.ceil(m/3); $('#yearSel').value=y; $('#qSel').value=S.q; refreshAll(); });
$('#yearSel').addEventListener('change',e=>{ S.year=+e.target.value||S.year; renderReport(); });
$('#qSel').addEventListener('change',e=>{ S.q=+e.target.value; renderReport(); });
$('#avgSel').addEventListener('change',e=>{ S.avg=e.target.value; try{localStorage.setItem('bc.avg',S.avg);}catch(_){} refreshLog(); renderReport(); });
$('#rptBox').addEventListener('change', onReportChange);
$('#rptBox').addEventListener('click', e=>{ const b=e.target.closest('[data-rm]'); if (b && S.canWrite) { patchEntry(b.dataset.rm, BLANK); toast(`Carga del ${usDate(b.dataset.rm)} borrada.`); later(); } });
$('#rptBox').addEventListener('keydown', e=>{ if (e.key==='Enter' && e.target.tagName==='INPUT') { e.preventDefault(); e.target.blur(); } });
$('#logBody').addEventListener('change',e=>{
  if (!S.canWrite) return;
  const k=e.target.dataset.t, t=S.trucks[S.truckId];
  if (k && t) {   // sheet header: oil changes and company belong to the truck
    const v = k.endsWith('Odo') ? num(e.target.value) : k.endsWith('Date') ? (isoOf(e.target.value)||null) : (e.target.value.trim()||null);
    writeTruck(S.truckId, {...t, [k]: k==='company' ? (v||'') : ['vin','plate','plateState'].includes(k) ? (v ? v.toUpperCase().replace(/\s+/g,'') : null) : v});
    if (k==='vin' && v && v.replace(/\s+/g,'').length!==17) toast('El VIN normalmente tiene 17 caracteres; revísalo.');
    return;
  }
  const tr=e.target.closest('tr[data-date]'); if (tr) saveRow(tr);
});
$('#logBody').addEventListener('keydown',e=>{   // Enter moves down the column, like on paper
  if (e.key!=='Enter' || e.target.tagName!=='INPUT') return;
  const tr=e.target.closest('tr[data-date]'); if (!tr) return;
  e.preventDefault();
  const next=tr.nextElementSibling?.querySelector(`[data-f="${e.target.dataset.f}"]`);
  if (next) next.focus(); else e.target.blur();
});
$('#dlLog').addEventListener('click',()=>{ const t=S.trucks[S.truckId]; if(!t) return; const [y,m]=S.month.split('-').map(Number);
  const pdf=makePdf(()=>logPdf(t,y,m)); if (pdf) offer(`Monthly-Log-Truck${t.number}-${MONTH[m-1]}-${y}.pdf`, pdf); });
$('#csvLog').addEventListener('click',()=>{ const t=S.trucks[S.truckId]; if(!t) return; const [y,m]=S.month.split('-').map(Number);
  offer(`Log-Truck${t.number}-${y}-${pad(m)}.csv`, csvFor(t.id,`${y}-${pad(m)}-01`,`${y}-${pad(m)}-31`)); });
$('#dlRpt').addEventListener('click',()=>{ const t=S.trucks[S.truckId]; if(!t) return;
  const pdf=makePdf(()=>quarterPdf(t,S.year,S.q)); if (pdf) offer(`Fuel-Taxes-Q${S.q}-${S.year}-Truck${t.number}.pdf`, pdf); });
$('#csvRpt').addEventListener('click',()=>{ const t=S.trucks[S.truckId]; if(!t) return; const m0=3*S.q-2;
  offer(`Fuel-Q${S.q}-${S.year}-Truck${t.number}.csv`, csvFor(t.id,`${S.year}-${pad(m0)}-01`,`${S.year}-${pad(m0+2)}-31`)); });
$('#truckList').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if (b.dataset.edit){ fillForm(S.trucks[b.dataset.edit]); $('#truckForm').scrollIntoView({behavior:'smooth',block:'start'}); }
  if (b.dataset.del){ $(`[data-confirm="${b.dataset.del}"]`).hidden=false; }
  if (b.dataset.delno){ $(`[data-confirm="${b.dataset.delno}"]`).hidden=true; }
  if (b.dataset.delyes){ writeTruck(b.dataset.delyes,null); toast('Camión quitado.'); }
});
$('#tfCancel').addEventListener('click',()=>fillForm(null));
$('#truckForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const number=$('#tfNum').value.trim(); if(!number) return;
  const id=S.editing||safeId(number);
  if (!S.editing && S.trucks[id]) { toast(`El truck #${number} ya existe. Usa Editar.`); return; }
  const data={ id, number, company:$('#tfCo').value.trim(), model:$('#tfModel').value.trim(),
    vin:$('#tfVin').value.replace(/\s+/g,'').toUpperCase()||null, plate:$('#tfPlate').value.replace(/\s+/g,'').toUpperCase()||null, plateState:$('#tfState').value.trim().toUpperCase()||null, driver:$('#tfDriver').value.trim(),
    prevOilDate:isoOf($('#tfPrevDate').value)||null, prevOilOdo:num($('#tfPrevOdo').value), oilDate:isoOf($('#tfOilDate').value)||null,
    oilOdo:num($('#tfOilOdo').value), oilInterval:num($('#tfInt').value)||20000 };
  await writeTruck(id,data); S.truckId=id; fillForm(null); toast(data.vin && data.vin.length!==17 ? `Truck #${number} guardado. Revisa el VIN: normalmente tiene 17 caracteres.` : `Truck #${number} guardado.`);
  if (!S.db) trucksChanged();
});

// ---------- US date boxes: type 08292026 or 8/29/2026, it becomes 08/29/2026 ----------
document.addEventListener('input', e=>{
  const el=e.target; if (!el.classList || !el.classList.contains('usd')) return;
  const v=el.value;
  if (!/[\/\-.]/.test(v)) {   // digits only: add the slashes as the person types
    const d=v.replace(/\D/g,'').slice(0,8);
    const f = d.length>4 ? `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}` : d.length>2 ? `${d.slice(0,2)}/${d.slice(2)}` : d;
    if (f!==v) el.value=f;
  }
  el.classList.remove('bad');
}, true);
document.addEventListener('change', e=>{   // runs before the app's own handlers so they read a clean value
  const el=e.target; if (!el.classList || !el.classList.contains('usd')) return;
  if (!el.value.trim()) { el.classList.remove('bad'); return; }
  const iso=isoOf(el.value);
  if (iso) { el.value=usPad(iso); el.classList.remove('bad'); }
  else { el.classList.add('bad'); toast('Escribe la fecha como MM/DD/YYYY (mes/día/año).'); }
}, true);

// ---------- Supabase: data store with the small collection/doc API the app uses ----------
let SB=null;
function makeDb(sb){
  const T='docs';
  const snapOf = rows => { const docs=rows.map(r=>({id:r.id, exists:true, data:()=>r.data})); return {docs, size:docs.length, empty:!docs.length, metadata:{fromCache:false, hasPendingWrites:false}}; };
  function query(collection, filter){
    return {
      onSnapshot(next, error){
        let alive=true, timer=null;
        const load = async () => {
          let q=sb.from(T).select('id,data').eq('collection',collection);
          if (filter) q=q.eq(filter.field, filter.value);
          const {data, error:err} = await q.limit(5000);
          if (!alive) return;
          if (err) { error && error(err); return; }
          next(snapOf(data||[]));
        };
        const ch = sb.channel(`docs-${collection}-${filter?filter.value:'all'}-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', {event:'*', schema:'public', table:T, filter:`collection=eq.${collection}`}, payload=>{
            const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
            if (filter && row && row[filter.field]!==undefined && row[filter.field]!==filter.value) return;
            clearTimeout(timer); timer=setTimeout(load, 250);   // coalesce bursts (an import writes many days)
          })
          .subscribe();
        load();
        return () => { alive=false; clearTimeout(timer); sb.removeChannel(ch); };
      },
    };
  }
  return {
    collection(collection){
      return {
        where(field, op, value){ return query(collection, {field, value}); },
        onSnapshot(next, error){ return query(collection, null).onSnapshot(next, error); },
        doc(id){
          return {
            async get(){ const {data,error}=await sb.from(T).select('data').eq('collection',collection).eq('id',id).maybeSingle(); if (error) throw error; return {id, exists:!!data, data:()=>data?.data}; },
            async set(data){ const {error}=await sb.from(T).upsert({collection, id, truck: data.truck ?? (collection==='trucks'?id:null), data}); if (error) throw error; },
            async delete(){ const {error}=await sb.from(T).delete().eq('collection',collection).eq('id',id); if (error) throw error; },
          };
        },
      };
    },
  };
}
let started=false;
async function startAuth(linkType){
  const show = on => { $('#authScreen').hidden=!on; document.querySelector('.wrap').hidden=on; };
  const setMode = mode => {
    S.authMode=mode;
    $('#authMsg').textContent = mode==='setpass' ? 'Crea tu contraseña para entrar (mínimo 6 caracteres).' : 'Entra con el correo y la contraseña que te dio el administrador.';
    $('#authEmail').closest('label').hidden = mode==='setpass';
    $('#authBtn').textContent = mode==='setpass' ? 'Guardar contraseña' : 'Entrar';
    $('#authPass').autocomplete = mode==='setpass' ? 'new-password' : 'current-password';
    $('#authForgot').hidden = mode==='setpass';
  };
  setMode(linkType==='invite'||linkType==='recovery' ? 'setpass' : 'login');
  SB.auth.onAuthStateChange((event, session)=>{
    if (event==='PASSWORD_RECOVERY') { setMode('setpass'); show(true); return; }
    if (session && S.authMode!=='setpass') { show(false); onSignedIn(session); }
    if (!session) { show(true); }
  });
  const {data:{session}} = await SB.auth.getSession();
  if (session && S.authMode!=='setpass') { show(false); onSignedIn(session); } else show(true);
}
function onSignedIn(session){
  $('#who').textContent = session.user.email || '';
  $('#userBox').hidden=false;
  if (started) return; started=true;
  S.db = makeDb(SB);
  S.db.collection('trucks').onSnapshot(snap=>{
    S.trucks={}; snap.docs.forEach(d=>{ S.trucks[d.id]={...d.data(), id:d.id}; });
    trucksChanged();
  }, ()=>banner('No se pudieron leer los datos. Revisa tu conexión y recarga la página.'));
}
$('#authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const err=$('#authErr'); err.textContent='';
  const pass=$('#authPass').value;
  $('#authBtn').disabled=true;
  try {
    if (S.authMode==='setpass') {
      if (pass.length<6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      const {error}=await SB.auth.updateUser({password:pass}); if (error) throw error;
      history.replaceState(null,'',location.pathname); S.authMode='login';
      const {data:{session}}=await SB.auth.getSession(); $('#authScreen').hidden=true; document.querySelector('.wrap').hidden=false; onSignedIn(session);
      toast('Contraseña guardada.');
    } else {
      const {error}=await SB.auth.signInWithPassword({email:$('#authEmail').value.trim(), password:pass});
      if (error) throw new Error(error.message==='Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    }
  } catch(ex){ err.textContent=ex.message||'No se pudo entrar.'; }
  $('#authBtn').disabled=false;
});
$('#authForgot').addEventListener('click', async ()=>{
  const email=$('#authEmail').value.trim(), err=$('#authErr');
  if (!email) { err.textContent='Escribe tu correo primero.'; return; }
  const {error}=await SB.auth.resetPasswordForEmail(email,{redirectTo: location.origin+location.pathname});
  err.className='tdstatus'+(error?' err':''); err.textContent = error ? error.message : 'Te enviamos un correo para crear una contraseña nueva.';
});
$('#logout').addEventListener('click', async ()=>{ await SB.auth.signOut(); location.reload(); });

// ---------- boot ----------
(function init(){
  const now=new Date(); S.month=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
  $('#tdDate').value=usPad(todayStr());
  try{ const a=localStorage.getItem('bc.avg'); if(a) S.avg=a; const tb=localStorage.getItem('bc.tab'); if(tb) document.querySelector(`nav.tabs [data-tab="${tb}"]`)?.click(); }catch(e){}
  const [y,m]=S.month.split('-').map(Number); S.year=y; S.q=Math.ceil(m/3);
  $('#monthSel').value=S.month; $('#yearSel').value=S.year; $('#qSel').value=S.q; $('#avgSel').value=S.avg;
  truckOptions(); refreshAll();
  const cfg=window.BC_CONFIG||{};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    banner('Modo de prueba: falta configurar Supabase en config.js (ver README). Lo que escribas no se guarda.');
    IMP.ocr = null; return;
  }
  // invite / password-reset links arrive with #...type=invite|recovery; the user then sets a password
  const linkType = (location.hash.match(/type=(invite|recovery|signup)/)||[])[1] || null;
  SB = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  IMP.ocr = true;
  $('#logBody').innerHTML=`<div class="empty"><b>Cargando bitácora…</b>Conectando con los datos guardados.</div>`;
  startAuth(linkType);
})();
})();
