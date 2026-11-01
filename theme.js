/* Runs before styles to avoid flashing the wrong theme. */
(()=>{
 const root=document.documentElement,key='league-theme',media=window.matchMedia('(prefers-color-scheme: dark)');
 let mode='system';try{const saved=localStorage.getItem(key);if(['system','light','dark'].includes(saved))mode=saved;}catch{}
 function apply(){
  if(mode==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',mode);
  const dark=mode==='dark'||mode==='system'&&media.matches;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.content=mode==='system'?(meta.media.includes('dark')?'#102a23':'#c7d0c3'):(dark?'#102a23':'#c7d0c3'));
  const select=document.getElementById('theme-mode');if(select)select.value=mode;
 }
 apply();media.addEventListener('change',apply);
 document.addEventListener('DOMContentLoaded',()=>{apply();const select=document.getElementById('theme-mode');if(select)select.addEventListener('change',()=>{mode=['system','light','dark'].includes(select.value)?select.value:'system';try{localStorage.setItem(key,mode);}catch{}apply();});});
 window.addEventListener('storage',event=>{if(event.key===key){mode=['system','light','dark'].includes(event.newValue)?event.newValue:'system';apply();}});
})();
