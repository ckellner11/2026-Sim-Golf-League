/* Admin UI stores credentials in memory only. Server authorizes every write. */
window.LiveScoring=(()=>{
 let session=null,client=null,dialog=null,active=null,hole=1,dirty=false,saving=false,openRequest=0;
 const configured=()=>window.LEAGUE_SCORING?.enabled&&window.LEAGUE_SCORING.clientId;
 const authorized=()=>session&&session.expires>Date.now();
 async function request(body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{const res=await fetch(window.LEAGUE_CONFIG.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body),signal:controller.signal,credentials:'omit'});if(!res.ok)throw Error('Could not reach the score service.');const result=await res.json();if(!result.ok)throw Error(result.error||'Scores were not saved.');return result;}
  catch(e){if(e.name==='AbortError')throw Error('Save not confirmed. Your entries are still here; retry to verify them.');throw e;}
  finally{clearTimeout(timer);}
 }
 function status(text,error=false){const el=document.getElementById('scorer-status');if(el){el.textContent=text;el.classList.toggle('live-error',error);}}
 async function login(response){
  if(response.error||!response.code){status('Sign-in canceled or unsuccessful.',true);return;}
  status('Verifying Google account…');
  try{session=await request({action:'signIn',code:response.code});status('Signed in as '+session.email);decorate();}
  catch(e){session=null;status(e.message,true);}
 }
 function decorate(){
  document.querySelectorAll('.scorer-action').forEach(el=>{
   el.replaceChildren();if(!authorized())return;
   const button=document.createElement('button');button.textContent='Enter scores';button.onclick=()=>open(el.dataset.match);el.append(button);
  });
  const button=document.getElementById('scorer-signin');if(button)button.textContent=authorized()?'Sign out of scoring':'Admin sign-in';
 }
 function init(){
  const footer=document.querySelector('footer');if(!footer)return;
  const controls=document.createElement('div');controls.className='live-signin';controls.innerHTML='<button id="scorer-signin">Admin sign-in</button><span id="scorer-status" role="status"></span>';footer.append(controls);
  document.getElementById('scorer-signin').onclick=async()=>{
   if(authorized()){const old=session;session=null;decorate();status('Signed out.');try{await request({action:'signOut',session:old.session});}catch{}return;}
   if(!configured()){status('Live scoring is awaiting Google sign-in setup. Public scores remain available.');return;}
   if(!client){status('Google sign-in is loading. Please try again shortly.');return;}
   client.requestCode();
  };
  if(configured()){
   const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
   script.onload=()=>{client=google.accounts.oauth2.initCodeClient({client_id:window.LEAGUE_SCORING.clientId,scope:'openid email',ux_mode:'popup',callback:login,error_callback:()=>status('Google sign-in could not open. Allow the sign-in popup and try again.',true)});};
   script.onerror=()=>status('Google sign-in could not load. Check your connection.',true);document.head.append(script);
  }
  // Polling is read-only. Never replace a scorer's unsaved inputs.
  setInterval(()=>{if(!document.hidden&&!dialog?.open&&typeof load==='function')load();},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!dialog?.open&&typeof load==='function')load();});
  window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
  decorate();
 }
 async function open(id){
  if(!authorized()){status('Please sign in again.',true);decorate();return;}
  const ticket=++openRequest;
  if(!dialog){dialog=document.createElement('dialog');dialog.className='live-dialog';dialog.setAttribute('aria-label','Enter match scores');document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});}
  dirty=false;
  dialog.innerHTML='<button class="live-close" aria-label="Close score entry">Close</button><h2>Live scoring</h2><p role="status">Loading the latest scores…</p>';
  dialog.querySelector('.live-close').onclick=close;
  if(!dialog.open)dialog.showModal();
  // Reuse only a recent successful network read, never a restored browser cache.
  if(loading||!lastFreshLeagueAt||Date.now()-lastFreshLeagueAt>30000){
   const ok=await load();
   if(ticket!==openRequest||!dialog.open)return;
   if(!ok){dialog.querySelector('[role="status"]').textContent='Could not refresh scores. Close this window and try again. Score entry is unavailable until fresh data loads.';return;}
  }
  if(ticket!==openRequest||!dialog.open)return;
  active=model.results.find(p=>p.id===id);
  const setup=active?scorecardSetup(active):{error:'Match not found. Refresh the schedule.'};
  if(setup.error||setup.allocationPending){dialog.querySelector('[role="status"]').textContent=setup.error||setup.allocationMessage;return;}
  hole=setup.holes.findIndex((h,i)=>setup.rounds.some(r=>r.gross[i]===''))+1;if(hole===0)hole=1;draw();
 }

 function close(){if(saving)return;if(dirty&&!confirm('Discard the unsaved scores for this hole?'))return;dirty=false;openRequest++;dialog.close();load();}
 function draw(){
  const p=scorecardSetup(active),h=p.holes[hole-1],w=data.Weeks.find(w=>+w.week===+active.match.week);
  dialog.innerHTML=`<button class="live-close" aria-label="Close score entry">Close</button><p>Week ${esc(w.week)} · ${esc(date(active.match.date))} · ${esc(matchTime(active.match,w))}</p><h2>Live scoring</h2><p>${esc(formatName(p.format))}</p><div class="live-total"></div><p class="live-summary" aria-live="polite"></p><div class="live-hole-nav"><button id="score-prev" ${hole===1?'disabled':''} aria-label="Previous hole">‹</button><strong>Hole ${esc(h.courseHole||h.hole)} · Par ${esc(h.par)} · Rank ${esc(h.rank)}</strong><button id="score-next" ${hole===9?'disabled':''} aria-label="Next hole">›</button></div><div class="live-inputs">${p.rounds.map(r=>`<label class="live-input-row"><span>${esc(player(r.player))}<small> ${League.strokes(r.shots,+h.rank)} stroke(s)</small></span><input type="number" min="1" max="30" step="1" inputmode="numeric" data-player="${esc(r.player)}" aria-label="${esc(player(r.player))} gross score" value="${esc(r.gross[hole-1])}"><span class="live-points" data-points="${esc(r.player)}"></span></label>`).join('')}</div><button class="live-save">${hole===9?'Save hole':'Save & next hole'}</button><p class="live-save-status" role="status">Enter gross scores; nothing is saved until you press Save.</p>`;
  dialog.querySelector('.live-close').onclick=close;
  for(const [id,direction] of [['score-prev',-1],['score-next',1]])dialog.querySelector('#'+id).onclick=()=>{if(dirty&&!confirm('Discard unsaved entries and change holes?'))return;hole+=direction;dirty=false;draw();};
  dialog.querySelectorAll('input').forEach(input=>input.oninput=()=>{dirty=true;preview();dialog.querySelector('.live-save-status').textContent='Unsaved changes';});
  dialog.querySelector('.live-save').onclick=save;preview();
 }
 function preview(){
  const copy=structuredClone(data),inputs=[...dialog.querySelectorAll('input[data-player]')];
  inputs.forEach(input=>{const r=copy.Rounds.find(r=>r.match===active.id&&r.player===input.dataset.player);r['h'+hole]=input.value;});
  const original=data;let p;
  try{data=copy;p=scorecardSetup({...active,complete:false});const summary=matchLiveTotals({...active,complete:false});dialog.querySelector('.live-total').innerHTML=['A','B'].map((side,i)=>`<div>${p.rounds.filter(r=>r.side===side).map(r=>esc(player(r.player))).join(' + ')}<strong>${esc(summary.values[i])}</strong></div>`).join('');
   const summaryLabel=dialog.querySelector('.live-summary');if(!summary.played)summaryLabel.textContent='Awaiting scores';else if(p.format==='STABLEFORD'){const margin=Number(summary.values[0])-Number(summary.values[1]);summaryLabel.textContent=(margin===0?'Tied':p.rounds.filter(r=>r.side===(margin>0?'A':'B')).map(r=>player(r.player)).join(' + ')+' lead by '+Math.abs(margin))+' · '+summary.played+' hole(s) scored';}else summaryLabel.textContent='Through '+summary.played+' hole(s)';
   inputs.forEach(input=>{const r=p.rounds.find(r=>r.player===input.dataset.player),h=p.holes[hole-1],gross=r.gross[hole-1];const el=[...dialog.querySelectorAll('[data-points]')].find(el=>el.dataset.points===r.player);el.textContent=Number.isInteger(gross)?p.format==='STABLEFORD'?League.stableford(gross-League.strokes(r.shots,+h.rank),+h.par)+' pts · '+r.gross.reduce((sum,g,i)=>sum+(Number.isInteger(g)?League.stableford(g-League.strokes(r.shots,+p.holes[i].rank),+p.holes[i].par):0),0)+' total':'Net '+(gross-League.strokes(r.shots,+h.rank)):'—';});
  }finally{data=original;}
 }
 async function save(){
  if(saving)return;if(!authorized()){dialog.querySelector('.live-save-status').textContent='Session expired. Close and sign in again before saving.';return;}
  const scores=[...dialog.querySelectorAll('input[data-player]')].map(input=>({player:input.dataset.player,gross:input.value===''?NaN:Number(input.value),before:data.Rounds.find(r=>r.match===active.id&&r.player===input.dataset.player)['h'+hole]}));
  const notice=dialog.querySelector('.live-save-status');
  if(scores.some(r=>!Number.isInteger(r.gross)||r.gross<1||r.gross>30)){notice.textContent='Enter a whole-number gross score from 1 to 30 for every player.';return;}
  saving=true;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);notice.textContent='Saving to Google Sheets…';
  try{const result=await request({action:'saveHole',session:session.session,match:active.id,hole,scores});
   result.scores.forEach(s=>{data.Rounds.find(r=>r.match===active.id&&r.player===s.player)['h'+hole]=s.gross;});model=League.calculate(data);active=model.results.find(p=>p.id===active.id);dirty=false;const savedHole=hole;if(hole<9)hole++;draw();dialog.querySelector('.live-save-status').textContent='Saved hole '+courseHoleLabel(active.match.week,savedHole)+' to Google Sheets.';render();
  }catch(e){notice.textContent='Not saved / not confirmed: '+e.message;notice.classList.add('live-error');dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  finally{saving=false;}
 }
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
 return {decorate};
})();
