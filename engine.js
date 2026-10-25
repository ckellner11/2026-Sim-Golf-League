(function(root){
'use strict';
const blank=v=>v===''||v==null;
const num=v=>blank(v)?NaN:Number(v);
const sum=a=>a.reduce((s,v)=>s+v,0);
const round=v=>Math.sign(v)*Math.floor(Math.abs(v)+0.5);
function strokes(h,rank){return h>=0?Math.floor(h/9)+(rank<=h%9?1:0):-strokes(-h,10-rank);}
function formatFor(data,match){return match.format||data.Weeks.find(w=>+w.week===+match.week)?.format||'BEST_BALL';}
function stableford(net,par){return Math.max(0,2+par-net);}
function scramble(data,w){
 const fail=message=>({week:+w.week,complete:false,message,rows:[]});
 const holes=data.Holes.filter(h=>+h.week===+w.week).sort((a,b)=>a.hole-b.hole);
 const rows=(data.Scramble||[]).filter(r=>+r.week===+w.week);
 if(holes.length!==9||new Set(holes.map(h=>num(h.hole))).size!==9||holes.some(h=>!Number.isInteger(num(h.hole))||h.hole<1||h.hole>9)||new Set(holes.map(h=>num(h.rank))).size!==9||holes.some(h=>!Number.isInteger(num(h.rank))||h.rank<1||h.rank>9))return fail('Enter unique hole numbers and stroke ranks 1–9 in Holes');
 if(rows.length!==4||new Set(rows.map(r=>r.team)).size!==4||rows.some(r=>!data.Teams.some(t=>t.id===r.team)))return fail('Enter one Scramble row for each of the four teams');
 const entries=rows.map(r=>({...r,scores:holes.map(h=>num(r['h'+h.hole]))}));
 if(entries.some(r=>r.scores.some(n=>!Number.isInteger(n)||n<1||n>30)))return fail('Awaiting all four teams’ nine gross hole scores (1–30)');
 const order=holes.map((h,i)=>({rank:+h.rank,i})).sort((a,b)=>a.rank-b.rank);
 entries.forEach(r=>r.total=sum(r.scores));
 const compare=(a,b)=>{if(a.total!==b.total)return a.total-b.total;for(const h of order){if(a.scores[h.i]!==b.scores[h.i])return a.scores[h.i]-b.scores[h.i];}return 0;};
 entries.sort(compare);
 for(let i=0;i<entries.length;){let end=i+1;while(end<entries.length&&compare(entries[i],entries[end])===0)end++;const points=sum(Array.from({length:end-i},(_,j)=>4-i-j))/(end-i);for(let j=i;j<end;j++){entries[j].place=i+1;entries[j].points=points;entries[j].shared=end-i>1;}i=end;}
 return {week:+w.week,complete:true,rows:entries,holes,order:order.map(h=>holes[h.i].hole)};
}
function pair(data,match,teams){
 const format=formatFor(data,match);
 const fail=message=>({id:match.id,complete:false,message,match,format});
 if(!['BEST_BALL','STABLEFORD','SINGLES'].includes(format))return fail('Use BEST_BALL, STABLEFORD or SINGLES for the format');
 const sideSize=format==='SINGLES'?1:2;
 const holes=data.Holes.filter(h=>+h.week===+match.week).sort((a,b)=>a.hole-b.hole);
 const rr=data.Rounds.filter(r=>r.match===match.id);
 if(rr.length!==sideSize*2||new Set(rr.map(r=>r.player)).size!==sideSize*2||rr.some(r=>blank(r.player)))return fail(format==='SINGLES'?'Assign two different players':'Assign four different players');
 if(rr.some(r=>!data.Players.some(p=>p.id===r.player)))return fail('Unknown player ID');
 if(rr.filter(r=>r.side==='A').length!==sideSize||rr.filter(r=>r.side==='B').length!==sideSize)return fail(format==='SINGLES'?'Assign one player per side (A / B)':'Each pair needs two players (A / B)');
 if(!teams[0]||!teams[1]||teams[0]===teams[1])return fail('Awaiting teams / playoff qualification');
 if(holes.length!==9||new Set(holes.map(h=>+h.hole)).size!==9||holes.some(h=>!Number.isInteger(num(h.hole))||h.hole<1||h.hole>9||!Number.isInteger(num(h.par))||h.par<1)||new Set(holes.map(h=>num(h.rank))).size!==9||holes.some(h=>!Number.isInteger(num(h.rank))||h.rank<1||h.rank>9))return fail('Enter nine pars and unique stroke ranks 1–9');
 if(!Number.isFinite(num(match.allowance))||match.allowance<0||match.allowance>100)return fail('Freeze match handicaps and allowance (0–100%)');
 if(rr.some(r=>!Number.isFinite(num(r.hcp))))return fail('Freeze all match 9-hole handicaps');
 if(rr.some(r=>data.Rounds.filter(x=>x.player===r.player&&data.Matches.some(m=>m.id===x.match&&+m.week===+match.week)).length>1))return fail('Player assigned more than once this week');
 const playing=rr.map(r=>round(num(r.hcp)*num(match.allowance)/100));
 const low=Math.min(...playing);
 const rounds=rr.map((r,i)=>({...r,playing:playing[i],shots:format==='STABLEFORD'?playing[i]:playing[i]-low,gross:holes.map(h=>num(r['h'+h.hole]))}));
 if(rounds.some(r=>r.gross.some(s=>!Number.isInteger(s)||s<1||s>30)))return fail('Awaiting valid scores for all 9 holes (1–30 strokes)');
 rounds.forEach(r=>{r.net=r.gross.map((s,i)=>s-strokes(r.shots,+holes[i].rank));r.grossTotal=sum(r.gross);r.netTotal=r.grossTotal-r.playing;});
 if(format==='STABLEFORD'){
  rounds.forEach(r=>{r.stableford=r.net.map((n,i)=>stableford(n,+holes[i].par));r.stablefordTotal=sum(r.stableford);});
  const a=holes.map((_,i)=>sum(rounds.filter(r=>r.side==='A').map(r=>r.stableford[i])));
  const b=holes.map((_,i)=>sum(rounds.filter(r=>r.side==='B').map(r=>r.stableford[i])));
  const totals=[sum(a),sum(b)],winner=totals[0]>totals[1]?'A':totals[1]>totals[0]?'B':null;
  const wins=a.map((v,i)=>v>b[i]?1:v<b[i]?-1:0);
  return {id:match.id,match,format,complete:true,rounds,holes,a,b,wins,teams,winner,totals,label:totals.join(' – ')+' Stableford points',points:winner==='A'?[2,0]:winner==='B'?[0,2]:[1,1],holesWon:[wins.filter(v=>v===1).length,wins.filter(v=>v===-1).length]};
 }
 const a=holes.map((_,i)=>Math.min(...rounds.filter(r=>r.side==='A').map(r=>r.net[i])));
 const b=holes.map((_,i)=>Math.min(...rounds.filter(r=>r.side==='B').map(r=>r.net[i])));
 const wins=a.map((v,i)=>v<b[i]?1:v>b[i]?-1:0);
 let lead=0,finish=null;
 for(let i=0;i<9;i++){lead+=wins[i];if(!finish&&Math.abs(lead)>8-i)finish={winner:lead>0?'A':'B',label:(Math.abs(lead))+(i===8?' up':' & '+(8-i))};}
 const winner=finish?.winner||null;
 return {id:match.id,match,format,complete:true,rounds,holes,a,b,wins,teams,winner,label:finish?finish.label:'All square',points:winner==='A'?[2,0]:winner==='B'?[0,2]:[1,1],holesWon:[wins.filter(v=>v===1).length,wins.filter(v=>v===-1).length]};
}
function calculate(data){
 for(const key of ['Settings','Teams','Players','Weeks','Fixtures','Matches','Holes','Rounds','Playoffs'])if(!Array.isArray(data[key]))throw Error('Missing data tab: '+key);
 for(const key of ['Teams','Players','Fixtures','Matches'])if(new Set(data[key].map(x=>x.id)).size!==data[key].length)throw Error('Duplicate ID in '+key);
 if(data.Teams.length!==4)throw Error('League requires exactly four teams');
 if(data.Weeks.length!==12||new Set(data.Weeks.map(w=>+w.week)).size!==12)throw Error('Expected 12 unique weeks');
 const scrambleWeeks=data.Weeks.filter(w=>w.format==='SCRAMBLE');
 if(scrambleWeeks.some(w=>+w.week!==7)||scrambleWeeks.length>1)throw Error('The scramble is supported in week 7 only');
 const isScramble=week=>scrambleWeeks.some(w=>+w.week===+week);
 for(const w of data.Weeks){
  if(isScramble(w.week))continue;
  const ff=data.Fixtures.filter(f=>+f.week===+w.week);
  if(ff.length!==2)throw Error('Week '+w.week+': expected two team fixtures');
  if(+w.week<=10&&(new Set(ff.flatMap(f=>[f.teamA,f.teamB])).size!==4||ff.some(f=>![f.teamA,f.teamB].every(id=>data.Teams.some(t=>t.id===id)))))throw Error('Week '+w.week+': each of the four teams must appear exactly once');
  const expected=w.format==='SINGLES'?4:2;
  for(const f of ff){const mm=data.Matches.filter(m=>m.fixture===f.id);if(mm.length!==expected)throw Error('Fixture '+f.id+': expected '+expected+' matches');if(w.format==='SINGLES'&&mm.some(m=>formatFor(data,m)!=='SINGLES'))throw Error('Fixture '+f.id+': all four matches must be SINGLES');}
 }
 for(const r of data.Rounds)if(!data.Matches.some(m=>m.id===r.match))throw Error('Unknown match in Rounds: '+r.match);
 const settings=Object.fromEntries(data.Settings.map(x=>[x.key,x.value]));
 const table=data.Teams.map(t=>({...t,points:0,played:0,w:0,d:0,l:0,holes:0,h2h:0,unresolved:false}));
 const results=[],fixtures=[],issues=[];
 function fixture(f,resolve){
  const teams=[resolve(f.teamA),resolve(f.teamB)];
  const mm=data.Matches.filter(m=>m.fixture===f.id);
  const pp=mm.map(m=>pair(data,m,teams));results.push(...pp);
  const expected=data.Weeks.find(w=>+w.week===+f.week)?.format==='SINGLES'?4:2;
  const complete=mm.length===expected&&pp.every(p=>p.complete);
  const points=[sum(pp.filter(p=>p.complete).map(p=>p.points[0])),sum(pp.filter(p=>p.complete).map(p=>p.points[1]))];
  const p=data.Playoffs.find(p=>p.fixture===f.id);
  let winner=complete?(points[0]>points[1]?teams[0]:points[1]>points[0]?teams[1]:null):null;
  if(complete&&!winner&&+f.week>10&&p&&teams.includes(p.winner)&&!blank(p.note))winner=p.winner;
  const out={...f,teams,pairs:pp,complete,points,winner,loser:winner?teams.find(t=>t!==winner):null,playoff:p};fixtures.push(out);return out;
 }
 const teamId=id=>data.Teams.some(t=>t.id===id)?id:null;
 for(const f of data.Fixtures.filter(f=>+f.week<=10&&!isScramble(f.week))){
  const r=fixture(f,teamId);
  for(const p of r.pairs.filter(p=>p.complete))p.teams.forEach((id,i)=>{const t=table.find(t=>t.id===id);t.points+=p.points[i];t.played++;t.holes+=p.holesWon[i];t[p.points[i]===2?'w':p.points[i]===1?'d':'l']++;});
 }
 const scrambles=scrambleWeeks.map(w=>scramble(data,w));
 scrambles.filter(s=>s.complete).forEach(s=>s.rows.forEach(r=>{const t=table.find(t=>t.id===r.team);t.points+=r.points;t.scramblePoints=r.points;}));
 const groups=new Map();table.forEach(t=>{if(!groups.has(t.points))groups.set(t.points,[]);groups.get(t.points).push(t);});
 for(const group of groups.values()){
  const ids=group.map(t=>t.id);
  for(const p of results.filter(p=>p.complete&&p.teams.every(id=>ids.includes(id))))p.teams.forEach((id,i)=>{group.find(t=>t.id===id).h2h+=p.points[i];});
  for(const t of group){const tied=group.filter(x=>x.h2h===t.h2h&&x.holes===t.holes);if(tied.length>1){const ranks=tied.map(x=>num(x.tieOrder));t.unresolved=ranks.some(r=>!Number.isInteger(r)||r<1||r>4)||new Set(ranks).size!==ranks.length;}}
 }
 table.sort((a,b)=>b.points-a.points||b.h2h-a.h2h||b.holes-a.holes||(a.unresolved?0:num(a.tieOrder)-num(b.tieOrder))||a.id.localeCompare(b.id));
 const regular=fixtures.filter(f=>+f.week<=10);
 const pairWeeks=10-scrambleWeeks.length;
 const regularDone=regular.length===pairWeeks*2&&regular.every(f=>f.complete)&&table.every(t=>t.played===pairWeeks*2)&&scrambles.every(s=>s.complete);
 const seeded=regularDone&&!table.some(t=>t.unresolved);
 const tokens={};if(seeded)table.forEach((t,i)=>tokens['S'+(i+1)]=t.id);
 for(const f of data.Fixtures.filter(f=>+f.week>10).sort((a,b)=>a.week-b.week)){
  const r=fixture(f,id=>tokens[id]||null);if(r.winner){tokens['W'+f.id]=r.winner;tokens['L'+f.id]=r.loser;}
 }
 for(const w of data.Weeks){if(isScramble(w.week)){const rr=(data.Scramble||[]).filter(r=>+r.week===+w.week);if(rr.length!==4||rr.filter(r=>r.date===w.wed).length!==2||rr.filter(r=>r.date===w.sat).length!==2)issues.push('Week 7: assign two scramble teams to each scheduled day');continue;}const ff=fixtures.filter(f=>+f.week===+w.week);if(ff.length!==2)issues.push('Week '+w.week+': expected two team fixtures');const mm=data.Matches.filter(m=>+m.week===+w.week);const daily=w.format==='SINGLES'?4:2;if(mm.length!==daily*2||mm.filter(m=>m.date===w.wed).length!==daily||mm.filter(m=>m.date===w.sat).length!==daily)issues.push('Week '+w.week+': assign '+daily+' matches to each scheduled day');const ids=ff.flatMap(f=>f.teams).filter(Boolean);if(ids.length&&new Set(ids).size!==4)issues.push('Week '+w.week+': each team must appear once');}
 if(scrambleWeeks.length){for(let i=0;i<data.Teams.length;i++)for(let j=i+1;j<data.Teams.length;j++){const a=data.Teams[i].id,b=data.Teams[j].id;if(regular.filter(f=>f.teams.includes(a)&&f.teams.includes(b)).length!==3)issues.push(namePair(a,b)+' must meet exactly three times');}}
 for(const m of data.Matches){const f=data.Fixtures.find(f=>f.id===m.fixture);if(!f||+f.week!==+m.week)throw Error('Match '+m.id+': invalid fixture / week');}
 const stats=data.Players.map(p=>{const rr=results.filter(r=>r.complete).flatMap(r=>r.rounds.filter(x=>x.player===p.id).map(x=>({...x,week:+r.match.week,par:sum(r.holes.map(h=>+h.par)),birdies:x.gross.filter((s,i)=>s===r.holes[i].par-1).length,pars:x.gross.filter((s,i)=>s===+r.holes[i].par).length,eagles:x.gross.filter((s,i)=>s<=r.holes[i].par-2).length})));return {...p,rounds:rr};});
 return {settings,table,results,fixtures,stats,seeded,regularDone,issues,scrambles,pairWeeks};
}
function namePair(a,b){return a+' / '+b;}
root.League={calculate,pair,strokes,round,formatFor,stableford,scramble};
if(typeof module!=='undefined')module.exports=root.League;
})(typeof window==='undefined'?globalThis:window);
