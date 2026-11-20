const SUPABASE_URL="https://rjbiahkjfmhexexssczg.supabase.co";
const SUPABASE_KEY="sb_publishable_4_pS_PYlIamm6eXOWzGmTg_IY0mN-oR";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const views=["homeView","studentView","adminLoginView","changePasswordView","adminView"];
const levels=[{points:75,name:"الساعي"},{points:100,name:"البرونزي"},{points:150,name:"الفضي"},{points:200,name:"الذهبي"},{points:250,name:"الماسي"},{points:300,name:"الملكي"}];
let pendingAdmin=null;
let dashboardStudents=[];
let dashboardRanked=[];
let dashboardRankById=new Map();
function show(id){views.forEach(v=>$(v).classList.toggle("hidden",v!==id));window.scrollTo({top:0,behavior:"smooth"})}
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
    const [s,a,c,w,t,adminProfiles]=await Promise.all([
      db.from("students").select("id,student_code,full_name,is_active").order("full_name"),
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
    $("studentsTable").innerHTML=s.data.length?s.data.map(x=>{
      const v=ranked.find(y=>y.student_id===x.id),points=v?.total_points??0;
      return "<tr><td>"+esc(x.full_name)+"</td><td>"+esc(x.student_code)+"</td><td>"+points+"</td><td>"+level(points)+"</td><td>"+(rankById.get(x.id)||"—")+"</td><td class='"+(x.is_active?"status-active":"")+"'>"+(x.is_active?"نشط":"موقوف")+"</td></tr>"
    }).join(""):'<tr><td colspan="6">لا يوجد طلاب حتى الآن</td></tr>';
    renderStudentManagement();
    resetManualStudentLookup();
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
function renderStudentManagement(){
 const name=$("studentManageNameSearch").value.trim().toLocaleLowerCase("ar"),code=$("studentManageCodeSearch").value.trim();
 const rows=dashboardStudents.filter(x=>(!name||x.full_name.toLocaleLowerCase("ar").includes(name))&&(!code||x.student_code.includes(code)));
 $("studentManagementResults").innerHTML=rows.length?rows.map(x=>{const total=Number(dashboardRanked.find(y=>y.student_id===x.id)?.total_points||0);return "<tr><td>"+esc(x.full_name)+"</td><td>"+esc(x.student_code)+"</td><td>"+total+"</td><td>"+(x.is_active?"نشط":"موقوف")+"</td><td><button type='button' class='danger-btn' data-delete-student='"+x.id+"'>حذف نهائي</button></td></tr>"}).join(""):"<tr><td colspan='5'>لا توجد نتائج مطابقة.</td></tr>";
}
$("studentManageNameSearch").oninput=renderStudentManagement;$("studentManageCodeSearch").oninput=renderStudentManagement;
$("studentManagementResults").onclick=async e=>{const b=e.target.closest("[data-delete-student]");if(!b)return;const x=dashboardStudents.find(v=>v.id===b.dataset.deleteStudent);if(!x)return;
 if(!window.confirm("تحذير: سيتم حذف الطالب "+x.full_name+" نهائيًا، مع كل سجلات نقاطه. ستختفي نقاطه من الإجمالي ونتائج التحديات السابقة، ولا يمكن التراجع. هل أنت متأكد؟"))return;
 try{b.disabled=true;b.textContent="جاري الحذف...";const r=await db.rpc("admin_delete_student_permanently",{p_student_id:x.id});if(r.error)throw r.error;msg("studentManagementMessage","تم حذف الطالب "+x.full_name+" نهائيًا.");await loadDashboard()}
 catch(err){b.disabled=false;b.textContent="حذف نهائي";msg("studentManagementMessage","تعذر حذف الطالب: "+err.message,true)}
};
function updateManualPointsLabel(){
  const mode=$("manualPointsMode").value;
  $("manualPointsValueLabel").textContent=mode==="set_total"?"الإجمالي الجديد المطلوب":mode==="subtract"?"عدد النقاط المراد خصمها":"عدد النقاط المراد إضافتها";
  $("manualPointsValue").min=mode==="set_total"?"0":"1";
  $("manualPointsValue").placeholder=mode==="set_total"?"مثال: 150":"اكتب عدد النقاط";
  updateManualPointsPreview();
}
function resetManualStudentLookup(){
 $("manualPointsStudentId").value="";$("manualPointsStudentInfo").textContent="ابحث بالاسم أو الكود، ثم اختر الطالب من النتائج.";$("manualPointsStudentInfo").classList.remove("found");updateManualPointsPreview();
}
function renderPointsStudentMatches(){
 const name=$("manualPointsNameSearch").value.trim().toLocaleLowerCase("ar"),code=$("manualPointsCodeSearch").value.trim();
 $("manualPointsStudentId").value="";$("manualPointsStudentInfo").textContent="اختار الطالب من نتائج البحث قبل تعديل النقاط.";$("manualPointsStudentInfo").classList.remove("found");updateManualPointsPreview();
 if(!name&&!code){$("pointsStudentResults").innerHTML="";return}
 const matches=dashboardStudents.filter(x=>x.is_active&&(!name||x.full_name.toLocaleLowerCase("ar").includes(name))&&(!code||x.student_code.includes(code))).slice(0,30);
 $("pointsStudentResults").innerHTML=matches.length?matches.map(x=>"<button type='button' class='student-match' data-student-id='"+x.id+"'><b>"+esc(x.full_name)+"</b><span>الكود: "+esc(x.student_code)+"</span></button>").join(""):"<p class='muted-note'>مفيش طالب مطابق لبيانات البحث.</p>";
}
function selectManualPointsStudent(id){
 const x=dashboardStudents.find(v=>v.id===id&&v.is_active);if(!x)return;
 $("manualPointsStudentId").value=x.id;$("manualPointsStudentInfo").textContent=x.full_name+" — كود "+x.student_code+" — الإجمالي الحالي "+Number(dashboardRanked.find(v=>v.student_id===id)?.total_points||0)+" نقطة";$("manualPointsStudentInfo").classList.add("found");$("pointsStudentResults").innerHTML="";updateManualPointsPreview();
}
$("manualPointsNameSearch").oninput=renderPointsStudentMatches;$("manualPointsCodeSearch").oninput=renderPointsStudentMatches;
$("pointsStudentResults").onclick=e=>{const b=e.target.closest("[data-student-id]");if(b)selectManualPointsStudent(b.dataset.studentId)};
function updateManualPointsPreview(){
  const id=$("manualPointsStudentId").value,mode=$("manualPointsMode").value,value=Number($("manualPointsValue").value);
  const current=Number(dashboardRanked.find(x=>x.student_id===id)?.total_points||0);
  if(!id){$("manualPointsPreview").textContent="ابحث عن الطالب بالاسم أو الكود وحدده لعرض معاينة النقاط.";return}
  if($("manualPointsValue").value===""||!Number.isInteger(value)||value<0||(mode!=="set_total"&&value===0)){
    $("manualPointsPreview").textContent="إجمالي الطالب الحالي: "+current+" نقطة.";return
  }
  const next=mode==="add"?current+value:mode==="subtract"?current-value:value;
  $("manualPointsPreview").textContent="الإجمالي الحالي: "+current+" نقطة — بعد التعديل: "+next+" نقطة.";
}
$("manualPointsMode").onchange=updateManualPointsLabel;

$("manualPointsValue").oninput=updateManualPointsPreview;
$("manualPointsForm").onsubmit=async e=>{
  e.preventDefault();
  const student=$("manualPointsStudentId").value,mode=$("manualPointsMode").value,value=Number($("manualPointsValue").value);
  if(!student||!dashboardStudents.find(x=>x.id===student&&x.is_active)){msg("manualPointsMessage","ابحث عن الطالب واختره من النتائج قبل تنفيذ التعديل.",true);return}
  if(!student||!Number.isInteger(value)||value<0||(mode!=="set_total"&&value===0)){
    msg("manualPointsMessage","راجع اختيار الطالب وعدد النقاط.",true);return
  }
  const label=mode==="add"?"إضافة "+value+" نقطة":mode==="subtract"?"خصم "+value+" نقطة":"تحديد الإجمالي إلى "+value+" نقطة";
  if(!window.confirm("تأكيد "+label+"؟\nسيؤثر التعديل على الإجمالي العام والتحديات النشطة."))return;
  try{
    $("manualPointsMessage").textContent="جاري تنفيذ التعديل...";
    const r=await db.rpc("admin_adjust_student_points",{p_student_id:student,p_mode:mode,p_points:value,p_reason:$("manualPointsReason").value.trim()||null});
    if(r.error)throw r.error;
    const result=Array.isArray(r.data)?r.data[0]:r.data;
    if(!result)throw Error("لم تصل نتيجة التعديل من قاعدة البيانات.");
    $("manualPointsForm").reset();updateManualPointsLabel();
    msg("manualPointsMessage",result.points_delta===0?"الإجمالي بالفعل يساوي القيمة المطلوبة، لم يحدث تغيير.":"تم التعديل بنجاح. الإجمالي: "+result.previous_total+" ← "+result.new_total+" نقطة.");
    await loadDashboard();
  }catch(err){msg("manualPointsMessage","تعذر تعديل النقاط: "+err.message,true)}
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
 e.preventDefault();const name=$("newStudentName").value.trim();if(!name){msg("addStudentMessage","اكتب اسم الطالب.",true);return}
 try{$("addStudentMessage").textContent="جاري إضافة الطالب وتوليد الكود...";
 const r=await db.rpc("admin_create_student",{p_full_name:name});if(r.error)throw r.error;
 const x=Array.isArray(r.data)?r.data[0]:r.data;if(!x?.student_code)throw Error("لم يصل كود الطالب.");
 $("addStudentForm").reset();msg("addStudentMessage","تمت إضافة "+x.full_name+" بنجاح. كود الطالب: "+x.student_code+" — احتفظ بالكود.");await loadDashboard();
 }catch(err){msg("addStudentMessage","تعذر إضافة الطالب: "+err.message,true)}
};

(async()=>{const r=await db.auth.getSession();if(r.data.session){try{await routeAdmin(r.data.session.user)}catch(e){await db.auth.signOut()}}})();
