const SUPABASE_URL="https://rjbiahkjfmhexexssczg.supabase.co";
const SUPABASE_KEY="sb_publishable_4_pS_PYlIamm6eXOWzGmTg_IY0mN-oR";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
function ensureSaaiTargetGroup(){
  ["editStudentGroup","newStudentGroup"].forEach(id=>{
    const select=$(id);
    if(select && !Array.from(select.options).some(option=>option.value==="الساعي")){
      const option=document.createElement("option");
      option.value="الساعي";
      option.textContent="الساعي";
      select.appendChild(option);
    }
  });
}
ensureSaaiTargetGroup();
const views=["homeView","studentView","adminLoginView","changePasswordView","adminView"];
const levels=[{points:75,name:"الساعي"},{points:100,name:"البرونزي"},{points:150,name:"الفضي"},{points:200,name:"الذهبي"},{points:250,name:"الماسي"},{points:300,name:"الملكي"}];
let pendingAdmin=null;
let dashboardStudents=[];
let dashboardRanked=[];
let dashboardRankById=new Map();
function show(id){views.forEach(v=>$(v).classList.toggle("hidden",v!==id));window.scrollTo({top:0,behavior:"smooth"});if(id==="homeView")loadPublicLeaderboards()}
function msg(id,t,bad=false){$(id).textContent=t;$(id).style.color=bad?"#f1a39a":"#b58b3b"}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function level(points){let current=null;for(const item of levels){if(points>=item.points)current=item;else break}return current?.name||"بدون مستوى"}
function localDate(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function monthStart(){return localDate().slice(0,8)+"01"}
async function currentAdmin(){const r=await db.auth.getUser();if(r.error||!r.data.user)throw Error("انتهت الجلسة، سجل الدخول مرة أخرى.");return r.data.user}
async function activeMonthly(){const r=await db.from("competitions").select("id,month_start,title,status,created_at").eq("status","active").maybeSingle();if(r.error)throw r.error;return r.data}
async function activeWeekly(){const r=await db.from("weekly_challenges").select("id,competition_id,week_number,week_start,week_end,title,status,created_at").eq("status","active").maybeSingle();if(r.error)throw r.error;return r.data}
async function writeAudit(user,action,type,id,details={}){const r=await db.from("admin_audit_logs").insert({admin_user_id:user.id,action,entity_type:type,entity_id:id?String(id):null,details});if(r.error)throw r.error}
function dateText(value){if(!value)return "—";return new Date(value+"T00:00:00").toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric"})}

let publicLeaderboardData=null;
function leaderboardRows(rows){
 if(!rows?.length)return '<tr><td colspan="3" class="leaderboard-empty">لا يوجد طلاب في هذا المستوى حتى الآن.</td></tr>';
 return rows.map(x=>'<tr><td><span class="leaderboard-rank rank-'+x.rank+'">'+x.rank+'</span></td><td class="leaderboard-student">'+esc(x.name)+'</td><td class="leaderboard-points">'+Number(x.points).toLocaleString("en-US")+'</td></tr>').join("");
}
function renderLevelLeaderboard(){
 const levelName=$("leaderboardLevelSelect").value;
 const rows=publicLeaderboardData?.levels?.[levelName]||[];
 $("levelLeaderboard").innerHTML=leaderboardRows(rows);
}
async function loadPublicLeaderboards(){
 if(!$("overallLeaderboard"))return;
 $("leaderboardMessage").textContent="";
 try{
  const {data,error}=await db.rpc("public_leaderboards");
  if(error)throw error;
  publicLeaderboardData=data||{overall:[],levels:{}};
  $("overallLeaderboard").innerHTML=leaderboardRows(publicLeaderboardData.overall||[]);
  renderLevelLeaderboard();
 }catch(error){
  $("overallLeaderboard").innerHTML='<tr><td colspan="3" class="leaderboard-empty">تعذر تحميل الترتيب حاليًا.</td></tr>';
  $("levelLeaderboard").innerHTML='<tr><td colspan="3" class="leaderboard-empty">تعذر تحميل الترتيب حاليًا.</td></tr>';
  $("leaderboardMessage").textContent="تأكد من اتصال الإنترنت وحاول تحديث الصفحة.";
 }
}
$("leaderboardLevelSelect").onchange=renderLevelLeaderboard;

$("studentOpen").onclick=()=>show("studentView");
$("adminOpen").onclick=()=>show("adminLoginView");
document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>show("homeView"));
$("themeToggle").onclick=()=>document.body.classList.toggle("dark");
$("studentForm").onsubmit=async e=>{
 e.preventDefault();const rawCode=$("studentCode").value.trim();const code=rawCode.replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\s/g,"");$("studentCode").value=code;
 if(!/^[0-9]{5}$/.test(code)){msg("studentMessage","الكود لازم يكون خمسة أرقام.",true);return}
 const button=$("studentForm").querySelector("button");button.disabled=true;button.textContent="جاري البحث...";
 msg("studentMessage","جاري التحقق من الكود...");
 try{
  const {data,error}=await db.rpc("student_lookup_by_code",{p_student_code:code});if(error)throw error;
  const result=Array.isArray(data)?data[0]:data;
  if(!result||!result.student){msg("studentMessage","الكود غير صحيح أو غير مسجل.",true);return}
  renderStudentProfile(result);$("studentForm").classList.add("hidden");$("studentProfile").classList.remove("hidden");$("studentMessage").textContent="";
 }catch(err){msg("studentMessage",err.message||"تعذر تنفيذ الاستعلام حاليًا.",true)}
 finally{button.disabled=false;button.textContent="عرض صفحتي ←"}
};
function renderStudentProfile(data){
 const s=data.student,monthly=data.monthly,weekly=data.weekly,total=Number(s.total_points)||0,next=s.next_level_points==null?null:Number(s.next_level_points);
 const base=total>=300?300:total>=250?250:total>=200?200:total>=150?150:total>=100?100:total>=75?75:0;
 const progress=next===null?100:Math.max(0,Math.min(100,((total-base)/(next-base))*100));
 const weeklyPoints=Number(weekly?.total_points)||0,monthlyPoints=Number(monthly?.total_points)||0;
 const maxChallenge=Math.max(weeklyPoints,monthlyPoints,1);
 const tiers=[["الساعي",75],["البرونزي",100],["الفضي",150],["الذهبي",200],["الماسي",250],["الملكي",300]];
 const tiersHtml=tiers.map(([name,points])=>'<div class="student-tier '+(total>=points?'is-reached':'')+'"><i></i><span>'+name+'</span><b>'+points+'</b></div>').join("");
 const performance=data.performance||{},history=Array.isArray(performance.weekly_history)?performance.weekly_history:[],neighbors=Array.isArray(performance.group_students)?performance.group_students:[];
 const chartMax=Math.max(1,...history.flatMap(w=>[Number(w.points)||0,Number(w.group_average)||0]));
 const weeklyChartHtml=history.length?'<div class="student-weekly-chart">'+history.map(w=>'<div class="student-week-column"><div class="student-week-bars"><i class="student-own-bar" style="height:'+Math.max(3,(Number(w.points)||0)/chartMax*100)+'%"></i><i class="student-average-bar" style="height:'+Math.max(3,(Number(w.group_average)||0)/chartMax*100)+'%"></i></div><b>أسبوع '+Number(w.week_number)+'</b><small>'+(Number(w.points)||0)+' نقطة</small></div>').join("")+'</div><div class="student-chart-legend"><span><i class="student-own-key"></i> نقاطك</span><span><i class="student-average-key"></i> متوسط المجموعة</span></div>':'<p class="muted-note">لا توجد بيانات أسابيع مسجلة في المسابقة الحالية بعد.</p>';
 const ownVsAverage=Math.max(0,Number(performance.group_average)||0,total,1),groupOwnWidth=Math.min(100,total/ownVsAverage*100),groupAverageWidth=Math.min(100,(Number(performance.group_average)||0)/ownVsAverage*100);
 const neighborHtml=neighbors.length?'<ol class="student-nearby-list">'+neighbors.map(n=>'<li class="'+(n.is_student?'is-me':'')+'"><span>'+Number(n.rank)+'</span><b>'+esc(n.name)+(n.is_student?' (أنت)':'')+'</b><strong>'+Number(n.points).toLocaleString("en-US")+'</strong></li>').join("")+'</ol>':'<p class="muted-note">لا توجد بيانات ترتيب متاحة للمجموعة.</p>';

 $("studentProfile").innerHTML=`
  <div class="student-report" id="studentReport">
   <div class="student-report-cover">
    <div class="student-report-brand"><span>۞</span><div><b>صفوة الحفاظ</b><small>تقرير إنجاز الطالب</small></div></div>
    <div class="student-profile-head"><div><span class="eyebrow">صفحة الطالب</span><h2>${esc(s.full_name)}</h2><p>كود الطالب: <b>${esc(s.student_code)}</b></p><p class="student-target-group">المجموعة المستهدفة: <b>${esc(s.group_level||"لم تُحدد بعد")}</b></p></div><span class="student-level-pill">مستوى النقاط: ${esc(s.level)}</span></div>
    <div class="student-report-total"><span>إجمالي نقاطك</span><strong>${total.toLocaleString("en-US")}</strong><small>بالقرآن نرتقي، وبالإتقان نتميز</small></div>
   </div>
   <div class="student-stats-grid"><article><span>ترتيبك داخل مستواك</span><strong>${Number(s.level_rank)||"—"} <small>من ${Number(s.level_size)||0}</small></strong></article><article><span>ترتيبك العام في المركز</span><strong>${Number(s.overall_rank)||"—"} <small>من ${Number(s.overall_size)||0}</small></strong></article><article><span>المجموعة المستهدفة</span><strong class="student-group-value">${esc(s.group_level||"—")}</strong></article></div>
   <section class="student-progress-card student-tier-card"><h3>مستوياتك وتقدمك</h3><div class="student-tier-scale">${tiersHtml}</div><div class="progress-label"><span>${next===null?"وصلت لأعلى مستوى":"المستوى التالي: "+esc(s.next_level)}</span><b>${next===null?"مكتمل":total+" / "+next+" نقطة"}</b></div><div class="progress-track"><span style="width:${progress}%"></span></div><p>${next===null?"ما شاء الله! وصلت إلى أعلى مستوى في نظام النقاط.":"متبقي لك "+Math.max(0,next-total)+" نقطة للوصول للمستوى التالي."}</p></section>
   <section class="student-progress-card"><h3>نشاطك في التحديات</h3><p class="student-chart-note">مقارنة نقاطك المسجلة في التحدي الأسبوعي والشهري النشط</p><div class="student-bars">
    <div class="student-bar-row"><span>الأسبوعي</span><div class="student-bar-track"><i style="width:${weeklyPoints/maxChallenge*100}%"></i></div><b>${weeklyPoints}</b></div>
    <div class="student-bar-row"><span>الشهري</span><div class="student-bar-track monthly"><i style="width:${monthlyPoints/maxChallenge*100}%"></i></div><b>${monthlyPoints}</b></div>
   </div><div class="student-challenge-cards">
    <div><span>التحدي الأسبوعي</span><b>${weekly?esc(weekly.title||("الأسبوع "+weekly.week_number)):"لا يوجد تحدٍ نشط"}</b><small>ترتيبك: ${weekly?Number(weekly.rank)||"—":"—"} · نقاطك: ${weeklyPoints}</small>${weekly?'<small>من '+dateText(String(weekly.week_start||"").slice(0,10))+' إلى '+dateText(String(weekly.week_end||"").slice(0,10))+'</small>':""}</div>
    <div><span>التحدي الشهري</span><b>${monthly?esc(monthly.title||"التحدي الشهري"):"لا يوجد تحدٍ نشط"}</b><small>ترتيبك: ${monthly?Number(monthly.rank)||"—":"—"} · نقاطك: ${monthlyPoints}</small>${monthly?'<small>بداية التحدي: '+dateText(String(monthly.month_start||"").slice(0,10))+'</small>':""}</div>
   </div></section>

   <section class="student-progress-card student-performance-card"><h3>أداؤك أسبوعًا بعد أسبوع</h3><p class="student-chart-note">مقارنة نقاطك بمتوسط نقاط مجموعتك في كل أسبوع من المسابقة</p>${weeklyChartHtml}</section>
   <section class="student-progress-card student-group-performance"><h3>معدلات أدائك في مجموعتك</h3><div class="student-group-kpis"><div><strong>${Number(performance.group_rank)||"—"}</strong><span>ترتيبك في المجموعة</span></div><div><strong>${Number(performance.group_size)||0}</strong><span>عدد طلاب المجموعة</span></div><div><strong>${Number(performance.group_average)||0}</strong><span>متوسط نقاط المجموعة</span></div></div><div class="student-compare-row"><span>نقاطك</span><div class="student-compare-track"><i style="width:${groupOwnWidth}%"></i></div><b>${total}</b></div><div class="student-compare-row average"><span>المتوسط</span><div class="student-compare-track"><i style="width:${groupAverageWidth}%"></i></div><b>${Number(performance.group_average)||0}</b></div><p class="student-chart-note">${total>Number(performance.group_average||0)?"أنت أعلى من متوسط مجموعتك بـ "+(total-Number(performance.group_average||0))+" نقطة.":total<Number(performance.group_average||0)?"متبقي لك "+(Number(performance.group_average||0)-total)+" نقطة لتصل إلى متوسط مجموعتك.":"أنت عند متوسط مجموعتك تمامًا."}</p></section>
   <section class="student-progress-card student-nearby-card"><h3>الطلاب الأقرب لترتيبك في المجموعة</h3><p class="student-chart-note">الطالبان السابقان والطالبان التاليان في ترتيب مجموعتك</p>${neighborHtml}</section>
   <section class="student-progress-card student-rankings"><h3>ترتيبك بين زملائك</h3><div class="student-ranking-grid">
    <div><h4>أفضل الطلاب إجمالًا</h4><ol id="studentOverallTop"><li>جاري تحميل الترتيب...</li></ol></div>
    <div><h4>أفضل الطلاب في مستواك</h4><ol id="studentLevelTop"><li>جاري تحميل الترتيب...</li></ol></div>
   </div></section>
   <div class="student-report-footer"><span>أثرٌ يبقى</span><i>۞</i><span>نورٌ لا ينطفئ</span><small>هذا التقرير يعرض بيانات الطالب وقت الاستعلام</small></div>
  </div>
  <div class="student-profile-actions"><button type="button" class="secondary" id="studentPrintBtn">🖨️ طباعة / حفظ PDF</button><button type="button" class="secondary" id="studentImageBtn">🖼️ حفظ التقرير صورة</button><button type="button" class="primary" id="studentLookupAgain">استعلام بكود آخر</button></div><p id="studentExportMessage" class="message" aria-live="polite"></p>`;
 $("studentLookupAgain").onclick=()=>{$("studentProfile").classList.add("hidden");$("studentForm").classList.remove("hidden");$("studentCode").value="";$("studentMessage").textContent="";$("studentCode").focus()};
 $("studentPrintBtn").onclick=()=>window.print();
 $("studentImageBtn").onclick=saveStudentReportImage;
 loadStudentReportRankings(s);
}
async function loadStudentReportRankings(student){
 try{
  const {data,error}=await db.rpc("public_leaderboards");if(error)throw error;
  const overall=(data?.overall||[]).slice(0,10),byLevel=(data?.levels?.[student.level]||[]).slice(0,10);
  const render=rows=>rows.length?rows.map(x=>'<li class="'+(x.name===student.full_name?'is-me':'')+'"><span>'+Number(x.rank)+'</span><b>'+esc(x.name)+(x.name===student.full_name?' (أنت)':'')+'</b><strong>'+Number(x.points).toLocaleString("en-US")+'</strong></li>').join(""):'<li>لا توجد بيانات متاحة حاليًا.</li>';
  $("studentOverallTop").innerHTML=render(overall);$("studentLevelTop").innerHTML=render(byLevel);
 }catch(e){$("studentOverallTop").innerHTML="<li>تعذر تحميل الترتيب حاليًا.</li>";$("studentLevelTop").innerHTML="<li>تعذر تحميل الترتيب حاليًا.</li>";}
}
async function saveStudentReportImage(){
 const btn=$("studentImageBtn"),status=$("studentExportMessage"),target=$("studentReport");
 if(!target)return;
 if(!window.html2canvas){status.textContent="ميزة حفظ الصورة لم تُحمّل بعد. حدّث الصفحة وحاول مرة أخرى.";return}
 btn.disabled=true;btn.textContent="جاري تجهيز الصورة...";
 status.textContent="لحظات، بنجهز صورة التقرير كاملة...";
 try{
  const canvas=await window.html2canvas(target,{scale:2,backgroundColor:document.body.classList.contains("dark")?"#14221b":"#f8f7f1",useCORS:true,logging:false,windowWidth:Math.max(target.scrollWidth,document.documentElement.clientWidth)});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  if(!blob)throw Error("تعذر إنشاء ملف الصورة");
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="تقرير-صفوة-الحفاظ-"+($("studentProfile").querySelector(".student-profile-head h2")?.textContent||"الطالب").replace(/[^\u0600-\u06FF\w-]+/g,"-")+".png";
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  status.textContent="تم تجهيز صورة التقرير بنجاح.";
 }catch(e){status.textContent="حصلت مشكلة أثناء حفظ الصورة. جرّب مرة أخرى أو استخدم PDF."}
 finally{btn.disabled=false;btn.textContent="🖼️ حفظ التقرير صورة"}
}
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
    const [s,a,c,w,t,adminProfiles]=await Promise.all([
      db.from("students").select("id,student_code,full_name,is_active,group_level").order("full_name"),
      db.from("admin_profiles").select("user_id",{count:"exact",head:true}).eq("is_active",true),
      activeMonthly(),activeWeekly(),
      db.from("student_lifetime_totals").select("student_id,full_name,student_code,is_active,total_points"),
      db.from("admin_profiles").select("user_id,display_name").eq("is_active",true)
    ]);
    if(s.error)throw s.error;if(a.error)throw a.error;if(t.error)throw t.error;if(adminProfiles.error)throw adminProfiles.error;
    const ranked=[...(t.data||[])].sort((x,y)=>y.total_points-x.total_points||x.full_name.localeCompare(y.full_name,"ar"));
    dashboardStudents=s.data||[];dashboardRanked=ranked;
    const sum=ranked.reduce((n,x)=>n+x.total_points,0);
    $("studentsCount").textContent=s.data.length;$("adminsCount").textContent=a.count??0;$("pointsCount").textContent=sum;
    const rankById=new Map();let currentRank=0,previousPoints=null;
    ranked.forEach((x,i)=>{if(i===0||x.total_points!==previousPoints)currentRank=i+1;rankById.set(x.student_id,currentRank);previousPoints=x.total_points});
    dashboardRankById=rankById;
    renderStudentManagement();
    await loadManualAdjustmentHistory(s.data,adminProfiles.data||[]);
    renderPeriodControls(c,w);await loadHistory(c)
  }catch(e){msg("addStudentMessage","تعذر تحميل البيانات: "+e.message,true)}
}

