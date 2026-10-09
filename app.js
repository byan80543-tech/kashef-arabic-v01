(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const STORE = "kashef-v01";
  const state = load();
  function load(){try{return Object.assign({scopes:[],reports:[]},JSON.parse(localStorage.getItem(STORE)||"{}"));}catch{return {scopes:[],reports:[]};}}
  function save(){localStorage.setItem(STORE,JSON.stringify(state));}
  function id(){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);}
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function notice(el,msg,kind="ok"){el.className="status "+kind;el.textContent=msg;}
  function showTab(name){$$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));$$(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+name));window.scrollTo({top:document.querySelector(".tabs").offsetTop-80,behavior:"smooth"});}
  $$(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
  $$("[data-go]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.go)));

  function renderScopes(){
    const select=$("#scope-select"), old=select.value;
    select.innerHTML='<option value="">اختر نطاقا مسجلا</option>'+state.scopes.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} — ${esc(s.target)}</option>`).join("");
    if(state.scopes.some(s=>s.id===old))select.value=old;
    const list=$("#scope-list");
    list.innerHTML=state.scopes.length?state.scopes.map(s=>`<article class="item-card"><div><h3>${esc(s.name)}</h3><p>${esc(s.target)}</p><div class="meta">${esc(s.typeLabel)} · أساس الإذن: ${esc(s.proof)}</div>${s.notes?`<p>${esc(s.notes)}</p>`:""}</div><button class="small-btn" data-delete-scope="${esc(s.id)}">حذف</button></article>`).join(""):'<div class="empty">لا توجد نطاقات مسجلة بعد.</div>';
    $$("[data-delete-scope]").forEach(b=>b.addEventListener("click",()=>{state.scopes=state.scopes.filter(s=>s.id!==b.dataset.deleteScope);save();renderScopes();}));
  }
  $("#scope-form").addEventListener("submit",e=>{
    e.preventDefault();
    const type=$("#scope-type").value;
    state.scopes.unshift({id:id(),name:$("#scope-name").value.trim(),type,target:$("#scope-target").value.trim(),proof:$("#scope-proof").value,notes:$("#scope-notes").value.trim(),typeLabel:{web:"موقع ويب",android:"تطبيق أندرويد",both:"موقع وتطبيق"}[type],created:new Date().toISOString()});
    save();e.target.reset();renderScopes();
    alert("أُضيف النطاق إلى السجل المحلي. هذا السجل لا يتحقق مستقلا من صحة الإذن؛ راجع القواعد الرسمية.");
  });

  function hostMatches(url, target){
    // Conservative exact host matching only; no wildcard/subdomain assumptions.
    try{
      const u=new URL(url);
      if(!["http:","https:"].includes(u.protocol))return false;
      const t=target.trim().toLowerCase().replace(/^https?:\/\//,"").split(/[\/?#]/)[0];
      return u.hostname.toLowerCase()===t && (u.protocol==="https:" || ["localhost","127.0.0.1"].includes(u.hostname));
    }catch{return false;}
  }
  function renderResults(items){
    $("#scan-results").innerHTML=items.map(x=>`<article class="result"><div class="state">${esc(x.state)}</div><h3>${esc(x.title)}</h3><p>${esc(x.detail)}</p></article>`).join("");
  }
  $("#scan-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const url=$("#target-url").value.trim(), scope=state.scopes.find(s=>s.id===$("#scope-select").value);
    $("#scan-results").innerHTML="";
    if(!scope){notice($("#scan-status"),"سجّل نطاق إذن واختره قبل الفحص.","error");return;}
    if(!$("#confirm-safe").checked){notice($("#scan-status"),"أكد الإذن الصريح قبل المتابعة.","error");return;}
    if(!["web","both"].includes(scope.type)){notice($("#scan-status"),"النطاق المسجل لتطبيق أندرويد فقط. أضف نطاق ويب منفصلا إذا كان مشمولا بالإذن.","error");return;}
    if(!hostMatches(url,scope.target)){notice($("#scan-status"),"العنوان لا يطابق المضيف المسجل تطابقا تاما. لم يُرسل أي طلب.","error");return;}
    notice($("#scan-status"),"جار إجراء طلب قراءة واحد. قد يمنع المتصفح قراءة الاستجابة بسبب CORS…","ok");
    const items=[];
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),8000);
      let res;
      try{res=await fetch(url,{method:"GET",mode:"cors",credentials:"omit",redirect:"error",cache:"no-store",signal:controller.signal});}
      finally{clearTimeout(timeout);}
      const h=res.headers;
      const checks=[
        ["Content-Security-Policy", "ترويسة CSP", "تساعد على تقليل مخاطر بعض هجمات حقن المحتوى. غيابها مؤشر يستحق المراجعة، وليس ثغرة مؤكدة."],
        ["Strict-Transport-Security", "ترويسة HSTS", "تساعد المتصفح على استخدام HTTPS. تنطبق أهميتها على المواقع المقدمة عبر HTTPS."],
        ["X-Content-Type-Options", "X-Content-Type-Options", "القيمة nosniff تقلل بعض مخاطر تخمين نوع المحتوى."],
        ["Referrer-Policy", "Referrer-Policy", "تحدد مقدار معلومات عنوان الصفحة التي قد تُرسل كمرجع."],
        ["Permissions-Policy", "Permissions-Policy", "تساعد على تقييد استخدام بعض ميزات المتصفح."]
      ];
      items.push({state:"استجابة مقروءة",title:"اتصال الموقع",detail:`استلم المتصفح استجابة HTTP ${res.status}. هذا الفحص لا يقيّم تسجيل الدخول أو صلاحيات الحسابات.`});
      for(const [key,title,desc] of checks){
        const value=h.get(key);
        items.push(value?{state:"عُثر على الترويسة",title,detail:`القيمة المقروءة: ${value.slice(0,240)}. ${desc}`}:{state:"غير موجودة أو غير مكشوفة",title,detail:`لم يتمكن المتصفح من قراءة هذه الترويسة. قد يكون السبب غيابها أو قيود CORS. ${desc}`});
      }
      items.push({state:"مهم",title:"حدود النتيجة",detail:"الترويسات التي يقرأها fetch ليست كاملة بالضرورة. استخدم أدوات المتصفح أو بيئة فحص مصرح بها للتحقق قبل كتابة بلاغ، ولا تصف المؤشر بأنه ثغرة مؤكدة دون إثبات أثر."});
      notice($("#scan-status"),"اكتمل الفحص الأولي. راجع النتائج يدويا قبل اعتبار أي منها مشكلة أمنية.","ok");
    }catch(err){
      const reason=err.name==="AbortError"?"انتهت مهلة الطلب.": "قد يمنع الموقع القراءة من المتصفح بسبب CORS أو سياسة الشبكة، أو قد يكون العنوان غير متاح.";
      notice($("#scan-status"),reason+" لم يُجر التطبيق أي تجاوز لهذه القيود. يمكنك تسجيل ملاحظة يدوية في البلاغات.","error");
      items.push({state:"تعذر التحقق",title:"لم يتمكن المتصفح من قراءة الاستجابة",detail:"هذا لا يعني وجود ثغرة ولا عدم وجودها. لا يحاول كاشف تجاوز CORS أو تسجيل الدخول أو ضوابط الموقع."});
    }
    renderResults(items);
  });

  function renderReports(){
    $("#report-list").innerHTML=state.reports.length?state.reports.map(r=>`<article class="item-card"><div><h3>${esc(r.title)}</h3><p>${esc(r.target)}</p><div class="meta">${esc(r.kind)} · الخطورة: ${esc(r.severity)} · ${new Date(r.created).toLocaleDateString("ar")}</div></div><button class="small-btn" data-delete-report="${esc(r.id)}">حذف</button></article>`).join(""):'<div class="empty">لم تحفظ أي بلاغ بعد.</div>';
    $$("[data-delete-report]").forEach(b=>b.addEventListener("click",()=>{state.reports=state.reports.filter(r=>r.id!==b.dataset.deleteReport);save();renderReports();}));
  }
  $("#report-form").addEventListener("submit",e=>{
    e.preventDefault();
    state.reports.unshift({id:id(),title:$("#report-title").value.trim(),target:$("#report-target").value.trim(),kind:$("#report-kind").value,severity:$("#report-severity").value,summary:$("#report-summary").value.trim(),steps:$("#report-steps").value.trim(),evidence:$("#report-evidence").value.trim(),created:new Date().toISOString()});
    save();e.target.reset();renderReports();alert("تم حفظ البلاغ محليا على هذا الجهاز.");
  });
  function download(name,content,type){
    const blob=new Blob([content],{type});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  $("#export-json").addEventListener("click",()=>download("kashef-export.json",JSON.stringify({exportedAt:new Date().toISOString(),scopes:state.scopes,reports:state.reports},null,2),"application/json;charset=utf-8"));
  $("#export-md").addEventListener("click",()=>{
    const md=state.reports.map(r=>`# ${r.title}\n\n- الأصل: ${r.target}\n- النوع: ${r.kind}\n- الخطورة المقدرة: ${r.severity}\n- التاريخ: ${r.created}\n\n## الملخص والأثر المحتمل\n${r.summary}\n\n## خطوات إعادة الإنتاج الآمنة\n${r.steps}\n\n## الأدلة غير الحساسة\n${r.evidence||"لم تُرفق أدلة."}\n\n---\n`).join("\n");
    download("kashef-reports.md",md||"# لا توجد بلاغات محفوظة بعد\n","text/markdown;charset=utf-8");
  });
  $("#clear-data").addEventListener("click",()=>{if(confirm("هل تريد حذف جميع النطاقات والبلاغات المحفوظة محليا؟ لا يمكن التراجع عن ذلك.")){localStorage.removeItem(STORE);state.scopes=[];state.reports=[];renderScopes();renderReports();$("#scan-results").innerHTML="";$("#scan-status").className="status hidden";}});
  renderScopes();renderReports();
})();
