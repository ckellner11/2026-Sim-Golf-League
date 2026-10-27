(function(root){
'use strict';
const empty=v=>v===''||v==null;
const number=v=>empty(v)?NaN:Number(v);
const yes=v=>v===true||String(v).toLowerCase()==='true'||String(v).toLowerCase()==='yes';
const sum=a=>a.reduce((s,v)=>s+v,0),mean=a=>sum(a)/a.length;
const median=a=>{const s=[...a].sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
const config=d=>Object.fromEntries((d.HandicapConfig||[]).map(x=>[x.key,x.value]));
function index(values){const v=values.slice(-6);if(!v.length)return null;const best=[...v].sort((a,b)=>a-b).slice(0,Math.ceil(v.length/2));return {count:v.length,average:mean(v),best:mean(best),base:.75*mean(v)+.25*mean(best)};}
function latest(rows,key){const m=new Map();for(const r of rows){const k=key(r);if(!m.has(k)||+r.revision>+m.get(k).revision)m.set(k,r);}return [...m.values()];}
function handicaps(d){
 const c=config(d),zero=number(c.zeroReference),approved=yes(c.approved),history=d.HandicapHistory||[],overrides=d.HandicapOverrides||[];
 const weeks=latest(d.HandicapWeeks||[],r=>+r.week).sort((a,b)=>a.week-b.week);
 const currentRows=history.filter(h=>+h.season===2025||weeks.some(w=>+w.week===+h.week&&+w.revision===+h.revision));
 return (d.HandicapSeeds||[]).filter(s=>!empty(s.player)).map(s=>{
  let current=number(s.initial),window=[],steps=[];const hasInitial=Number.isInteger(current)&&current>=0;
  const own=currentRows.filter(h=>h.player===s.player&&yes(h.eligible));
  const historical=own.filter(h=>+h.season===2025).sort((a,b)=>a.sequence-b.sequence);
  for(const h of historical){const adjusted=number(h.raw)-number(h.difficulty)+number(h.teeAdjustment);if(Number.isFinite(adjusted))window.push({...h,adjusted});}
  window=window.slice(-6);
  const applied=new Set();
  function applyOverrides(week){for(const o of overrides.filter(o=>o.player===s.player&&+o.afterWeek<=week).sort((a,b)=>a.afterWeek-b.afterWeek||String(a.id).localeCompare(String(b.id)))){if(applied.has(o.id))continue;if(!Number.isInteger(number(o.value))||o.value<0||empty(o.reason))continue;steps.push({type:'override',week:+o.afterWeek,before:current,after:+o.value,reason:o.reason,id:o.id});current=+o.value;applied.add(o.id);}}
  applyOverrides(0);
  for(const w of weeks){
   const rr=own.filter(h=>+h.season!==2025&&+h.week===+w.week).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
   for(const h of rr){const adjusted=number(h.raw)-number(h.difficulty)+number(h.teeAdjustment);if(!Number.isFinite(adjusted))continue;window.push({...h,adjusted});window=window.slice(-6);const calc=index(window.map(x=>x.adjusted));const target=Number.isFinite(zero)?Math.max(0,Math.round(Math.max(0,calc.base-zero)*.90)):null;
    const frozen=+h.week>10&&!yes(c.resumePlayoffUpdates);const before=current;
    if(approved&&hasInitial&&target!==null&&!frozen)current=Math.max(0,Math.min(before+1,Math.max(before-2,target)));
    steps.push({type:'round',id:h.id,week:+h.week,raw:+h.raw,difficulty:+h.difficulty,adjusted,...calc,target,before,after:current,frozen,revision:+h.revision});
   }applyOverrides(+w.week);
  }
  // Overrides are explicit current adjustments, including ones entered before a future week.
  applyOverrides(Math.max(0,...weeks.map(w=>+w.week)));
  const calc=index(window.map(x=>x.adjusted));
  return {player:s.player,name:s.name,tee:s.tee,initial:number(s.initial),current:hasInitial?current:null,approved,provisional:!calc||calc.count<6,zeroReference:Number.isFinite(zero)?zero:null,calculation:calc,expectation:calc?calc.average:null,reliable:!!calc&&calc.count>=Number(c.reliableRounds||3),window,steps};
 });
}
function individualRounds(d){
 const out=[];
 for(const m of d.Matches||[]){const w=d.Weeks.find(w=>+w.week===+m.week);if(!w||w.format==='SCRAMBLE')continue;const holes=d.Holes.filter(h=>+h.week===+m.week).sort((a,b)=>a.hole-b.hole);if(holes.length!==9||holes.some(h=>!Number.isInteger(number(h.hole))||+h.hole<1||+h.hole>9||!Number.isFinite(number(h.par))||+h.par<1)||new Set(holes.map(h=>+h.hole)).size!==9)continue;
  for(const r of d.Rounds.filter(r=>r.match===m.id)){if(empty(r.player)||d.Rounds.filter(x=>x.player===r.player&&d.Matches.some(y=>y.id===x.match&&+y.week===+m.week)).length!==1)continue;const gross=holes.map(h=>number(r['h'+h.hole]));if(gross.some(n=>!Number.isInteger(n)||n<1||n>30))continue;const hcp=number(r.hcp);const rankValid=new Set(holes.map(h=>number(h.rank))).size===9&&holes.every(h=>Number.isInteger(number(h.rank))&&h.rank>=1&&h.rank<=9);
   const shots=(h,rank)=>h>=0?Math.floor(h/9)+(rank<=h%9?1:0):-shots(-h,10-rank);
   const net=Number.isInteger(hcp)&&rankValid?gross.map((g,i)=>g-shots(hcp,+holes[i].rank)):null;
   out.push({player:r.player,week:+m.week,match:m.id,gross:sum(gross),raw:sum(gross)-sum(holes.map(h=>+h.par)),hcp,net:net?sum(net):null,stableford:net?sum(net.map((n,i)=>Math.max(0,2+Number(holes[i].par)-n))):null,eligible:empty(r.eligible)||yes(r.eligible),expected:number(r.expected),source:r});
  }
 }return out;
}
function weekDraft(d,week){
 const c=config(d),w=d.Weeks.find(w=>+w.week===+week);if(!w||w.format==='SCRAMBLE')throw Error('Scramble scores cannot update individual handicaps.');
 const rr=individualRounds(d).filter(r=>r.week===+week);if(rr.length!==16||new Set(rr.map(r=>r.player)).size!==16)throw Error('Complete all 16 individual nine-hole scorecards before finalizing this week.');
 const eligible=rr.filter(r=>r.eligible);if(eligible.some(r=>!Number.isInteger(r.hcp)||r.hcp<0))throw Error('Freeze the handicap used for each eligible scorecard before finalizing.');
 const expectations=eligible.filter(r=>Number.isFinite(r.expected));const minimum=Number(c.minimumField||6);
 const difficulty=expectations.length>=minimum?Math.max(-3,Math.min(3,median(expectations.map(r=>r.raw-r.expected)))):0;
 return {week:+week,difficulty,field:expectations.length,reason:expectations.length>=minimum?'Median deviation, capped at ±3':'Fewer than '+minimum+' reliable expectations: adjustment is zero',rounds:eligible};
}
function awards(d,project=false){
 const rr=individualRounds(d).filter(r=>r.net!==null),c=config(d),finished=project||yes(c.seasonClosed)&&d.Weeks.filter(w=>w.format!=='SCRAMBLE').every(w=>rr.filter(r=>r.week===+w.week).length===16);
 const players=d.Players.map(p=>({...p,rounds:rr.filter(r=>r.player===p.id)}));
 const max=Math.max(0,...players.map(p=>p.rounds.length));const required=finished&&!project&&max<10?9:10;
 const pending=finished&&!project&&max<9;
 const make=(metric,ascending,potKey)=>{
  const rows=players.map(p=>{const kept=[...p.rounds].sort((a,b)=>ascending?a[metric]-b[metric]||a.week-b.week:b[metric]-a[metric]||a.week-b.week).slice(0,required);return {...p,kept,total:sum(kept.map(r=>r[metric])),qualified:project?p.rounds.length>0:p.rounds.length>=required,place:null,prize:null};});
  rows.sort((a,b)=>Number(b.qualified)-Number(a.qualified)||(ascending?a.total-b.total:b.total-a.total)||a.name.localeCompare(b.name));
  let position=0,prior=null,place=0;for(const p of rows){if(!p.qualified)continue;position++;if(prior!==p.total)place=position;p.place=place;prior=p.total;}
  const defaults=[80,70,60,50,40],payouts=defaults.map((v,i)=>c[potKey+(i+1)]===undefined?v:number(c[potKey+(i+1)]));
  const valid=payouts.every(v=>Number.isFinite(v)&&v>=0);
  return {rows,payouts,pot:valid?sum(payouts):null,unallocated:0};
 };
 const net=make('net',true,'netPrize'),stableford=make('stableford',false,'stablefordPrize');
 const decisions=[],awaitingChoice=[],unawarded=[];let payoutPending=false;
 function allocate(board){
  board.rows.forEach(p=>{p.place=null;p.prize=null;});
  const eligible=board.rows.filter(p=>p.qualified&&!p.excluded);
  for(let i=0;i<eligible.length;){let j=i+1;while(j<eligible.length&&eligible[j].total===eligible[i].total)j++;
   const cash=sum(board.payouts.slice(i,j))/(j-i);
   for(let k=i;k<j;k++){eligible[k].place=i+1;eligible[k].prize=cash>0?cash:null;}
   i=j;
  }
  board.unallocated=sum(board.payouts.slice(eligible.length));
 }
 // Compare actual payouts (including tied splits), then pass excluded places down.
 if(finished&&!pending){
  if(net.pot===null||stableford.pot===null)payoutPending=true;
  else {
   for(let pass=0;pass<=players.length;pass++){
    allocate(net);allocate(stableford);
    const overlap=net.rows.filter(n=>n.prize>0&&stableford.rows.some(s=>s.id===n.id&&s.prize>0));
    if(!overlap.length)break;
    for(const p of overlap){const np=p.prize,sp=stableford.rows.find(s=>s.id===p.id).prize,equal=Math.abs(np-sp)<1e-9,keep=equal||np>sp?'net':'stableford';
     const excluded=(keep==='net'?stableford:net).rows.find(r=>r.id===p.id);excluded.excluded=true;excluded.keptAward=keep;
     decisions.push({player:p.id,keep,netAmount:np,stablefordAmount:sp,equalPayout:equal});
    }
   }
   for(const [key,board] of [['net',net],['stableford',stableford]])if(board.unallocated>0)unawarded.push(key);
  }
 }

 if(!finished){const projection=awards(d,true);for(const key of ['net','stableford']){for(const p of (key==='net'?net:stableford).rows){const q=projection[key].rows.find(q=>q.id===p.id);p.projectedPrize=q.prize;p.projectedPlace=q.place;p.projectedExcluded=!!q.excluded;p.projectedKeptAward=q.keptAward;}}}
 return {required,finished,pending,net,stableford,decisions,awaitingChoice,payoutPending,unawarded};
}

function skins(d){
 let carry=0,carryKnown=true;const result=[];
 for(const w of [...d.Weeks].sort((a,b)=>a.week-b.week)){
  const team=w.format==='SCRAMBLE';let rows;
  if(team)rows=(d.Scramble||[]).filter(r=>+r.week===+w.week).map(r=>({...r,entity:r.team}));
  else {const ids=d.Matches.filter(m=>+m.week===+w.week).map(m=>m.id);rows=d.Rounds.filter(r=>ids.includes(r.match)).map(r=>({...r,entity:r.player}));}
  const expected=team?4:16;const assigned=rows.length===expected&&rows.every(r=>!empty(r.entity))&&new Set(rows.map(r=>r.entity)).size===expected;
  const valid=v=>Number.isInteger(number(v))&&v>=1&&v<=30;
  const holes=Array.from({length:9},(_,i)=>{const scored=rows.filter(r=>!empty(r.entity)&&valid(r['h'+(i+1)]));const low=scored.length?Math.min(...scored.map(r=>+r['h'+(i+1)])):null;const leaders=scored.filter(r=>+r['h'+(i+1)]===low).map(r=>r.entity);return {hole:i+1,low,leaders,remaining:Math.max(0,expected-scored.length),state:leaders.length===0?'Awaiting scores':leaders.length===1?'Outright leader':'Tied'};});
  const complete=assigned&&holes.every(h=>h.remaining===0),pot=carryKnown?80+carry:null;
  const counts={};holes.filter(h=>h.leaders.length===1).forEach(h=>counts[h.leaders[0]]=(counts[h.leaders[0]]||0)+1);const total=sum(Object.values(counts));
  const payouts=Object.entries(counts).map(([entity,count])=>({entity,count,calculated:complete&&pot!==null&&total?pot*count/total:null,final:null}));
  const overrides=(d.SkinsPayouts||[]).filter(r=>+r.week===+w.week&&!empty(r.amount));
  const finalized=complete&&total>0&&pot!==null&&overrides.length===payouts.length&&new Set(overrides.map(o=>o.entity)).size===payouts.length&&overrides.every(o=>payouts.some(p=>p.entity===o.entity)&&Number.isFinite(number(o.amount))&&+o.amount>=0&&!empty(o.reason))&&Math.abs(sum(overrides.map(o=>+o.amount))-pot)<.005;
  if(finalized)payouts.forEach(p=>p.final=+overrides.find(o=>o.entity===p.entity).amount);
  result.push({week:+w.week,team,complete,pot,carryIn:carryKnown?carry:null,holes,payouts,total,finalized,roundingPending:complete&&total>0&&!finalized,carryPending:!carryKnown,lastWeekHold:complete&&total===0&&+w.week===12});
  if(!complete){carryKnown=false;carry=0;}else if(total===0){if(carryKnown)carry=pot;}else{carry=0;carryKnown=true;}
 }return result;
}
root.LeagueExtras={index,median,handicaps,individualRounds,weekDraft,awards,skins,config};
if(typeof module!=='undefined')module.exports=root.LeagueExtras;
})(typeof window==='undefined'?globalThis:window);