async function loadManualAdjustmentHistory(students,admins){
  const r=await db.from("admin_audit_logs").select("created_at,admin_user_id,details").eq("entity_type","point_entry").filter("details->>entry_type","eq","adjustment").order("created_at",{ascending:false}).limit(20);
  if(r.error)throw r.error;
  const studentMap=new Map((students||[]).map(x=>[x.id,x]));
  const adminMap=new Map((admins||[]).map(x=>[x.user_id,x.display_name]));
  $("manualAdjustmentHistory").innerHTML=(r.data||[]).length?r.data.map(x=>{
    const d=x.details||{},student=studentMap.get(d.student_id);
    const delta=Number(d.points_delta)||0;
    const change=delta>0?"زيادة +"+delta:"خصم "+delta;
    const before=d.previous_total??"—",after=d.new_total??"—";
    return "<tr><td>"+new Date(x.created_at).toLocaleString("ar-EG")+"</td><td>"+(student?esc(student.full_name)+" ("+esc(student.student_code)+")":"طالب")+"</td><td>"+change+"</td><td>"+before+" ← "+after+"</td><td>"+esc(d.adjustment_reason||"—")+"</td><td>"+esc(adminMap.get(x.admin_user_id)||"مشرف")+"</td></tr>";
  }).join(""):'<tr><td colspan="6">لا توجد تعديلات يدوية حتى الآن</td></tr>';
}
function normalizeStudentName(value){return String(value||"").trim().toLocaleLowerCase("ar")}
function renderStudentManagement(){
 const query=$("studentAdminSearch").value.trim().toLocaleLowerCase("ar");
 if(!query){$("studentManagementResults").innerHTML='<p class="muted-note">ابدأ بكتابة اسم الطالب أو كوده للبحث.</p>';return}
 const rows=dashboardStudents.filter(x=>x.full_name.toLocaleLowerCase("ar").includes(query)||x.student_code.includes(query)).slice(0,30);
 $("studentManagementResults").innerHTML=rows.length?rows.map(x=>{
  const total=Number(dashboardRanked.find(y=>y.student_id===x.id)?.total_points||0),disabled=x.is_active?"":"disabled";
  return "<article class='student-search-card'><div class='student-search-card-info'><strong>"+esc(x.full_name)+"</strong><span>الكود: "+esc(x.student_code)+"</span><span>المجموعة: "+esc(x.group_level||"غير محددة")+" · الحالة: "+(x.is_active?"نشط":"موقوف")+"</span><b class='student-current-total'>الإجمالي الحالي: "+total.toLocaleString("en-US")+" نقطة</b></div><div class='student-points-controls'><label for='studentPoints-"+x.id+"'>عدد النقاط</label><input id='studentPoints-"+x.id+"' data-points-value type='number' min='0' step='1' placeholder='اكتب العدد' "+disabled+"><div class='student-points-actions'><button type='button' class='primary' data-set-total='"+x.id+"' "+disabled+">تعديل الإجمالي</button><button type='button' class='secondary' data-add-points='"+x.id+"' "+disabled+">إضافة نقاط</button></div></div><div class='student-search-card-actions'><button type='button' class='history-btn' data-edit-student='"+x.id+"'>تعديل الاسم</button><button type='button' class='history-btn' data-edit-student-group='"+x.id+"'>تعديل المجموعة</button><button type='button' class='danger-btn' data-delete-student='"+x.id+"'>حذف الطالب</button></div></article>"
 }).join(""):'<p class="muted-note">لا توجد نتائج مطابقة لعملية البحث.</p>';
}
$("studentAdminSearch").oninput=renderStudentManagement;
$("studentManagementResults").onclick=async e=>{
 const edit=e.target.closest("[data-edit-student]");
 if(edit){const x=dashboardStudents.find(v=>v.id===edit.dataset.editStudent);if(!x)return;$("editStudentId").value=x.id;$("editStudentName").value=x.full_name;$("editStudentForm").classList.remove("hidden");$("editStudentForm").scrollIntoView({behavior:"smooth",block:"center"});return}
 const editGroup=e.target.closest("[data-edit-student-group]");
 if(editGroup){const x=dashboardStudents.find(v=>v.id===editGroup.dataset.editStudentGroup);if(!x)return;$("editStudentGroupId").value=x.id;$("editStudentGroup").value=x.group_level||"";$("editStudentGroupForm").classList.remove("hidden");$("editStudentGroupForm").scrollIntoView({behavior:"smooth",block:"center"});return}
 const del=e.target.closest("[data-delete-student]");
 if(del){const x=dashboardStudents.find(v=>v.id===del.dataset.deleteStudent);if(!x)return;if(!window.confirm("هل تريد حذف الطالب "+x.full_name+" نهائيًا؟"))return;
  try{del.disabled=true;del.textContent="جاري التنفيذ...";const r=await db.rpc("admin_delete_student_permanently",{p_student_id:x.id});if(r.error)throw r.error;msg("studentManagementMessage","تم حذف الطالب "+x.full_name+".");await loadDashboard()}
  catch(err){del.disabled=false;del.textContent="حذف الطالب";msg("studentManagementMessage","تعذر الحذف: "+err.message,true)}return}
 const set=e.target.closest("[data-set-total]"),add=e.target.closest("[data-add-points]"),button=set||add;if(!button)return;
 const id=button.dataset.setTotal||button.dataset.addPoints,x=dashboardStudents.find(v=>v.id===id),input=$("studentPoints-"+id),value=Number(input?.value);
 if(!x||!x.is_active){msg("studentManagementMessage","لا يمكن تعديل نقاط طالب غير نشط.",true);return}
 if(input.value===""||!Number.isInteger(value)||value<0||(!!add&&value===0)){msg("studentManagementMessage",add?"اكتب عددًا صحيحًا أكبر من صفر للإضافة.":"اكتب إجماليًا صحيحًا يساوي صفرًا أو أكثر.",true);input.focus();return}
 const mode=set?"set_total":"add",action=set?"تعديل إجمالي "+x.full_name+" إلى "+value+" نقطة":"إضافة "+value+" نقطة إلى "+x.full_name;
 if(!window.confirm("تأكيد "+action+"؟"))return;
 try{button.disabled=true;button.textContent="جاري التنفيذ...";const r=await db.rpc("admin_adjust_student_points",{p_student_id:id,p_mode:mode,p_points:value,p_reason:set?"تعديل إجمالي من لوحة الطلاب":"إضافة نقاط من لوحة الطلاب"});if(r.error)throw r.error;const result=Array.isArray(r.data)?r.data[0]:r.data;if(!result)throw Error("لم تصل نتيجة التعديل من قاعدة البيانات.");msg("studentManagementMessage",result.points_delta===0?"إجمالي الطالب بالفعل يساوي الرقم المطلوب.":"تم التعديل بنجاح. الإجمالي: "+result.previous_total+" ← "+result.new_total+" نقطة.");await loadDashboard()}
 catch(err){button.disabled=false;button.textContent=set?"تعديل الإجمالي":"إضافة نقاط";msg("studentManagementMessage","تعذر تعديل النقاط: "+err.message,true)}
};
$("cancelStudentEdit").onclick=()=>{$("editStudentForm").classList.add("hidden");$("editStudentForm").reset()};
$("cancelStudentGroupEdit").onclick=()=>{$("editStudentGroupForm").classList.add("hidden");$("editStudentGroupForm").reset()};
$("editStudentGroupForm").onsubmit=async e=>{
 e.preventDefault();const id=$("editStudentGroupId").value,x=dashboardStudents.find(v=>v.id===id),group=$("editStudentGroup").value;
 if(!x||!group){msg("studentManagementMessage","اختر مجموعة صحيحة للطالب.",true);return}
 if(group===x.group_level){msg("studentManagementMessage","الطالب بالفعل ضمن هذه المجموعة.");$("editStudentGroupForm").classList.add("hidden");return}
 const save=$("editStudentGroupForm").querySelector("button.primary");
 try{save.disabled=true;save.textContent="جاري الحفظ...";const r=await db.rpc("admin_update_student_profile",{p_student_id:id,p_full_name:x.full_name,p_group_level:group});if(r.error)throw r.error;const user=await currentAdmin();await writeAudit(user,"update","student",id,{old_name:x.full_name,new_name:x.full_name,old_group:x.group_level,new_group:group});$("editStudentGroupForm").classList.add("hidden");$("editStudentGroupForm").reset();msg("studentManagementMessage","تم تحديث المجموعة المستهدفة للطالب "+x.full_name+" إلى "+group+".");await loadDashboard()}
 catch(err){msg("studentManagementMessage","تعذر تعديل المجموعة: "+err.message,true)}
 finally{save.disabled=false;save.textContent="حفظ المجموعة"}
};
$("editStudentForm").onsubmit=async e=>{
 e.preventDefault();const id=$("editStudentId").value,x=dashboardStudents.find(v=>v.id===id),name=$("editStudentName").value.trim();
 if(!x||!name){msg("studentManagementMessage","اكتب اسمًا صحيحًا للطالب.",true);return}
 if(dashboardStudents.some(v=>v.id!==id&&normalizeStudentName(v.full_name)===normalizeStudentName(name))){msg("studentManagementMessage","يوجد طالب آخر مسجل بنفس الاسم.",true);return}
 const save=$("editStudentForm").querySelector("button.primary");
 try{save.disabled=true;save.textContent="جاري الحفظ...";const r=await db.rpc("admin_update_student_profile",{p_student_id:id,p_full_name:name,p_group_level:x.group_level});if(r.error)throw r.error;const user=await currentAdmin();await writeAudit(user,"update","student",id,{old_name:x.full_name,new_name:name,old_group:x.group_level,new_group:x.group_level});$("editStudentForm").classList.add("hidden");$("editStudentForm").reset();msg("studentManagementMessage","تم تحديث اسم الطالب بنجاح.");await loadDashboard()}
 catch(err){msg("studentManagementMessage","تعذر تعديل الاسم: "+err.message,true)}
 finally{save.disabled=false;save.textContent="حفظ الاسم"}
};
function weekName(n){return ["","الأول","الثاني","الثالث","الرابع","الخامس"][n]||String(n)}
function renderPeriodControls(monthly,weekly){
  $("monthlyStatus").textContent=monthly?"نشط — بدأ في "+dateText(monthly.month_start):"لا يوجد تحدٍ شهري نشط";
  $("monthlyStartBtn").classList.toggle("hidden",!!monthly);$("monthlyEndBtn").classList.toggle("hidden",!monthly);
  $("weeklyStatus").textContent=weekly?"نشط — الأسبوع "+weekName(weekly.week_number)+" — من "+dateText(weekly.week_start)+" إلى "+(weekly.week_end?dateText(weekly.week_end):"نهاية غير محددة"):"لا يوجد أسبوع نشط حاليًا";
  $("weeklyEndBtn").classList.toggle("hidden",!weekly);
  $("weeklyStartBtn").classList.toggle("hidden",!!weekly||!monthly);
  if(!$("weeklyStartDate").value)$("weeklyStartDate").value=localDate();
  if(!$("weeklyEndDate").value)$("weeklyEndDate").value=localDate();
  $("weeklyStartBtn").textContent="بدء الأسبوع المحدد"
}
async function loadHistory(monthly){
  const [w,c]=await Promise.all([
    db.from("weekly_challenges").select("id,competition_id,week_number,title,week_start,week_end,status").order("created_at",{ascending:false}).limit(40),
    db.from("competitions").select("id,title,month_start,status").order("month_start",{ascending:false}).limit(8)
  ]);
  if(w.error)throw w.error;if(c.error)throw c.error;
  const activeMonthWeeks=(w.data||[]).filter(x=>x.competition_id===monthly?.id);
  const weekByNumber=new Map(activeMonthWeeks.map(x=>[x.week_number,x]));
  $("weeklyProgress").innerHTML=Array.from({length:5},(_,i)=>{
    const n=i+1,x=weekByNumber.get(n),status=x?(x.status==="active"?"نشط الآن":"مكتمل"):"لم يبدأ";
    return "<div class='week-slot "+(x?.status==="active"?"is-active":x?"is-done":"")+"'><b>الأسبوع "+weekName(n)+"</b><span>"+status+"</span>"+(x?"<small>"+dateText(x.week_start)+" – "+(x.week_end?dateText(x.week_end):"—")+"</small><button class='history-btn' data-history-type='weekly' data-history-id='"+x.id+"'>النتائج</button>":"")+"</div>"
  }).join("");
  const usedNumbers=new Set(activeMonthWeeks.map(x=>Number(x.week_number)));
  const active=await activeWeekly();
  $("weeklyStartBtn").classList.toggle("hidden",!!active||!monthly||usedNumbers.size>=5);
  $("weeklyNumber").innerHTML=[1,2,3,4,5].filter(n=>!usedNumbers.has(n)).map(n=>"<option value='"+n+"'>الأسبوع "+weekName(n)+"</option>").join("");
  $("weeklyNumber").disabled=!!active||usedNumbers.size>=5;
  if(usedNumbers.size>=5)$("weeklyStatus").textContent="اكتملت الأسابيع الخمسة لهذا الشهر.";
  $("weeklyHistory").innerHTML=w.data.length?w.data.map(x=>"<tr><td>"+esc(x.title||("الأسبوع "+weekName(x.week_number)))+"</td><td>"+dateText(x.week_start)+" – "+(x.week_end?dateText(x.week_end):"—")+"</td><td>"+(x.status==="active"?"نشط":"منتهي")+"</td><td><button class='history-btn' data-history-type='weekly' data-history-id='"+x.id+"'>النتائج</button></td></tr>").join(""):'<tr><td colspan="4">لا يوجد سجل أسبوعي</td></tr>';
  $("monthlyHistory").innerHTML=c.data.length?c.data.map(x=>"<tr><td>"+esc(x.title||"التحدي الشهري")+"</td><td>"+dateText(x.month_start)+"</td><td>"+(x.status==="active"?"نشط":"منتهي")+"</td><td><button class='history-btn' data-history-type='monthly' data-history-id='"+x.id+"'>النتائج</button></td></tr>").join(""):'<tr><td colspan="4">لا يوجد سجل شهري</td></tr>'
}
$("weeklyHistory").onclick=handleHistoryClick;$("weeklyProgress").onclick=handleHistoryClick;$("monthlyHistory").onclick=handleHistoryClick;
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
  try{
    const user=await currentAdmin(),active=await activeWeekly();
    if(active){msg("pointsMessage","يوجد أسبوع نشط بالفعل.",true);return}
    const weekNumber=Number($("weeklyNumber").value),weekStart=$("weeklyStartDate").value,weekEnd=$("weeklyEndDate").value;
    if(!Number.isInteger(weekNumber)||weekNumber<1||weekNumber>5||!weekStart||!weekEnd||weekEnd<weekStart)throw Error("اختر أسبوعًا صحيحًا وحدد تاريخ البداية والنهاية.");
    const r=await db.rpc("admin_start_weekly_challenge",{p_week_number:weekNumber,p_week_start:weekStart,p_week_end:weekEnd});
    if(r.error)throw r.error;
    const created=Array.isArray(r.data)?r.data[0]:r.data;
    if(!created)throw Error("لم تصل بيانات الأسبوع الجديد.");
    await writeAudit(user,"start","weekly_challenge",created.id,{week_start:created.week_start,week_end:created.week_end,competition_id:created.competition_id,week_number:created.week_number});
    msg("pointsMessage","بدأ الأسبوع "+weekName(created.week_number)+" بنجاح.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر بدء الأسبوع: "+e.message,true)}
};
$("weeklyEndBtn").onclick=async()=>{
  try{const user=await currentAdmin(),active=await activeWeekly();if(!active)throw Error("لا يوجد تحدٍ أسبوعي نشط.");
    const finalWeekEnd=active.week_end||localDate();
    const r=await db.from("weekly_challenges").update({status:"archived",week_end:finalWeekEnd,ended_at:new Date().toISOString(),ended_by:user.id}).eq("id",active.id);if(r.error)throw r.error;
    await writeAudit(user,"end","weekly_challenge",active.id,{week_start:active.week_start,week_end:finalWeekEnd});msg("pointsMessage","انتهى التحدي الأسبوعي وحُفظت نتائجه.");await loadDashboard()
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
 e.preventDefault();const name=$("newStudentName").value.trim(),group=$("newStudentGroup").value;
 if(!name||!group){msg("addStudentMessage","اكتب اسم الطالب واختر المجموعة.",true);return}
 if(dashboardStudents.some(x=>normalizeStudentName(x.full_name)===normalizeStudentName(name))){msg("addStudentMessage","لا يمكن الإضافة: يوجد طالب مسجل بنفس الاسم بالفعل.",true);return}
 const submit=$("addStudentForm").querySelector("button");
 try{submit.disabled=true;submit.textContent="جاري الإضافة...";$("addStudentMessage").textContent="جاري إضافة الطالب وتوليد الكود...";
 const r=await db.rpc("admin_create_student",{p_full_name:name,p_group_level:group});if(r.error)throw r.error;
 const x=Array.isArray(r.data)?r.data[0]:r.data;if(!x?.student_code)throw Error("لم يصل كود الطالب.");
 $("addStudentForm").reset();msg("addStudentMessage","تمت إضافة "+x.full_name+" إلى مجموعة "+group+". كود الطالب: "+x.student_code+" — احتفظ بالكود.");await loadDashboard();
 }catch(err){const message=String(err.message||"");msg("addStudentMessage",message.includes("بنفس الاسم")?"لا يمكن الإضافة: يوجد طالب مسجل بنفس الاسم بالفعل.":"تعذر إضافة الطالب: "+message,true)}
 finally{submit.disabled=false;submit.textContent="إضافة الطالب وتوليد الكود"}
};

loadPublicLeaderboards();
(async()=>{const r=await db.auth.getSession();if(r.data.session){try{await routeAdmin(r.data.session.user)}catch(e){await db.auth.signOut()}}})();
