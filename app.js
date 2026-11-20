const SUPABASE_URL="https://rjbiahkjfmhexexssczg.supabase.co";
const SUPABASE_KEY="sb_publishable_4_pS_PYlIamm6eXOWzGmTg_IY0mN-oR";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const views=["homeView","studentView","adminLoginView","changePasswordView","adminView"];
const levels=[{points:75,name:"الساعي"},{points:100,name:"البرونزي"},{points:150,name:"الفضي"},{points:200,name:"الذهبي"},{points:250,name:"الماسي"},{points:300,name:"الملكي"}];
let pendingAdmin=null,lastBootstrapCredentials=[];
function show(id){views.forEach(v=>$(v).classList.toggle("hidden",v!==id));window.scrollTo({top:0,behavior:"smooth"})}
function msg(id,t,bad=false){$(id).textContent=t;$(id).style.color=bad?"#f1a39a":"#b58b3b"}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function level(points){let current=null;for(const item of levels){if(points>=item.points)current=item;else break}return current?.name||"بدون مستوى"}
function localDate(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function monthStart(){return localDate().slice(0,8)+"01"}
async function currentAdmin(){const r=await db.auth.getUser();if(r.error||!r.data.user)throw Error("انتهت الجلسة، سجل الدخول مرة أخرى.");return r.data.user}
async function activeMonthly(){const r=await db.from("competitions").select("id,month_start,title,status,created_at").eq("status","active").maybeSingle();if(r.error)throw r.error;return r.data}
async function activeWeekly(){const r=await db.from("weekly_challenges").select("id,week_start,title,status,created_at").eq("status","active").maybeSingle();if(r.error)throw r.error;return r.data}
async function writeAudit(user,action,type,id,details={}){const r=await db.from("admin_audit_logs").insert({admin_user_id:user.id,action,entity_type:type,entity_id:id?String(id):null,details});if(r.error)throw r.error}
function dateText(value){if(!value)return "—";return new Date(value+"T00:00:00").toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric"})}
$("studentOpen").onclick=()=>show("studentView");
$("adminOpen").onclick=()=>show("adminLoginView");
document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>show("homeView"));
$("themeToggle").onclick=()=>document.body.classList.toggle("dark");
$("studentForm").onsubmit=e=>{e.preventDefault();const ok=/^\d{5}$/.test($("studentCode").value.trim());msg("studentMessage",ok?"الاستعلام الآمن قيد التجهيز، ولم نفتح عرض بيانات الطلاب بعد.":"الكود لازم يكون خمسة أرقام.",!ok)};
async function routeAdmin(user){
  const a=await db.from("admin_profiles").select("username,display_name,is_active,must_change_password").eq("user_id",user.id).maybeSingle();
  if(a.error||!a.data||!a.data.is_active){await db.auth.signOut();throw Error("هذا الحساب غير معتمد كمشرف.")}
  pendingAdmin={id:user.id,profile:a.data};
  $("adminWelcome").textContent="أهلًا "+a.data.display_name;
  if(a.data.must_change_password) show("changePasswordView");
  else {show("adminView");await loadDashboard()}
}
$("loginForm").onsubmit=async e=>{
  e.preventDefault();
  const u=$("username").value.trim().toLowerCase(),p=$("password").value;
  if(!/^[a-z0-9._-]{3,32}$/.test(u)){msg("loginMessage","اسم المستخدم يجب أن يكون 3–32 حرفًا إنجليزيًا أو رقمًا.",true);return}
  msg("loginMessage","جاري التحقق...");
  const r=await db.auth.signInWithPassword({email:u+"@admins.safwa.local",password:p});
  if(r.error){msg("loginMessage","اسم المستخدم أو كلمة المرور غير صحيحة.",true);return}
  try{await routeAdmin(r.data.user)}catch(e){msg("loginMessage",e.message,true)}
};
$("changePasswordForm").onsubmit=async e=>{
  e.preventDefault();
  const p=$("newAdminPassword").value,c=$("confirmAdminPassword").value;
  if(p.length<12){msg("changePasswordMessage","كلمة المرور لازم تكون 12 حرفًا على الأقل.",true);return}
  if(p!==c){msg("changePasswordMessage","كلمتا المرور غير متطابقتين.",true);return}
  msg("changePasswordMessage","جاري تحديث كلمة المرور...");
  const r=await db.auth.updateUser({password:p});
  if(r.error){msg("changePasswordMessage","تعذر تغيير كلمة المرور: "+r.error.message,true);return}
  const u=await db.from("admin_profiles").update({must_change_password:false}).eq("user_id",pendingAdmin.id);
  if(u.error){msg("changePasswordMessage","تم تغيير كلمة المرور، لكن تعذر تحديث حالة الحساب. تواصل مع المسؤول.",true);return}
  pendingAdmin.profile.must_change_password=false;
  msg("changePasswordMessage","تم تغيير كلمة المرور بنجاح.");
  show("adminView");await loadDashboard()
};
$("logoutBtn").onclick=async()=>{await db.auth.signOut();pendingAdmin=null;show("homeView")};
async function loadDashboard(){
  try{
    const [s,a,c,w,t]=await Promise.all([
      db.from("students").select("id,student_code,full_name,is_active").order("full_name"),
      db.from("admin_profiles").select("user_id",{count:"exact",head:true}).eq("is_active",true),
      activeMonthly(),activeWeekly(),
      db.from("student_lifetime_totals").select("student_id,full_name,student_code,is_active,total_points")
    ]);
    if(s.error)throw s.error;if(a.error)throw a.error;if(t.error)throw t.error;
    const ranked=[...(t.data||[])].sort((x,y)=>y.total_points-x.total_points||x.full_name.localeCompare(y.full_name,"ar"));
    const sum=ranked.reduce((n,x)=>n+x.total_points,0);
    $("studentsCount").textContent=s.data.length;$("adminsCount").textContent=a.count??0;$("pointsCount").textContent=sum;
    const rankById=new Map();let currentRank=0,previousPoints=null;
    ranked.forEach((x,i)=>{if(i===0||x.total_points!==previousPoints)currentRank=i+1;rankById.set(x.student_id,currentRank);previousPoints=x.total_points});
    $("studentsTable").innerHTML=s.data.length?s.data.map(x=>{
      const v=ranked.find(y=>y.student_id===x.id),points=v?.total_points??0;
      return "<tr><td>"+esc(x.full_name)+"</td><td>"+esc(x.student_code)+"</td><td>"+points+"</td><td>"+level(points)+"</td><td>"+(rankById.get(x.id)||"—")+"</td><td class='"+(x.is_active?"status-active":"")+"'>"+(x.is_active?"نشط":"موقوف")+"</td></tr>"
    }).join(""):'<tr><td colspan="6">لا يوجد طلاب حتى الآن</td></tr>';
    $("pointsStudent").innerHTML='<option value="">اختر الطالب</option>'+s.data.filter(x=>x.is_active).map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+" — "+esc(x.student_code)+"</option>").join("");
    renderPeriodControls(c,w);await loadHistory()
  }catch(e){msg("addStudentMessage","تعذر تحميل البيانات: "+e.message,true)}
}
function renderPeriodControls(monthly,weekly){
  $("monthlyStatus").textContent=monthly?"نشط — بدأ في "+dateText(monthly.month_start):"لا يوجد تحدٍ شهري نشط";
  $("monthlyStartBtn").classList.toggle("hidden",!!monthly);$("monthlyEndBtn").classList.toggle("hidden",!monthly);
  $("weeklyStatus").textContent=weekly?"نشط — بدأ في "+dateText(weekly.week_start):"لا يوجد تحدٍ أسبوعي نشط";
  $("weeklyStartBtn").classList.toggle("hidden",!!weekly);$("weeklyEndBtn").classList.toggle("hidden",!weekly)
}
async function loadHistory(){
  const [w,c]=await Promise.all([
    db.from("weekly_challenges").select("id,title,week_start,status").order("created_at",{ascending:false}).limit(8),
    db.from("competitions").select("id,title,month_start,status").order("month_start",{ascending:false}).limit(8)
  ]);
  if(w.error)throw w.error;if(c.error)throw c.error;
  $("weeklyHistory").innerHTML=w.data.length?w.data.map(x=>"<tr><td>"+esc(x.title)+"</td><td>"+dateText(x.week_start)+"</td><td>"+(x.status==="active"?"نشط":"منتهي")+"</td><td><button class='history-btn' data-history-type='weekly' data-history-id='"+x.id+"'>النتائج</button></td></tr>").join(""):'<tr><td colspan="4">لا يوجد سجل أسبوعي</td></tr>';
  $("monthlyHistory").innerHTML=c.data.length?c.data.map(x=>"<tr><td>"+esc(x.title||"التحدي الشهري")+"</td><td>"+dateText(x.month_start)+"</td><td>"+(x.status==="active"?"نشط":"منتهي")+"</td><td><button class='history-btn' data-history-type='monthly' data-history-id='"+x.id+"'>النتائج</button></td></tr>").join(""):'<tr><td colspan="4">لا يوجد سجل شهري</td></tr>'
}
$("weeklyHistory").onclick=handleHistoryClick;$("monthlyHistory").onclick=handleHistoryClick;
async function handleHistoryClick(e){const b=e.target.closest("[data-history-id]");if(!b)return;await showPeriodResults(b.dataset.historyType,b.dataset.historyId)}
async function showPeriodResults(type,id){
  try{
    const monthly=type==="monthly",column=monthly?"competition_id":"weekly_challenge_id",view=monthly?"student_monthly_totals":"student_weekly_totals";
    const r=await db.from(view).select("student_id,full_name,total_points").eq(column,id);if(r.error)throw r.error;
    const rows=(r.data||[]).sort((a,b)=>b.total_points-a.total_points||a.full_name.localeCompare(b.full_name,"ar"));
    $("challengeResultsTitle").textContent=monthly?"نتائج التحدي الشهري":"نتائج التحدي الأسبوعي";
    let lastPoints=null,lastRank=0;
    $("challengeResultsTable").innerHTML=rows.length?rows.map((x,i)=>{if(i===0||x.total_points!==lastPoints)lastRank=i+1;lastPoints=x.total_points;return "<tr><td>"+lastRank+"</td><td>"+esc(x.full_name)+"</td><td>"+x.total_points+"</td></tr>"}).join(""):'<tr><td colspan="3">لا توجد نقاط مسجلة لهذا التحدي</td></tr>';
    $("challengeResultsPanel").classList.remove("hidden");$("challengeResultsPanel").scrollIntoView({behavior:"smooth",block:"start"})
  }catch(e){msg("pointsMessage","تعذر عرض النتائج: "+e.message,true)}
}
$("weeklyStartBtn").onclick=async()=>{
  try{const user=await currentAdmin(),active=await activeWeekly();if(active){msg("pointsMessage","يوجد تحدٍ أسبوعي نشط بالفعل.",true);return}
    const r=await db.from("weekly_challenges").insert({week_start:localDate(),created_by:user.id}).select("id").single();if(r.error)throw r.error;
    await writeAudit(user,"start","weekly_challenge",r.data.id,{week_start:localDate()});msg("pointsMessage","بدأ التحدي الأسبوعي بنجاح.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر بدء التحدي الأسبوعي: "+e.message,true)}
};
$("weeklyEndBtn").onclick=async()=>{
  try{const user=await currentAdmin(),active=await activeWeekly();if(!active)throw Error("لا يوجد تحدٍ أسبوعي نشط.");
    const r=await db.from("weekly_challenges").update({status:"archived",ended_at:new Date().toISOString(),ended_by:user.id}).eq("id",active.id);if(r.error)throw r.error;
    await writeAudit(user,"end","weekly_challenge",active.id,{week_start:active.week_start});msg("pointsMessage","انتهى التحدي الأسبوعي وحُفظت نتائجه.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر إنهاء التحدي الأسبوعي: "+e.message,true)}
};
$("monthlyStartBtn").onclick=async()=>{
  try{const user=await currentAdmin(),active=await activeMonthly();if(active){msg("pointsMessage","يوجد تحدٍ شهري نشط بالفعل.",true);return}
    const start=monthStart(),existing=await db.from("competitions").select("id,status").eq("month_start",start).maybeSingle();if(existing.error)throw existing.error;if(existing.data)throw Error("تحدي الشهر الحالي موجود ومغلق بالفعل؛ لا يمكن إعادة فتحه.");
    const r=await db.from("competitions").insert({month_start:start,title:"التحدي الشهري",status:"active"}).select("id").single();if(r.error)throw r.error;
    await writeAudit(user,"start","monthly_challenge",r.data.id,{month_start:start});msg("pointsMessage","بدأ التحدي الشهري بنجاح.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر بدء التحدي الشهري: "+e.message,true)}
};
$("monthlyEndBtn").onclick=async()=>{
  try{const user=await currentAdmin(),active=await activeMonthly();if(!active)throw Error("لا يوجد تحدٍ شهري نشط.");
    const r=await db.from("competitions").update({status:"archived",archived_at:new Date().toISOString(),ended_by:user.id}).eq("id",active.id);if(r.error)throw r.error;
    await writeAudit(user,"end","monthly_challenge",active.id,{month_start:active.month_start});msg("pointsMessage","انتهى التحدي الشهري وحُفظت نتائجه.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر إنهاء التحدي الشهري: "+e.message,true)}
};
$("addStudentForm").onsubmit=async e=>{
  e.preventDefault();const code=$("newStudentCode").value.trim();if(!/^\d{5}$/.test(code)){msg("addStudentMessage","الكود يجب أن يكون خمسة أرقام.",true);return}
  const r=await db.from("students").insert({full_name:$("newStudentName").value.trim(),student_code:code});
  if(r.error){msg("addStudentMessage",r.error.code==="23505"?"الكود مستخدم بالفعل.":"تعذر الحفظ: "+r.error.message,true);return}
  $("addStudentForm").reset();msg("addStudentMessage","تمت إضافة الطالب بنجاح.");await loadDashboard()
};
$("addPointsForm").onsubmit=async e=>{
  e.preventDefault();const n=Number($("pointsValue").value),student=$("pointsStudent").value;
  if(!student||!Number.isInteger(n)||n===0){msg("pointsMessage","اختر طالبًا وأدخل نقاطًا صحيحة غير صفر.",true);return}
  try{const [user,monthly,weekly]=await Promise.all([currentAdmin(),activeMonthly(),activeWeekly()]);
    const r=await db.from("point_entries").insert({student_id:student,points_delta:n,competition_id:monthly?.id??null,weekly_challenge_id:weekly?.id??null,created_by:user.id,entry_type:"session"});if(r.error)throw r.error;
    $("addPointsForm").reset();msg("pointsMessage","تم تسجيل النقاط وإضافتها إلى الإجمالي التراكمي.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر تسجيل النقاط: "+e.message,true)}
};
$("setupAdminsOpen").onclick=()=>$("bootstrapBox").classList.toggle("hidden");
$("bootstrapForm").onsubmit=async e=>{
  e.preventDefault();const token=$("bootstrapToken").value.trim();if(token.length<30){msg("bootstrapMessage","رمز التهيئة غير صحيح.",true);return}
  msg("bootstrapMessage","جاري إنشاء حسابات المشرفين الستة...");$("bootstrapSubmit").disabled=true;
  const r=await db.functions.invoke("bootstrap-admins",{body:{},headers:{"x-bootstrap-token":token}});
  $("bootstrapSubmit").disabled=false;
  if(r.error||!r.data?.credentials){msg("bootstrapMessage",r.data?.error||r.error?.message||"تعذر إنشاء الحسابات.",true);return}
  lastBootstrapCredentials=r.data.credentials;$("bootstrapToken").value="";$("bootstrapForm").classList.add("hidden");
  $("bootstrapCredentials").innerHTML="<h3>بيانات الدخول المؤقتة — احفظها الآن</h3><p>لن تظهر كلمات المرور مرة أخرى بعد إغلاق هذه الصفحة.</p><div class='table-wrap'><table><thead><tr><th>اسم المستخدم</th><th>كلمة المرور المؤقتة</th></tr></thead><tbody>"+lastBootstrapCredentials.map(x=>"<tr><td>"+esc(x.username)+"</td><td><code>"+esc(x.password)+"</code></td></tr>").join("")+"</tbody></table></div><button id='copyBootstrapCredentials' class='secondary' type='button'>نسخ بيانات الدخول</button>";
  $("copyBootstrapCredentials").onclick=async()=>{const text=lastBootstrapCredentials.map(x=>x.username+" : "+x.password).join("\n");await navigator.clipboard.writeText(text);msg("bootstrapMessage","تم نسخ بيانات الدخول.")};
  msg("bootstrapMessage","تم إنشاء حسابات المشرفين الستة بنجاح. احفظ كلمات المرور قبل مغادرة الصفحة.")
};
(async()=>{const r=await db.auth.getSession();if(r.data.session){try{await routeAdmin(r.data.session.user)}catch(e){await db.auth.signOut()}}})();
