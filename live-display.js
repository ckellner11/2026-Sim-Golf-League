/* Read-only match previews. Official standings remain in the unchanged engine. */
function matchLiveTotals(result){
 const p=scorecardSetup(result);if(p.error||p.allocationPending)return {played:0,values:['—','—']};
 const sides=['A','B'].map(side=>p.rounds.filter(r=>r.side===side));
 let played=0,lead=0,totals=[0,0],continuous=true;
 for(let i=0;i<p.holes.length;i++){
  const ready=sides.every(rows=>rows.length&&rows.every(r=>Number.isInteger(r.gross[i])&&Number.isFinite(r.shots)));
  if(!ready){continuous=false;continue;}
  if(p.format!=='STABLEFORD'&&!continuous)continue;
  played++;const h=p.holes[i];
  if(p.format==='STABLEFORD')sides.forEach((rows,j)=>totals[j]+=rows.reduce((sum,r)=>sum+League.stableford(r.gross[i]-League.strokes(r.shots,+h.rank),+h.par),0));
  else {const net=sides.map(rows=>Math.min(...rows.map(r=>r.gross[i]-League.strokes(r.shots,+h.rank))));lead+=net[0]<net[1]?1:net[0]>net[1]?-1:0;}
 }
 const label=n=>n>0?n+' UP':n<0?Math.abs(n)+' DN':'AS';
 return {played,values:played?(p.format==='STABLEFORD'?totals:p.complete?[p.winner==='A'?p.label:p.winner?'Loss':'AS',p.winner==='B'?p.label:p.winner?'Loss':'AS']:[label(lead),label(-lead)]):['—','—']};
}
function mobileScorecard(p){
 const rounds=[...p.rounds].sort((a,b)=>a.side.localeCompare(b.side));
 const header=rounds.map(r=>`<th scope="col">${esc(player(r.player))}<small>(${r.shots===null?'pending':esc(r.shots)})</small></th>`).join('');
 let lead=0,continuous=true;
 const teamRows=p.holes.map((h,i)=>{
  const sides=['A','B'].map(side=>rounds.filter(r=>r.side===side)),ready=!p.allocationPending&&sides.every(rr=>rr.length&&rr.every(r=>Number.isInteger(r.gross[i])&&Number.isFinite(r.shots)));
  if(p.format==='STABLEFORD')return `<tr><th>${esc(h.courseHole||h.hole)}</th>${sides.map(rr=>`<td>${ready?rr.reduce((sum,r)=>sum+League.stableford(r.gross[i]-League.strokes(r.shots,+h.rank),+h.par),0):'—'}</td>`).join('')}</tr>`;
  if(!ready)continuous=false;
  if(continuous){const net=sides.map(rr=>Math.min(...rr.map(r=>r.gross[i]-League.strokes(r.shots,+h.rank))));lead+=net[0]<net[1]?1:net[0]>net[1]?-1:0;}
  const label=continuous?(lead>0?lead+' UP':lead<0?Math.abs(lead)+' DN':'AS'):'—';
  return `<tr><th>${esc(h.courseHole||h.hole)}</th><td class="match-${!continuous?'square':lead>0?'up':lead<0?'down':'square'}">${label}</td></tr>`;
 }).join('');
 const totals=matchLiveTotals(p);
 return `<div class="mobile-scorecard"><table><caption>Gross scorecard</caption><thead><tr><th>Hole<small>Par / Rank</small></th>${header}</tr></thead><tbody>${p.holes.map((h,i)=>`<tr><th scope="row">${esc(h.courseHole||h.hole)}<small>Par ${esc(h.par)} / ${esc(h.rank)}</small></th>${rounds.map(r=>`<td><span class="score-cell-content">${golfScore(r.gross[i],h.par)}${strokeDots(r.shots,h.rank)}</span></td>`).join('')}</tr>`).join('')}<tr class="scorecard-summary"><th>Total</th>${rounds.map(r=>`<td>${esc(r.grossTotal||'—')}</td>`).join('')}</tr></tbody></table><table class="mobile-match-totals"><caption>${p.format==='STABLEFORD'?'Team Stableford points':'Match · '+esc(name(p.teams[0]))+' perspective'}</caption><thead><tr><th>Hole</th>${p.format==='STABLEFORD'?p.teams.map(t=>`<th>${esc(name(t))}</th>`).join(''):'<th>Match</th>'}</tr></thead><tbody>${teamRows}<tr class="scorecard-summary"><th>Total</th>${(p.format==='STABLEFORD'?totals.values:[p.complete?p.label:totals.values[0]]).map(v=>`<td>${esc(v)}</td>`).join('')}</tr></tbody></table></div>`;
}
function estimatedNextHandicap(h){
 if(data.baselinePending||!h.approved||!Number.isFinite(h.current))return null;
 const closed=new Set((data.HandicapWeeks||[]).map(w=>+w.week));
 const pending=LeagueExtras.individualRounds(data).filter(r=>r.player===h.player&&r.eligible&&!closed.has(r.week)).sort((a,b)=>a.week-b.week);
 if(!pending.length)return null;
 const c=LeagueExtras.config(data),zero=Number(c.zeroReference);
 if(c.zeroReference===''||c.zeroReference==null||!Number.isFinite(zero))return null;
 let current=h.current,window=h.window.map(r=>r.adjusted);
 for(const r of pending){window.push(r.raw);window=window.slice(-6);const calc=LeagueExtras.index(window);const target=Math.max(0,Math.round(Math.max(0,calc.base-zero)*.9));if(r.week<=10||String(c.resumePlayoffUpdates).toLowerCase()==='true')current=Math.max(0,Math.min(current+1,Math.max(current-2,target)));}
 return current;
}
