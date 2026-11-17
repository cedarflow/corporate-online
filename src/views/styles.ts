export const CSS = `
:root{
  /* Theme: slate & sky blue. Change colours here. */
  --bg:#f4f7fa;--panel:#fff;--ink:#17202b;--muted:#5b6778;--line:#e1e7ee;--soft:#eef3f8;
  --brand:#1d6fb8;--brand-hover:#175a96;--brand-ink:#fff;--brand-soft:#e3effa;--focus:#93c5fd;--accent:#38bdf8;
  --side-bg:#0f2742;--side-ink:#dbe6f2;--side-link:#bfd0e4;--side-muted:#8ba3bf;--side-hover:rgba(255,255,255,.07);--side-on:rgba(56,189,248,.18);
  --logo-bg:#38bdf8;--logo-ink:#0f2742;--row-hover:#f7fafd;--th-bg:#f8fafc;
  --ok:#15803d;--ok-bg:#e3f5e9;--warn:#92400e;--warn-bg:#fef3c7;--bad:#b42318;--bad-bg:#fde8e6;--info:#1d4ed8;--info-bg:#e5edfd;
  --radius:10px;--shadow:0 1px 2px rgba(15,39,66,.06),0 2px 8px rgba(15,39,66,.04);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;color:var(--ink);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);line-height:1.45}
a{color:var(--brand)}
h1{font-size:1.55rem;margin:0 0 .25rem;letter-spacing:-.01em}
h2{font-size:1.1rem;margin:0 0 .75rem}
h3{font-size:.95rem;margin:0 0 .5rem}
p{margin:.25rem 0 .75rem}
.muted{color:var(--muted)}.small{font-size:.85rem}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem}
.app{display:grid;grid-template-columns:232px 1fr;min-height:100vh;background:linear-gradient(to right,var(--side-bg) 232px,transparent 232px)}
.side{background:var(--side-bg);color:var(--side-ink);padding:18px 12px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;padding:4px 8px 18px;text-decoration:none}
.brand .logo{width:30px;height:30px;border-radius:8px;background:var(--logo-bg);color:var(--logo-ink);display:grid;place-items:center;font-weight:800}
.nav a{display:flex;gap:10px;align-items:center;color:var(--side-link);text-decoration:none;padding:8px 10px;border-radius:8px;margin:1px 0}
.nav a:hover{background:var(--side-hover);color:#fff}
.nav a.on{background:var(--side-on);box-shadow:inset 3px 0 0 var(--logo-bg);color:#fff;font-weight:600}
.nav .count{margin-left:auto;background:var(--bad);color:#fff;border-radius:99px;font-size:.72rem;padding:1px 7px}
.side .me{margin-top:auto;border-top:1px solid rgba(255,255,255,.12);padding:12px 8px 0;font-size:.85rem}
.side .me button{background:none;border:0;color:var(--side-link);padding:0;cursor:pointer;text-decoration:underline;font:inherit}
main{padding:26px 32px 60px;max-width:1240px;width:100%}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.crumbs{font-size:.85rem;color:var(--muted);margin-bottom:4px}.crumbs a{color:var(--muted)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px 20px;margin-bottom:16px}
.card.flush{padding:0;overflow:hidden}
.card.flush > h2{padding:16px 20px 0}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.stat{padding:16px 18px}.stat .n{font-size:1.7rem;font-weight:700}.stat .l{color:var(--muted);font-size:.85rem}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;background:var(--th-bg)}
tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover{background:var(--row-hover)}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--ink);padding:8px 14px;border-radius:8px;font:inherit;font-weight:600;font-size:.9rem;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{border-color:#c3ccd8}
.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}.btn.primary:hover{background:var(--brand-hover);border-color:var(--brand-hover)}
.btn.danger{color:var(--bad)}.btn.sm{padding:4px 10px;font-size:.82rem}.btn.link{border:0;background:none;padding:0;color:var(--brand);font-weight:500}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.spread{justify-content:space-between}
.badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:.76rem;font-weight:600;background:var(--soft);color:var(--muted);white-space:nowrap}
.b-ok{background:var(--ok-bg);color:var(--ok)}.b-warn{background:var(--warn-bg);color:var(--warn)}.b-bad{background:var(--bad-bg);color:var(--bad)}.b-info{background:var(--info-bg);color:var(--info)}.b-brand{background:var(--brand-soft);color:var(--brand)}
form.stack > *{margin-bottom:12px}
label{display:block;font-weight:600;font-size:.85rem;margin-bottom:4px}
label .hint{font-weight:400;color:var(--muted)}
input,select,textarea{width:100%;font:inherit;padding:8px 10px;border:1px solid #cfd8e3;border-radius:8px;background:#fff;color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--focus);border-color:var(--brand)}
input[type=checkbox],input[type=radio]{width:auto}
textarea{min-height:90px}
.fields{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.check{display:flex;gap:8px;align-items:center;font-weight:500}
.flash{padding:10px 14px;border-radius:8px;margin-bottom:16px;font-weight:500}
.flash.ok{background:var(--ok-bg);color:var(--ok)}.flash.error{background:var(--bad-bg);color:var(--bad)}
.alert{padding:10px 14px;border-radius:8px;margin:8px 0;font-size:.9rem}
.alert.warn{background:var(--warn-bg);color:var(--warn)}.alert.bad{background:var(--bad-bg);color:var(--bad)}.alert.info{background:var(--info-bg);color:var(--info)}
.tabs{display:flex;flex-wrap:wrap;gap:2px 4px;border-bottom:1px solid var(--line);margin:0 0 18px}
.tabs a{padding:9px 14px;text-decoration:none;color:var(--muted);font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.tabs a.on{color:var(--brand);border-color:var(--brand)}
.pipeline{display:flex;gap:4px;margin:6px 0 2px}
.pipeline span{flex:1;height:6px;border-radius:3px;background:var(--line)}.pipeline span.on{background:var(--brand)}
.kv{display:grid;grid-template-columns:170px 1fr;gap:6px 14px;margin:0}
.kv dt{color:var(--muted);font-size:.88rem}.kv dd{margin:0;white-space:pre-line}
.empty{text-align:center;color:var(--muted);padding:30px 10px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.filters input,.filters select{width:auto;min-width:160px}
details.inline summary{cursor:pointer;color:var(--brand);font-weight:600;list-style:none}
details.inline[open] summary{margin-bottom:10px}
.steps{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.steps button{border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 14px;font:inherit;font-size:.85rem;cursor:pointer;color:var(--muted)}
.steps button.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.step{display:none}.step.on{display:block}
.rows .rowitem{border:1px dashed #cfd8e3;border-radius:8px;padding:12px;margin-bottom:10px;position:relative}
.rows .rowitem .rm{position:absolute;top:6px;right:8px}
.preview-name{font-size:1.25rem;font-weight:700;padding:12px 14px;background:var(--brand-soft);border-radius:8px;color:var(--brand)}
.namecheck ul{margin:6px 0;padding-left:18px}
.list-plain{list-style:none;margin:0;padding:0}.list-plain li{padding:10px 0;border-bottom:1px solid var(--line)}.list-plain li:last-child{border:0}
.auth{max-width:400px;margin:10vh auto;padding:0 16px}
.bar{height:8px;background:var(--soft);border-radius:4px;overflow:hidden;min-width:80px}.bar i{display:block;height:100%;background:var(--brand)}
.done td{color:var(--muted)}.done td .t{text-decoration:line-through}
@media (max-width:900px){.app{grid-template-columns:1fr;background:none}.side{position:static;height:auto}.g2,.g3{grid-template-columns:1fr}.g4{grid-template-columns:1fr 1fr}.stat .n{font-size:1.4rem}main{padding:18px 16px}.kv{grid-template-columns:1fr}}

/* Printable documents */
.doc-wrap{background:#e6ebf1;min-height:100vh;padding:24px}
.doc-tools{max-width:820px;margin:0 auto 12px;display:flex;gap:8px}
.doc{background:#fff;max-width:820px;margin:0 auto;padding:64px 72px;box-shadow:var(--shadow);font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.55}
.doc h1{font-size:16pt;text-align:center;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
.doc h2{font-size:13pt;text-align:center;font-weight:normal;margin-bottom:24px}
.doc .body{white-space:pre-wrap}
.doc table th,.doc table td{border:1px solid #999;padding:6px 8px;font-size:10.5pt}
.doc table th{background:#f2f2f2;color:#222;text-transform:none;letter-spacing:0}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:36px 48px;margin-top:48px}
.sig{border-top:1px solid #222;padding-top:4px;font-size:10.5pt}
.cert{border:10px double var(--brand);padding:40px;text-align:center}
.cert .big{font-size:22pt;font-weight:bold;margin:10px 0}
.page-break{page-break-after:always;break-after:page;border-bottom:1px dashed #bbb;padding-bottom:32px;margin-bottom:40px}
@media print{.page-break{border:0;padding:0;margin:0}.doc-wrap{background:#fff;padding:0}.doc-tools{display:none}.doc{box-shadow:none;margin:0;max-width:none;padding:0}@page{margin:2cm}}
`;

export const JS = `
(function(){
  // Wizard steps
  document.querySelectorAll('[data-wizard]').forEach(function(w){
    var steps = w.querySelectorAll('.step'), btns = w.querySelectorAll('.steps button');
    function go(i){ steps.forEach(function(s,j){s.classList.toggle('on',i===j)}); btns.forEach(function(b,j){b.classList.toggle('on',i===j)}); window.scrollTo(0,0); }
    btns.forEach(function(b,i){ b.addEventListener('click',function(e){e.preventDefault();go(i)}) });
    w.querySelectorAll('[data-next]').forEach(function(b){ b.addEventListener('click',function(e){e.preventDefault(); var cur=[].indexOf.call(steps,w.querySelector('.step.on')); var inv=steps[cur].querySelector(':invalid'); if(inv){inv.reportValidity();return;} go(cur+1)}) });
    w.querySelectorAll('[data-prev]').forEach(function(b){ b.addEventListener('click',function(e){e.preventDefault(); var cur=[].indexOf.call(steps,w.querySelector('.step.on')); go(cur-1)}) });
    w.addEventListener('submit',function(){ steps.forEach(function(s){s.classList.add('on')}) });
    go(0);
  });
  // Repeatable rows
  document.querySelectorAll('[data-add-row]').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.preventDefault();
      var list=document.getElementById(btn.getAttribute('data-add-row'));
      var tpl=document.getElementById(btn.getAttribute('data-add-row')+'-tpl');
      list.insertAdjacentHTML('beforeend',tpl.innerHTML);
    });
  });
  document.addEventListener('click',function(e){
    var rm=e.target.closest('[data-remove-row]'); if(!rm) return; e.preventDefault();
    var list=rm.closest('.rows'); if(list.querySelectorAll('.rowitem').length>1) rm.closest('.rowitem').remove();
  });
  // Show/hide by name type, mode etc.
  function sync(){
    document.querySelectorAll('[data-show-when]').forEach(function(el){
      var p=el.getAttribute('data-show-when').split('='), input=document.querySelector('[name="'+p[0]+'"]:checked')||document.querySelector('select[name="'+p[0]+'"]');
      var vals=p[1].split('|'); var on=input && vals.indexOf(input.value)>=0; el.style.display=on?'':'none';
      el.querySelectorAll('input,select,textarea').forEach(function(i){ if(i.hasAttribute('data-req')) i.required=on; });
    });
  }
  document.addEventListener('change',sync); sync();
  // Live name preview + check
  var form=document.querySelector('[data-name-preview]');
  if(form){
    var t; function upd(){ clearTimeout(t); t=setTimeout(function(){
      var fd=new FormData(form), q=new URLSearchParams();
      ['jurisdiction','name_type','distinctive','descriptive','legal_ending'].forEach(function(k){q.set(k,fd.get(k)||'')});
      fetch('/companies/name-check?'+q).then(function(r){return r.text()}).then(function(h){document.getElementById('name-check').innerHTML=h});
    },250)}
    form.addEventListener('input',upd); form.addEventListener('change',upd); upd();
  }
  // Auto-submit selects
  document.querySelectorAll('[data-autosubmit]').forEach(function(el){ el.addEventListener('change',function(){ el.form.submit(); }); });
  // Print
  document.querySelectorAll('[data-print]').forEach(function(b){ b.addEventListener('click',function(){ window.print(); }); });
  // Confirm
  document.addEventListener('submit',function(e){ var m=e.target.getAttribute('data-confirm'); if(m && !confirm(m)) e.preventDefault(); });
})();
`;
