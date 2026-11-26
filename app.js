const SUPABASE_URL="https://rjbiahkjfmhexexssczg.supabase.co";
const SUPABASE_KEY="sb_publishable_4_pS_PYlIamm6eXOWzGmTg_IY0mN-oR";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
async function publicGateway(action,payload){
 const {data:sessionData}=await db.auth.getSession();
 const headers={"apikey":SUPABASE_KEY,"Content-Type":"application/json"};
 if(sessionData?.session?.access_token)headers.Authorization="Bearer "+sessionData.session.access_token;
 const response=await fetch(SUPABASE_URL+"/functions/v1/public-student-gateway",{method:"POST",headers,body:JSON.stringify({action,...payload})});
 let body={};try{body=await response.json()}catch(e){}
 return {data:body.data??null,error:response.ok?null:new Error(body.error||"تعذر تنفيذ الطلب حاليًا.")};
}
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
let selectedAdminStudentId=null;
let adminStudentProfileOpenId=null;
let adminStudentEntries=null;
let adminStudentCards=[];
let adminStudentEntriesLoading=false;
let dashboardAdminProfiles=[];
let selectedAchievementAdminStudentId=null;
let achievementAdminAwards=[];
let achievementAdminAudit=[];
let achievementAdminLoading=false;
let achievementAdminError=null;
let currentAchievementData=null;
function show(id){views.forEach(v=>$(v).classList.toggle("hidden",v!==id));window.scrollTo({top:0,behavior:"smooth"});if(id==="homeView")loadPublicLeaderboards()}
function msg(id,t,bad=false){$(id).textContent=t;$(id).style.color=bad?"#f1a39a":"#b58b3b"}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function level(points){let current=null;for(const item of levels){if(points>=item.points)current=item;else break}return current?.name||"بدون مستوى"}
function localDate(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function monthStart(){return localDate().slice(0,8)+"01"}
async function currentAdmin(){const r=await db.auth.getUser();if(r.error||!r.data.user)throw Error("انتهت الجلسة، سجل الدخول مرة أخرى.");return r.data.user}
async function activeMonthly(){const r=await db.from("competitions").select("id,month_start,month_end,title,status,created_at").eq("status","active").maybeSingle();if(r.error)throw r.error;return r.data}
async function activeWeekly(){const r=await db.from("weekly_challenges").select("id,competition_id,week_number,week_start,week_end,title,status,created_at").eq("status","active").maybeSingle();if(r.error)throw r.error;return r.data}
async function writeAudit(user,action,type,id,details={}){const r=await db.from("admin_audit_logs").insert({admin_user_id:user.id,action,entity_type:type,entity_id:id?String(id):null,details});if(r.error)throw r.error}
function dateText(value){if(!value)return "—";return new Date(value+"T00:00:00").toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric"})}

let publicLeaderboardData=null;
function targetGroupThreshold(name){
 return {"الساعي":75,"البرونزي":100,"الفضي":150,"الذهبي":200,"الماسي":250,"الملكي":300}[name]||null;
}
function awardTierClass(tier){
 return {"وسام التاج":"medal-crown","وسام النخبة":"medal-elite","وسام الريادة":"medal-leadership","وسام التميز":"medal-excellence","وسام التفوق":"medal-superiority","وسام التقدير":"medal-appreciation","وسام الاستحقاق":"medal-deserved"}[tier]||"medal-deserved";
}
function awardAchievementLabel(key){
 return {
  overall_first:"المركز الأول على الترتيب العام",
  overall_2_3:"المركز الثاني أو الثالث على الترتيب العام",
  overall_4_10:"ضمن المراكز من الرابع إلى العاشر على الترتيب العام",
  target_reached:"بلوغ المجموعة المستهدفة",
  target_exceeded:"تخطي المجموعة المستهدفة",
  target_group_leader:"صدارة المجموعة المستهدفة",
  higher_group_leader:"صدارة مجموعة أعلى من المجموعة المستهدفة"
 }[key]||"إنجاز مميز";
}
function awardMedalMarkup(tier){
 return '<span class="award-medal '+awardTierClass(tier)+'" aria-hidden="true"><span>۞</span></span>';
}
function awardMonthLabel(award){
 if(!award?.month_start)return award?.competition_title||"تحدٍ سابق";
 const d=new Date(String(award.month_start).slice(0,10)+"T00:00:00");
 return "تحدي "+d.toLocaleDateString("ar-EG",{month:"long",year:"numeric"});
}
function renderStudentAwardItem(award){
 const date=award.earned_at?new Date(award.earned_at).toLocaleDateString("ar-EG",{year:"numeric",month:"short",day:"numeric"}):awardMonthLabel(award);
 const target=award.target_group_at_award?" · المجموعة المستهدفة وقتها: "+esc(award.target_group_at_award):"";
 return '<article class="student-award-item">'+awardMedalMarkup(award.medal_tier)+'<div><b>'+esc(award.medal_tier)+'</b><p>'+esc(awardAchievementLabel(award.achievement_key))+'</p><small>'+esc(awardMonthLabel(award))+' · '+esc(date)+target+'</small></div></article>';
}
function renderStudentAwardHistory(awards){
 const groups=new Map();
 (awards||[]).forEach(a=>{
  const key=a.competition_id||a.month_start||a.competition_title||"unknown";
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(a);
 });
 const tierOrder={"وسام التاج":1,"وسام النخبة":2,"وسام الريادة":3,"وسام التميز":4,"وسام التفوق":5,"وسام التقدير":6,"وسام الاستحقاق":7};
 return Array.from(groups.values()).map(items=>{
  items.sort((a,b)=>(tierOrder[a.medal_tier]||99)-(tierOrder[b.medal_tier]||99));
  return '<details class="student-award-month"><summary><span>'+esc(awardMonthLabel(items[0]))+'</span><small>'+items.length+' أوسمة</small></summary><div class="student-award-list">'+items.map(renderStudentAwardItem).join("")+'</div></details>';
 }).join("")||'<p class="muted-note">لسه مفيش أوسمة مسجلة للطالب.</p>';
}
function awardGreetingText(awards){
 const messages=(awards||[]).map(a=>{
  const group=a.target_group_at_award?(a.achievement_key==="higher_group_leader"?" (الهدف: "+a.target_group_at_award+")":" ("+a.target_group_at_award+")"):"";
  return ({
   overall_first:"حققت المركز الأول على الترتيب العام؛ إنجاز يستحق الفخر، فحافظ على القمة.",
   overall_2_3:"وصلت إلى المركز الثاني أو الثالث على الترتيب العام؛ واصل اجتهادك.",
   overall_4_10:"دخلت قائمة العشرة الأوائل على الترتيب العام؛ خطوتك القادمة نحو القمة.",
   target_reached:"بلغت المجموعة المستهدفة"+group+"؛ مبارك لك تحقيق هدفك.",
   target_exceeded:"تجاوزت المجموعة المستهدفة"+group+"؛ طموحك أخذك إلى مستوى أعلى.",
   target_group_leader:"تصدرت المجموعة المستهدفة"+group+"؛ حافظ على تميزك.",
   higher_group_leader:"تجاوزت هدفك وتصدرت مجموعة أعلى من المستهدفة"+group+"؛ إنجاز يجمع الطموح والتميز."
  }[a.achievement_key]||"حققت إنجازًا جديدًا يستحق الاحتفاء.");
 });
 return messages.length?messages.join(" "):"كل خطوة في طريق حفظ كتاب الله إنجاز. واصل اجتهادك، فالقمة تستحق السعي.";
}
function attachStudentAwards(data){
 const report=$("studentReport");
 if(!report)return;
 const student=data.student||{};
 const awardOrder={"وسام التاج":1,"وسام النخبة":2,"وسام الريادة":3,"وسام التميز":4,"وسام التفوق":5,"وسام التقدير":6,"وسام الاستحقاق":7};
 const currentAwards=Array.isArray(data.achievement_awards)?[...data.achievement_awards].sort((a,b)=>(awardOrder[a.medal_tier]||99)-(awardOrder[b.medal_tier]||99)):[];
 const allAwards=Array.isArray(data.all_achievement_awards)?data.all_achievement_awards:[];
 const newAwards=Array.isArray(data.new_achievement_awards)?data.new_achievement_awards:[];
 const greeting=document.createElement("section");
 greeting.className="student-award-message";
 greeting.innerHTML='<h3>رسالة صفوة الحفاظ إلى '+esc(student.full_name||"صاحب الإنجاز")+'</h3><p>'+esc(awardGreetingText(currentAwards))+'</p>';
 const notice=document.createElement("section");
 notice.className="student-award-notification";
 if(newAwards.length){
  notice.innerHTML='<b>مبروك! عندك '+newAwards.length+' '+(newAwards.length===1?"وسام جديد":"أوسمة جديدة")+' تستحق الاحتفاء 🎉</b><p>'+newAwards.map(a=>esc(a.medal_tier)+" — "+esc(awardAchievementLabel(a.achievement_key))+" ("+esc(awardMonthLabel(a))+")").join("</p><p>")+'</p>';
 }else notice.classList.add("hidden");
 const current=document.createElement("section");
 current.className="student-awards-panel";
 current.innerHTML='<div class="student-awards-heading"><h3>🏅 أوسمة الإنجاز</h3><button type="button" class="history-btn" id="studentShowAllAwards">عرض جميع الأوسمة</button></div><div class="student-award-list">'+(currentAwards.length?currentAwards.map(renderStudentAwardItem).join(""):'<p class="muted-note">لا توجد أوسمة جديدة في التحدي الحالي حتى الآن. واصل اجتهادك!</p>')+'</div>';
 const history=document.createElement("section");
 history.className="student-all-awards-view hidden";
 history.id="studentAllAwardsView";
 history.innerHTML='<div class="student-awards-heading"><h3>سجل أوسمة الإنجاز</h3><button type="button" class="secondary" id="studentBackToCurrentAwards">العودة لصفحة الطالب</button></div>'+renderStudentAwardHistory(allAwards);
 const cover=report.querySelector(".student-report-cover");
 if(cover)cover.after(notice,greeting,current,history);else report.prepend(notice,greeting,current,history);
 let acknowledgementStarted=false;
 const acknowledgeNewAwards=()=>{
  if(acknowledgementStarted||!newAwards.length)return;
  acknowledgementStarted=true;
  publicGateway("acknowledge_awards",{p_student_code:student.student_code,p_award_ids:newAwards.map(a=>a.id)})
   .then(result=>{if(result.error)console.warn("تعذر تسجيل مشاهدة تهنئة الأوسمة:",result.error)})
   .catch(error=>console.warn("تعذر تسجيل مشاهدة تهنئة الأوسمة:",error));
 };
 $("studentShowAllAwards").onclick=()=>{
  acknowledgeNewAwards();
  greeting.classList.add("hidden");notice.classList.add("hidden");current.classList.add("hidden");history.classList.remove("hidden");
  history.scrollIntoView({behavior:"smooth",block:"start"});
 };
 $("studentBackToCurrentAwards").onclick=()=>{
  history.classList.add("hidden");greeting.classList.remove("hidden");if(newAwards.length&&!acknowledgementStarted)notice.classList.remove("hidden");current.classList.remove("hidden");
  current.scrollIntoView({behavior:"smooth",block:"start"});
 };
 if(newAwards.length&&"IntersectionObserver" in window){
  const observer=new IntersectionObserver(entries=>{
   if(document.visibilityState==="visible"&&entries.some(entry=>entry.isIntersecting)){
    observer.disconnect();acknowledgeNewAwards();
   }
  },{threshold:0});
  observer.observe(notice);
 }else if(newAwards.length){
  notice.addEventListener("click",acknowledgeNewAwards,{once:true});
 }
}
function rankLabel(rank,repeated=false){return String(rank)+(repeated?" مكرر":"")}
function leaderboardRows(rows,groupName=null){
 if(!rows?.length)return '<tr><td colspan="3" class="leaderboard-empty">لا يوجد طلاب في هذه المجموعة حتى الآن.</td></tr>';
 let previousPoints=null,currentRank=0;
 return rows.map((x,i)=>{
  const points=Number(x.points)||0,repeated=i>0&&points===previousPoints;
  if(!repeated)currentRank++;
  previousPoints=points;
  const threshold=targetGroupThreshold(groupName),status=threshold===null?"":points>=threshold?"<small class='leaderboard-progress-status is-reached'>حقق المجموعة</small>":"<small class='leaderboard-progress-status'>لسه في الطريق</small>";
  return '<tr><td><span class="leaderboard-rank rank-'+currentRank+'">'+rankLabel(currentRank,repeated)+'</span></td><td class="leaderboard-student">'+esc(x.name)+'</td><td class="leaderboard-points">'+points.toLocaleString("en-US")+status+'</td></tr>';
 }).join("");
}
function renderLeaderboardPodium(rows,hostId){
 const host=$(hostId);if(!host)return;
 const top=(rows||[]).slice(0,3);
 if(!top.length){host.innerHTML="";host.classList.add("hidden");return}
 host.classList.remove("hidden");
 host.innerHTML=top.map((x,i)=>'<article class="leaderboard-podium-item rank-'+(Number(x.rank)||i+1)+'"><span class="leaderboard-podium-rank">'+(Number(x.rank)||i+1)+'</span><b>'+esc(x.name)+'</b><small>'+Number(x.points||0).toLocaleString("en-US")+' نقطة</small></article>').join("");
}
function renderLevelLeaderboard(){
 const groupName=$("leaderboardLevelSelect").value;
 const rows=publicLeaderboardData?.groups?.[groupName]||[];
 $("levelLeaderboard").innerHTML=leaderboardRows(rows,groupName);
 renderLeaderboardPodium(rows,"levelLeaderboardPodium");
}
async function loadPublicLeaderboards(){
 if(!$("overallLeaderboard"))return;
 $("leaderboardMessage").textContent="";
 try{
  const {data,error}=await db.rpc("public_leaderboards");
  if(error)throw error;
  publicLeaderboardData=data||{overall:[],levels:{}};
  const updatedAt=$("leaderboardUpdatedAt");
  if(updatedAt)updatedAt.textContent=publicLeaderboardData.updated_at?"آخر تحديث فعلي للترتيب: "+new Date(publicLeaderboardData.updated_at).toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"}):"تاريخ آخر تحديث غير متاح حاليًا.";
  $("overallLeaderboard").innerHTML=leaderboardRows(publicLeaderboardData.overall||[]);
  renderLeaderboardPodium(publicLeaderboardData.overall||[],"overallLeaderboardPodium");
  renderLevelLeaderboard();
  await loadPublicChallengeArchive();
 }catch(error){
  $("overallLeaderboard").innerHTML='<tr><td colspan="3" class="leaderboard-empty">تعذر تحميل الترتيب حاليًا.</td></tr>';
  $("levelLeaderboard").innerHTML='<tr><td colspan="3" class="leaderboard-empty">تعذر تحميل الترتيب حاليًا.</td></tr>';
  $("leaderboardMessage").textContent="تأكد من اتصال الإنترنت وحاول تحديث الصفحة.";
  if($("leaderboardUpdatedAt"))$("leaderboardUpdatedAt").textContent="تعذر تحميل تاريخ آخر تحديث.";
 }
}
$("leaderboardLevelSelect").onchange=renderLevelLeaderboard;
async function loadPublicChallengeArchive(){
 const host=$("publicChallengeArchive");if(!host)return;
 try{
  const {data,error}=await db.rpc("public_challenge_archive");if(error)throw error;
  const months=new Map();
  (data||[]).forEach(x=>{if(!months.has(x.competition_id))months.set(x.competition_id,{title:x.competition_title||"التحدي الشهري",start:x.competition_start,end:x.competition_end,weeks:[],monthly:null});const m=months.get(x.competition_id);if(x.period_type==="monthly")m.monthly=x;else m.weeks.push(x)});
  if(!months.size){host.innerHTML="<p class='muted-note'>لا توجد تحديات مؤرشفة حتى الآن.</p>";return}
  host.innerHTML=Array.from(months.values()).map(m=>{
   const names=["الأول","الثاني","الثالث","الرابع","الخامس"];
   const weeks=Array.from({length:5},(_,i)=>m.weeks.find(w=>Number(w.week_number)===i+1));
   const rows=weeks.map((w,i)=>w?"<div class='public-archive-week'><div><b>الأسبوع "+names[i]+"</b><small>"+dateText(w.period_start)+" – "+dateText(w.period_end)+"</small></div><button class='history-btn public-archive-result' data-public-type='weekly' data-public-id='"+w.period_id+"'>أفضل 10</button></div>":"<div class='public-archive-week is-missing'><div><b>الأسبوع "+names[i]+"</b><small>لم يُؤرشف بعد</small></div></div>").join("");
   const monthly=m.monthly?"<button class='history-btn public-archive-result' data-public-type='monthly' data-public-id='"+m.monthly.period_id+"'>أفضل 10 في الشهر</button>":"<p class='muted-note'>نتيجة الشهر ستظهر بعد انتهاء التحدي الشهري.</p>";
   return "<details class='public-archive-month'><summary><span>"+esc(m.title)+"</span><small>"+dateText(m.start)+" – "+dateText(m.end)+" · "+m.weeks.length+" من 5 أسابيع مؤرشفة</small></summary><div class='public-archive-body'><div class='public-archive-weeks'>"+rows+"</div><div class='public-archive-month-result'>"+monthly+"</div><div class='public-archive-results hidden'></div></div></details>";
  }).join("");
  host.querySelectorAll(".public-archive-result").forEach(btn=>btn.onclick=async()=>{
   const box=btn.closest(".public-archive-month").querySelector(".public-archive-results");btn.disabled=true;
   try{const {data,error}=await db.rpc("public_challenge_top10",{p_period_type:btn.dataset.publicType,p_period_id:btn.dataset.publicId});if(error)throw error;
    const rows=data||[];let previousPoints=null,currentRank=0;const resultRows=rows.map((x,i)=>{const points=Number(x.total_points)||0,repeated=i>0&&points===previousPoints;if(!repeated)currentRank++;previousPoints=points;return "<tr><td>"+rankLabel(currentRank,repeated)+"</td><td>"+esc(x.student_name)+"</td><td>"+points.toLocaleString("en-US")+"</td></tr>"}).join("");box.innerHTML="<h4>"+(btn.dataset.publicType==="monthly"?"أفضل 10 في الشهر":"أفضل 10 في الأسبوع")+"</h4>"+(rows.length?"<div class='table-wrap'><table><thead><tr><th>المركز</th><th>اسم الطالب</th><th>النقاط</th></tr></thead><tbody>"+resultRows+"</tbody></table></div>":"<p class='muted-note'>لا توجد نتائج مسجلة.</p>");box.classList.remove("hidden");
   }catch(e){box.innerHTML="<p class='muted-note'>تعذر تحميل النتائج حاليًا.</p>";box.classList.remove("hidden")}
   finally{btn.disabled=false}
  });
 }catch(e){host.innerHTML="<p class='muted-note'>تعذر تحميل أرشيف التحديات حاليًا.</p>"}
}


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
  const {data,error}=await publicGateway("lookup",{p_student_code:code});if(error)throw error;
  const result=Array.isArray(data)?data[0]:data;
  if(!result||!result.student){msg("studentMessage","الكود غير صحيح أو غير مسجل.",true);return}
  renderStudentProfile(result);$("studentForm").classList.add("hidden");$("studentProfile").classList.remove("hidden");$("studentMessage").textContent="";
 }catch(err){msg("studentMessage",err.message||"تعذر تنفيذ الاستعلام حاليًا.",true)}
 finally{button.disabled=false;button.textContent="عرض صفحتي ←"}
};
function renderAchievementCard(data){
 const s=data.student,performance=data.performance||{},total=Number(s.total_points)||0;
 const history=Array.isArray(performance.weekly_history)?performance.weekly_history.filter(w=>!w.week_start||String(w.week_start).slice(0,10)<=localDate()):[];
 const groupAssigned=!!s.group_level;
 const groupAverageRaw=performance.group_average;
 const groupAverage=groupAverageRaw==null?null:Number(groupAverageRaw);
 const groupSize=groupAssigned?Number(performance.group_size)||0:0;
 const groupRank=groupAssigned?Number(performance.group_rank)||0:0;
 const targetPoints=targetGroupThreshold(s.group_level);
 const targetPercent=targetPoints?Math.min(100,Math.round(total/targetPoints*100)):null;
 const groupTopRaw=performance.group_top_points;
 const groupTopPoints=groupTopRaw==null?null:Number(groupTopRaw);
 const gap=groupAssigned&&groupTopPoints!==null?Math.max(0,groupTopPoints-total):null;
 const groupTopPercent=groupRank&&groupSize?Math.min(100,Math.max(1,Math.ceil(groupRank/groupSize*100))):null;
 const avgLine=!groupAssigned?"لم تُحدد للطالب مجموعة مستهدفة للمقارنة.":groupAverage===null||!groupSize?"لا تتوفر بيانات كافية لحساب متوسط المجموعة.":total===groupAverage?"نقاطك تساوي متوسط المجموعة ("+groupAverage.toLocaleString("en-US")+" نقطة).":total>groupAverage?"أعلى من متوسط المجموعة بـ "+(total-groupAverage).toLocaleString("en-US")+" نقطة (متوسط المجموعة "+groupAverage.toLocaleString("en-US")+").":"أقل من متوسط المجموعة بـ "+(groupAverage-total).toLocaleString("en-US")+" نقطة (متوسط المجموعة "+groupAverage.toLocaleString("en-US")+").";
 const goalLine=targetPoints?(total>=targetPoints?"حققت هدف مجموعتك المستهدفة ("+targetPoints.toLocaleString("en-US")+" نقطة).":"باقي لك "+(targetPoints-total).toLocaleString("en-US")+" نقطة للوصول إلى مجموعتك المستهدفة."):"لم تُحدد مجموعة مستهدفة لهذا الطالب.";
 const trend=history.length>1?(Number(history[history.length-1].points)||0)-(Number(history[history.length-2].points)||0):null;
 const trendLine=trend===null?"لا توجد بيانات أسبوعين مكتملين للمقارنة بعد.":trend>0?"زاد رصيدك في آخر أسبوع مسجل بـ "+trend.toLocaleString("en-US")+" نقطة عن الأسبوع السابق.":trend<0?"قل رصيدك في آخر أسبوع مسجل بـ "+Math.abs(trend).toLocaleString("en-US")+" نقطة عن الأسبوع السابق.":"رصيدك في آخر أسبوع مسجل يساوي الأسبوع السابق.";
 const rankLine=!groupAssigned?"لا يمكن حساب ترتيب نسبي دون مجموعة مستهدفة.":groupTopPercent===null?"ترتيبك النسبي داخل المجموعة غير متاح حاليًا.":"ضمن أفضل "+groupTopPercent+"% من المجموعة المستهدفة (ترتيب "+groupRank+" من "+groupSize+").";
 const weeklyLine=history.length?"نقاطك المسجلة أسبوعيًا: "+history.map(w=>"الأسبوع "+Number(w.week_number)+": "+(Number(w.points)||0).toLocaleString("en-US")+" نقطة").join(" · "):"لا توجد نقاط أسبوعية مسجلة في التحدي الحالي.";
 const leaderLine=!groupAssigned?"لا يمكن تحديد الفارق عن الأول دون مجموعة مستهدفة.":gap===null?"الفارق عن صاحب المركز الأول غير متاح حاليًا.":gap===0?"أنت في صدارة مجموعتك المستهدفة"+(groupRank>1?" بالتساوي مع طالب آخر.":"."):"يفصلك عن صاحب المركز الأول في مجموعتك "+gap.toLocaleString("en-US")+" نقطة.";
 const lines=[goalLine,avgLine,trendLine,rankLine,weeklyLine,leaderLine];
 const max=Math.max(1,...history.flatMap(w=>[Number(w.points)||0,Number(w.group_average)||0]));
 const w=620,h=155,px=26,py=17;
 const coords=key=>history.map((v,i)=>({x:history.length===1?w/2:px+i*(w-2*px)/(history.length-1),y:h-py-(Number(v[key])||0)/max*(h-2*py)}));
 const path=pts=>pts.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
 const own=coords("points"),avg=coords("group_average");
 const graph=history.length?'<svg class="achievement-chart" viewBox="0 0 620 155" role="img" aria-label="تطور نقاط الطالب ومتوسط المجموعة"><line x1="20" y1="135" x2="600" y2="135"/><line x1="20" y1="77" x2="600" y2="77"/><line x1="20" y1="19" x2="600" y2="19"/><path class="achievement-average-line" d="'+path(avg)+'"/><path class="achievement-own-line" d="'+path(own)+'"/>'+own.map(p=>'<circle class="achievement-own-dot" cx="'+p.x+'" cy="'+p.y+'" r="5"/>').join("")+'<text x="25" y="151">البداية</text><text x="595" y="151" text-anchor="end">الآن</text></svg>':'<div class="achievement-chart-empty">لا توجد بيانات أسبوعية كافية لرسم التطور بعد</div>';
 const summary=lines.map((v,i)=>'<li><span>'+(i+1)+'</span><p>'+esc(v)+'</p></li>').join("");
 return `<section class="achievement-preview-wrap"><div class="achievement-preview-heading"><b>كارت الإنجاز الجاهز للمشاركة</b><small>مقاس رأسي مناسب للستوري 9:16</small></div><article class="achievement-card" id="studentAchievementCard" dir="rtl">
 <header class="achievement-card-header"><span class="achievement-mark">۞</span><div><b>مركز صفوة الحفاظ</b><small>تحدي صفوة الحفاظ · بطاقة إنجاز الطالب</small></div><span class="achievement-mark">۞</span></header>
 <div class="achievement-student-name"><h2>__NAME__</h2><span>المجموعة المستهدفة: __GROUP__</span></div>
 <div class="achievement-total"><strong>__TOTAL__</strong><span>نقطة</span></div>
 <div class="achievement-ranks"><div><small>المستوى الحالي</small><b>__LEVEL__</b></div><div><small>ترتيب المجموعة</small><b>__GRANK__ من __GSIZE__</b></div><div><small>الترتيب العام</small><b>__RANK__ من __SIZE__</b></div></div>
 <section class="achievement-goal"><div class="achievement-goal-head"><b>هدفك القادم</b><strong>__TARGET__</strong></div><div class="achievement-goal-progress"><i style="width:__PERCENT__%"></i></div><div class="achievement-goal-foot"><span>نسبة التقدم __PERCENT__%</span><span>__REMAIN__</span></div></section>
 <section class="achievement-journey"><h3>رحلة تقدمك</h3>__GRAPH__<div class="achievement-chart-legend"><span><i></i> نقاطك</span><span><i></i> متوسط مجموعتك</span></div></section>
 <section class="achievement-summary"><h3>إنجازك في سطور</h3><ol>__SUMMARY__</ol></section>
 <footer class="achievement-card-footer">بالقرآن نرتقي، وبالإتقان نتميز<br>إدارة خادم القرآن : وليد باشا</footer></article></section>`
 .replace("__NAME__",esc(s.full_name)).replace("__GROUP__",esc(s.group_level||"غير محددة"))
 .replace("__TOTAL__",total.toLocaleString("en-US")).replace("__LEVEL__",esc(s.level||"بدون مستوى"))
 .replace("__GRANK__",groupRank||"—").replace("__GSIZE__",groupSize||"—")
 .replace("__RANK__",Number(s.overall_rank)||"—").replace("__SIZE__",Number(s.overall_size)||"—")
 .replace("__TARGET__",targetPoints?targetPoints.toLocaleString("en-US")+" نقطة":"غير محدد")
 .replaceAll("__PERCENT__",targetPercent===null?"0":String(targetPercent))
 .replace("__REMAIN__",targetPoints?(total>=targetPoints?"تم تحقيق الهدف":"باقي "+(targetPoints-total).toLocaleString("en-US")+" نقطة"):"لا يوجد هدف محدد")
 .replace("__GRAPH__",graph).replace("__SUMMARY__",summary);
}
async function createAchievementExportStage(studentDataOverride,studentCodeOverride){
 const sourceData=studentDataOverride===undefined?currentAchievementData:studentDataOverride;
 if(!sourceData&&!studentCodeOverride)throw Error("بيانات كارت الإنجاز غير متاحة");
 const holder=document.createElement("div");
 holder.className="achievement-export-stage";
 if(!window.QRCode)throw Error("تعذر تحميل مولّد رمز QR. حدّث الصفحة وحاول مرة أخرى.");
 const studentCode=studentCodeOverride||sourceData?.student?.student_code;
 if(!studentCode)throw Error("كود الطالب غير متاح لإنشاء كارت الإنجاز.");
 const {data:cardRows,error:cardError}=await publicGateway("issue",{p_student_code:String(studentCode)});
 if(cardError)throw cardError;
 const cardData=Array.isArray(cardRows)?cardRows[0]:cardRows;
 if(!cardData?.card_number||!cardData?.snapshot)throw Error("تعذر إنشاء رقم كارت الإنجاز.");
 holder.innerHTML=renderAchievementCard(cardData.snapshot);
 const card=holder.querySelector("#studentAchievementCard");
 if(!card)throw Error("تعذر تجهيز تصميم الكارت.");
 const qrBox=document.createElement("div");
 qrBox.className="achievement-card-qr";
 const qrCanvas=document.createElement("div");
 qrCanvas.className="achievement-card-qr-code";
 const qrNumber=document.createElement("b");
 qrNumber.className="achievement-card-number";
 qrNumber.textContent=cardData.card_number;
 qrBox.append(qrCanvas,qrNumber);
 card.appendChild(qrBox);
 const verifyUrl="https://safwat-elhofaz.github.io/quran-competition/verify-card.html?card="+encodeURIComponent(cardData.card_number);
 new QRCode(qrCanvas,{text:verifyUrl,width:126,height:126,colorDark:"#075443",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
 const style=document.createElement("style");
 style.textContent=`
 .achievement-export-stage{position:fixed!important;left:-12000px!important;top:0!important;width:1080px!important;height:1920px!important;z-index:-1!important;overflow:hidden!important;direction:rtl!important}
 .achievement-export-stage .achievement-preview-wrap{display:block!important;width:1080px!important;height:1920px!important;margin:0!important}
 .achievement-export-stage .achievement-preview-heading{display:none!important}
 .achievement-export-stage .achievement-card{box-sizing:border-box!important;width:1080px!important;height:1920px!important;min-height:1920px!important;max-height:1920px!important;aspect-ratio:auto!important;overflow:hidden!important;padding:58px 66px!important;gap:17px!important;border:7px solid #e5c46a!important;border-radius:16px!important;outline:2px solid rgba(229,196,106,.4)!important;outline-offset:-20px!important;box-shadow:none!important;justify-content:space-between!important}
 .achievement-export-stage .achievement-card-qr{position:absolute!important;left:48px!important;top:42px!important;z-index:10!important;width:148px!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:5px!important;padding:6px!important;border:2px solid #e5c46a!important;border-radius:8px!important;background:#fff!important;direction:ltr!important}
 .achievement-export-stage .achievement-card-qr-code,.achievement-export-stage .achievement-card-qr-code canvas{display:block!important;width:126px!important;height:126px!important}.achievement-export-stage .achievement-card-qr-code img{display:none!important}
 .achievement-export-stage .achievement-card-number{font-family:Arial,sans-serif!important;font-size:25px!important;line-height:1.1!important;letter-spacing:2px!important;font-weight:800!important;color:#075443!important;text-align:center!important}
 .achievement-export-stage .achievement-card-header{padding-bottom:16px!important;gap:16px!important}
 .achievement-export-stage .achievement-card-header b{font-size:42px!important}.achievement-export-stage .achievement-card-header small{font-size:24px!important}.achievement-export-stage .achievement-mark{font-size:40px!important}
 .achievement-export-stage .achievement-student-name{gap:7px!important}.achievement-export-stage .achievement-student-name h2{font-size:54px!important;line-height:1.35!important}.achievement-export-stage .achievement-student-name span{font-size:29px!important}
 .achievement-export-stage .achievement-total{gap:18px!important}.achievement-export-stage .achievement-total strong{font-size:132px!important}.achievement-export-stage .achievement-total span{font-size:34px!important}
 .achievement-export-stage .achievement-ranks{gap:18px!important}.achievement-export-stage .achievement-ranks>div{min-height:174px!important;padding:18px 10px!important;gap:8px!important;border-radius:22px!important}.achievement-export-stage .achievement-ranks small{font-size:23px!important}.achievement-export-stage .achievement-ranks b{font-size:37px!important;line-height:1.35!important}
 .achievement-export-stage .achievement-goal{padding:24px 28px!important;border-radius:24px!important}.achievement-export-stage .achievement-goal-head{font-size:32px!important}.achievement-export-stage .achievement-goal-progress{height:20px!important;margin:20px 0 14px!important}.achievement-export-stage .achievement-goal-foot{font-size:24px!important}
 .achievement-export-stage .achievement-journey{padding:18px 22px 14px!important;border-radius:24px!important}.achievement-export-stage .achievement-journey h3,.achievement-export-stage .achievement-summary h3{font-size:34px!important;margin-bottom:10px!important}
 .achievement-export-stage .achievement-chart{max-height:220px!important}.achievement-export-stage .achievement-chart-legend{font-size:22px!important;gap:28px!important}.achievement-export-stage .achievement-chart-empty{min-height:130px!important;font-size:23px!important}
 .achievement-export-stage .achievement-summary{padding:18px 22px!important;border-radius:22px!important}.achievement-export-stage .achievement-summary ol{gap:5px!important}.achievement-export-stage .achievement-summary li{grid-template-columns:30px minmax(0,1fr)!important;gap:10px!important;padding:5px 0!important}.achievement-export-stage .achievement-summary li>span{width:27px!important;height:27px!important;font-size:17px!important}.achievement-export-stage .achievement-summary li p{font-size:21px!important;line-height:1.42!important}
 .achievement-export-stage .achievement-card-footer{padding-top:12px!important;font-size:25px!important}
 @media print{.achievement-export-stage{position:static!important;left:auto!important;top:auto!important;width:108mm!important;height:192mm!important;overflow:hidden!important}.achievement-export-stage .achievement-preview-wrap{width:108mm!important;height:192mm!important}.achievement-export-stage .achievement-card{width:108mm!important;height:192mm!important;min-height:192mm!important;max-height:192mm!important;padding:6mm 7mm!important;border-width:1mm!important;outline-offset:-3mm!important;gap:1.7mm!important}.achievement-export-stage .achievement-card-header{padding-bottom:1.6mm!important}.achievement-export-stage .achievement-card-header b{font-size:4.2mm!important}.achievement-export-stage .achievement-card-header small{font-size:2.4mm!important}.achievement-export-stage .achievement-mark{font-size:4mm!important}.achievement-export-stage .achievement-student-name h2{font-size:5.4mm!important}.achievement-export-stage .achievement-student-name span{font-size:2.9mm!important}.achievement-export-stage .achievement-total strong{font-size:13.2mm!important}.achievement-export-stage .achievement-total span{font-size:3.4mm!important}.achievement-export-stage .achievement-ranks>div{min-height:17.4mm!important}.achievement-export-stage .achievement-ranks small{font-size:2.3mm!important}.achievement-export-stage .achievement-ranks b{font-size:3.7mm!important}.achievement-export-stage .achievement-goal-head{font-size:3.2mm!important}.achievement-export-stage .achievement-goal-foot{font-size:2.4mm!important}.achievement-export-stage .achievement-journey h3,.achievement-export-stage .achievement-summary h3{font-size:3.4mm!important}.achievement-export-stage .achievement-chart{max-height:22mm!important}.achievement-export-stage .achievement-chart-legend{font-size:2.2mm!important}.achievement-export-stage .achievement-summary li p{font-size:2.1mm!important}.achievement-export-stage .achievement-card-footer{font-size:2.5mm!important}}
 `;
 holder.prepend(style);
 document.body.appendChild(holder);
 return {holder,card,cardData};
}
async function printStudentAchievementCard(studentDataOverride,studentCodeOverride,statusElement){
 let stage;
 const status=statusElement||$("studentExportMessage");
 try{stage=await createAchievementExportStage(studentDataOverride,studentCodeOverride)}catch(e){if(status)status.textContent=e.message||"تعذر تجهيز كارت الإنجاز";return null}
 document.body.classList.add("printing-achievement-card");
 const cleanup=()=>{document.body.classList.remove("printing-achievement-card");stage.holder.remove()};
 window.addEventListener("afterprint",cleanup,{once:true});
 window.print();
 setTimeout(cleanup,2500);
 return stage;
}
async function exportAdminStudentAchievementCard(studentId,mode,button){
 const student=dashboardStudents.find(x=>x.id===studentId);
 if(!student)return;
 const originalText=button.textContent;
 button.disabled=true;
 button.textContent=mode==="image"?"جاري تجهيز الصورة...":"جاري تجهيز PDF...";
 msg("studentManagementMessage","جاري تجهيز كارت إنجاز "+student.full_name+"...");
 let stage=null;
 try{
  stage=await createAchievementExportStage(null,student.student_code);
  if(mode==="pdf"){
   const printStage=stage;
   document.body.classList.add("printing-achievement-card");
   const cleanup=()=>{document.body.classList.remove("printing-achievement-card");printStage.holder.remove()};
   window.addEventListener("afterprint",cleanup,{once:true});
   window.print();
   setTimeout(cleanup,2500);
   msg("studentManagementMessage","تم تجهيز كارت "+student.full_name+". اختر حفظ بصيغة PDF من نافذة الطباعة.");
   stage=null;
  }else{
   if(!window.html2canvas)throw Error("ميزة تنزيل الصور لم تُحمّل بعد. حدّث الصفحة وحاول مرة أخرى.");
   await document.fonts.ready;
   const canvas=await window.html2canvas(stage.card,{scale:1.5,backgroundColor:"#075443",useCORS:true,logging:false,width:1080,height:1920,windowWidth:1080,windowHeight:1920,scrollX:0,scrollY:0});
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
   if(!blob)throw Error("تعذر إنشاء ملف الصورة");
   const url=URL.createObjectURL(blob),a=document.createElement("a");
   const studentName=stage.cardData?.snapshot?.student?.full_name||student.full_name||"الطالب";
   a.href=url;a.download="كارت-إنجاز-صفوة-الحفاظ-"+studentName.replace(/[^\u0600-\u06FF\w-]+/g,"-")+".png";
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
   msg("studentManagementMessage","تم تنزيل صورة كارت إنجاز "+student.full_name+" بنجاح.");
  }
 }catch(error){
  msg("studentManagementMessage","تعذر تجهيز كارت الطالب: "+(error.message||"حاول مرة أخرى."),true);
 }finally{
  if(stage?.holder)stage.holder.remove();
  button.disabled=false;button.textContent=originalText;
 }
}

function renderStudentProfile(data){
 const s=data.student,monthly=data.monthly,weekly=data.weekly,total=Number(s.total_points)||0,next=s.next_level_points==null?null:Number(s.next_level_points),performance=data.performance||{},targetRank=Number(performance.group_rank)||0,targetSize=Number(performance.group_size)||0,targetStatus=s.target_group_status||"لم تُحدد مجموعة مستهدفة";
 const base=total>=300?300:total>=250?250:total>=200?200:total>=150?150:total>=100?100:total>=75?75:0;
 const progress=next===null?100:Math.max(0,Math.min(100,((total-base)/(next-base))*100));
 const weeklyPoints=Number(weekly?.total_points)||0,monthlyPoints=Number(monthly?.total_points)||0;
 const maxChallenge=Math.max(weeklyPoints,monthlyPoints,1);
 const tiers=[["الساعي",75],["البرونزي",100],["الفضي",150],["الذهبي",200],["الماسي",250],["الملكي",300]];
 const tiersHtml=tiers.map(([name,points])=>'<div class="student-tier '+(total>=points?'is-reached':'')+'"><i></i><span>'+name+'</span><b>'+points+'</b></div>').join("");
 const history=Array.isArray(performance.weekly_history)?performance.weekly_history:[],neighbors=Array.isArray(performance.group_students)?performance.group_students:[];
 const orderedNeighbors=[...neighbors].sort((a,b)=>Number(b.points)-Number(a.points)||(a.name<b.name?-1:a.name>b.name?1:0));
 const myNeighborIndex=orderedNeighbors.findIndex(n=>n.is_student);
 const previousStudent=myNeighborIndex>0?orderedNeighbors[myNeighborIndex-1]:null;
 const nextStudent=myNeighborIndex>=0&&myNeighborIndex<orderedNeighbors.length-1?orderedNeighbors[myNeighborIndex+1]:null;
 const targetPoints=targetGroupThreshold(s.group_level),targetPercent=targetPoints?Math.min(100,Math.round(total/targetPoints*100)):null;
 const levelPercent=Math.round(progress),groupAverage=Number(performance.group_average)||0;
 const averageDifference=groupAverage?Math.round((total-groupAverage)/groupAverage*100):null;
 const topDifference=s.target_group_top_difference_percent==null?null:Number(s.target_group_top_difference_percent);
 const percentText=value=>value===null?"—":(value>0?"+":"")+value+"%";
 const chartMax=Math.max(1,...history.flatMap(w=>[Number(w.points)||0,Number(w.group_average)||0]));
 const weeklyChartHtml=history.length?'<div class="student-weekly-chart">'+history.map(w=>'<div class="student-week-column"><div class="student-week-bars"><i class="student-own-bar" style="height:'+Math.max(3,(Number(w.points)||0)/chartMax*100)+'%"></i><i class="student-average-bar" style="height:'+Math.max(3,(Number(w.group_average)||0)/chartMax*100)+'%"></i></div><b>أسبوع '+Number(w.week_number)+'</b><small>'+(Number(w.points)||0)+' نقطة</small></div>').join("")+'</div><div class="student-chart-legend"><span><i class="student-own-key"></i> نقاطك</span><span><i class="student-average-key"></i> متوسط المجموعة</span></div>':'<p class="muted-note">لا توجد بيانات أسابيع مسجلة في التحدي الحالي بعد.</p>';
 const ownVsAverage=Math.max(0,Number(performance.group_average)||0,total,1),groupOwnWidth=Math.min(100,total/ownVsAverage*100),groupAverageWidth=Math.min(100,(Number(performance.group_average)||0)/ownVsAverage*100);
 const groupTopPoints=performance.group_top_points==null?null:Number(performance.group_top_points);
 const leaderGap=groupTopPoints===null?null:Math.max(0,groupTopPoints-total);
 const leaderGapTitle=!s.group_level?"لم تُحدد مجموعة":leaderGap===null?"غير متاح":leaderGap===0?"أنت في الصدارة": "فاضلك "+leaderGap.toLocaleString("en-US")+" نقطة";
 const leaderGapDetail=!s.group_level?"لا توجد مجموعة للمقارنة":leaderGap===null?"تعذر تحميل نقاط الأول في المجموعة":leaderGap===0?"نقاطك تساوي أعلى رصيد في المجموعة":"عن صاحب المركز الأول في مجموعتك";
 const neighborRows=[{label:"الطالب السابق",student:previousStudent},{label:"الطالب التالي",student:nextStudent}];
 const neighborHtml='<div class="student-nearby-pair">'+neighborRows.map(item=>item.student?'<article><small>'+item.label+'</small><b>'+esc(item.student.name)+'</b><span>المركز '+Number(item.student.rank)+' · '+Number(item.student.points).toLocaleString("en-US")+' نقطة</span></article>':'<article class="is-empty"><small>'+item.label+'</small><b>'+(item.label==="الطالب السابق"?"أنت في أول الترتيب":"أنت في آخر الترتيب")+'</b><span>لا يوجد طالب آخر في هذا الاتجاه</span></article>').join("")+'<article class="student-leader-gap"><small>الفارق عن الأول</small><b>'+esc(leaderGapTitle)+'</b><span>'+esc(leaderGapDetail)+'</span></article></div>';

 $("studentProfile").innerHTML=`
  <div class="student-report" id="studentReport">
   <div class="student-report-cover">
    <div class="student-report-brand"><span>۞</span><div><b>صفوة الحفاظ</b><small>تقرير إنجاز الطالب</small></div></div>
    <div class="student-profile-head"><div><span class="eyebrow">صفحة الطالب</span><h2>${esc(s.full_name)}</h2><p>كود الطالب: <b>${esc(s.student_code)}</b></p><p class="student-target-group">المجموعة المستهدفة: <b>${esc(s.group_level||"لم تُحدد بعد")}</b></p><p class="student-target-status ${s.target_group_reached?"is-reached":"is-progress"}">${esc(targetStatus)}</p></div><span class="student-level-pill">مستوى النقاط: ${esc(s.level)}</span></div>
    <div class="student-report-total"><span>إجمالي نقاطك</span><strong>${total.toLocaleString("en-US")}</strong><small>بالقرآن نرتقي، وبالإتقان نتميز</small></div>
   </div>
   <div class="student-stats-grid"><article><span>ترتيبك داخل مجموعتك المستهدفة</span><strong>${targetRank||"—"} <small>من ${targetSize}</small></strong></article><article><span>ترتيبك العام في المركز</span><strong>${Number(s.overall_rank)||"—"} <small>من ${Number(s.overall_size)||0}</small></strong></article><article><span>المجموعة المستهدفة</span><strong class="student-group-value">${esc(s.group_level||"—")}</strong></article></div>
   <section class="student-progress-card student-tier-card"><h3>مستوياتك وتقدمك</h3><div class="student-tier-scale">${tiersHtml}</div><div class="progress-label"><span>${next===null?"وصلت لأعلى مستوى":"المستوى التالي: "+esc(s.next_level)}</span><b>${next===null?"مكتمل":total+" / "+next+" نقطة · "+levelPercent+"%"}</b></div><div class="progress-track"><span style="width:${progress}%"></span></div><p>${next===null?"ما شاء الله! وصلت إلى أعلى مستوى في نظام النقاط.":"متبقي لك "+Math.max(0,next-total)+" نقطة للوصول للمستوى التالي."}</p><div class="student-percentage-grid"><article><strong>${targetPercent===null?"—":targetPercent+"%"}</strong><span>تحقيق المجموعة المستهدفة</span></article><article><strong>${levelPercent}%</strong><span>التقدم نحو المستوى التالي</span></article><article><strong>${percentText(averageDifference)}</strong><span>مقارنة بمتوسط مجموعتك</span></article><article><strong>${percentText(topDifference)}</strong><span>الفرق عن أول المجموعة</span></article></div></section>
   <section class="student-progress-card"><h3>نشاطك في التحديات</h3><p class="student-chart-note">مقارنة نقاطك المسجلة في التحدي الأسبوعي والشهري النشط</p><div class="student-bars">
    <div class="student-bar-row"><span>الأسبوعي</span><div class="student-bar-track"><i style="width:${weeklyPoints/maxChallenge*100}%"></i></div><b>${weeklyPoints}</b></div>
    <div class="student-bar-row"><span>الشهري</span><div class="student-bar-track monthly"><i style="width:${monthlyPoints/maxChallenge*100}%"></i></div><b>${monthlyPoints}</b></div>
   </div><div class="student-challenge-cards">
    <div><span>التحدي الأسبوعي</span><b>${weekly?esc(weekly.title||("الأسبوع "+weekly.week_number)):"لا يوجد تحدٍ نشط"}</b><small>ترتيبك: ${weekly?Number(weekly.rank)||"—":"—"} · نقاطك: ${weeklyPoints}</small>${weekly?'<small>من '+dateText(String(weekly.week_start||"").slice(0,10))+' إلى '+dateText(String(weekly.week_end||"").slice(0,10))+'</small>':""}</div>
    <div><span>التحدي الشهري</span><b>${monthly?esc(monthly.title||"التحدي الشهري"):"لا يوجد تحدٍ نشط"}</b><small>ترتيبك: ${monthly?Number(monthly.rank)||"—":"—"} · نقاطك: ${monthlyPoints}</small>${monthly?'<small>بداية التحدي: '+dateText(String(monthly.month_start||"").slice(0,10))+'</small>':""}</div>
   </div></section>

   <section class="student-progress-card student-performance-card"><h3>أداؤك أسبوعًا بعد أسبوع</h3><p class="student-chart-note">مقارنة نقاطك بمتوسط نقاط مجموعتك في كل أسبوع من التحدي</p>${weeklyChartHtml}</section>
   <section class="student-progress-card student-group-performance"><h3>معدلات أدائك في مجموعتك</h3><div class="student-group-kpis"><div><strong>${Number(performance.group_rank)||"—"}</strong><span>ترتيبك في المجموعة</span></div><div><strong>${Number(performance.group_size)||0}</strong><span>عدد طلاب المجموعة</span></div><div><strong>${Number(performance.group_average)||0}</strong><span>متوسط نقاط المجموعة</span></div></div><div class="student-compare-row"><span>نقاطك</span><div class="student-compare-track"><i style="width:${groupOwnWidth}%"></i></div><b>${total}</b></div><div class="student-compare-row average"><span>المتوسط</span><div class="student-compare-track"><i style="width:${groupAverageWidth}%"></i></div><b>${Number(performance.group_average)||0}</b></div><p class="student-chart-note">${total>Number(performance.group_average||0)?"أنت أعلى من متوسط مجموعتك بـ "+(total-Number(performance.group_average||0))+" نقطة.":total<Number(performance.group_average||0)?"متبقي لك "+(Number(performance.group_average||0)-total)+" نقطة لتصل إلى متوسط مجموعتك.":"أنت عند متوسط مجموعتك تمامًا."}</p></section>
   <section class="student-progress-card student-nearby-card"><h3>الطالبان المجاوران لترتيبك</h3><p class="student-chart-note">اسم الطالب السابق والطالب التالي لك مباشرة في ترتيب المجموعة</p>${neighborHtml}</section>
   <div class="student-report-footer"><span>أثرٌ يبقى</span><i>۞</i><span>نورٌ لا ينطفئ</span><small>هذا التقرير يعرض بيانات الطالب وقت الاستعلام</small></div>
  </div>
  <div class="student-profile-actions"><button type="button" class="secondary" id="studentPrintBtn">🖨️ طباعة / حفظ PDF</button><button type="button" class="secondary" id="studentImageBtn">🖼️ حفظ التقرير صورة</button><button type="button" class="primary" id="studentLookupAgain">استعلام بكود آخر</button></div><p id="studentExportMessage" class="message" aria-live="polite"></p>`;
 attachStudentAwards(data);
 $("studentLookupAgain").onclick=()=>{$("studentProfile").classList.add("hidden");$("studentForm").classList.remove("hidden");$("studentCode").value="";$("studentMessage").textContent="";$("studentCode").focus()};
 $("studentPrintBtn").onclick=printStudentAchievementCard;
 $("studentImageBtn").onclick=saveStudentReportImage;
 currentAchievementData=data;
}
async function saveStudentReportImage(){
 const btn=$("studentImageBtn"),status=$("studentExportMessage");
 if(!currentAchievementData)return;
 if(!window.html2canvas){status.textContent="ميزة حفظ الصورة لم تُحمّل بعد. حدّث الصفحة وحاول مرة أخرى.";return}
 btn.disabled=true;btn.textContent="جاري تجهيز الكارت...";
 status.textContent="لحظات، بنجهز كارت الإنجاز كاملًا بمقاس الستوري...";
 let stage=null;
 try{
  stage=await createAchievementExportStage();
  await document.fonts.ready;
  const canvas=await window.html2canvas(stage.card,{scale:1.5,backgroundColor:"#075443",useCORS:true,logging:false,width:1080,height:1920,windowWidth:1080,windowHeight:1920,scrollX:0,scrollY:0});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  if(!blob)throw Error("تعذر إنشاء ملف الصورة");
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  const studentName=currentAchievementData.student.full_name||"الطالب";
  a.href=url;a.download="كارت-إنجاز-صفوة-الحفاظ-"+studentName.replace(/[^\u0600-\u06FF\w-]+/g,"-")+".png";
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  status.textContent="تم حفظ كارت الإنجاز كاملًا بمقاس الستوري.";
 }catch(e){
  console.error("Achievement export failed:",e);
  status.textContent="حصلت مشكلة أثناء تجهيز الصورة. جرّب مرة أخرى.";
 }finally{
  if(stage)stage.holder.remove();
  btn.disabled=false;btn.textContent="🖼️ حفظ التقرير صورة";
 }
}
async function routeAdmin(user){
  const a=await db.from("admin_profiles").select("username,display_name,is_active,must_change_password").eq("user_id",user.id).maybeSingle();
  if(a.error||!a.data||!a.data.is_active){await db.auth.signOut();throw Error("هذا الحساب غير معتمد كمشرف.")}
  pendingAdmin={id:user.id,profile:a.data};
  $("adminWelcome").textContent="أهلًا "+a.data.display_name;
  if(a.data.must_change_password) show("changePasswordView");
  else {show("adminView");const studentSearch=$("studentAdminSearch");if(studentSearch){studentSearch.focus({preventScroll:true});studentSearch.select()}await loadDashboard();const readySearch=$("studentAdminSearch");if(readySearch){readySearch.focus({preventScroll:true});readySearch.select()}}
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
$("adminHomeBtn").onclick=()=>show("homeView");
$("studentsCountButton").onclick=()=>{const list=$("allStudentsAccordion"),button=$("studentsCountButton");list.open=!list.open;button.setAttribute("aria-expanded",String(list.open));if(list.open)list.scrollIntoView({behavior:"smooth",block:"start"});};
$("allStudentsAccordion").addEventListener("toggle",()=> $("studentsCountButton").setAttribute("aria-expanded",String($("allStudentsAccordion").open)));
async function loadDashboard(){
  try{
    const [s,a,c,w,t,adminProfiles]=await Promise.all([
      db.from("students").select("id,student_code,full_name,is_active,group_level,created_at").order("full_name"),
      db.from("admin_profiles").select("user_id",{count:"exact",head:true}).eq("is_active",true),
      activeMonthly(),activeWeekly(),
      db.from("student_lifetime_totals").select("student_id,full_name,student_code,is_active,total_points"),
      db.from("admin_profiles").select("user_id,display_name").eq("is_active",true)
    ]);
    if(s.error)throw s.error;if(a.error)throw a.error;if(t.error)throw t.error;if(adminProfiles.error)throw adminProfiles.error;
    const ranked=[...(t.data||[])].sort((x,y)=>y.total_points-x.total_points||x.full_name.localeCompare(y.full_name,"ar"));
    dashboardStudents=s.data||[];dashboardRanked=ranked;dashboardAdminProfiles=adminProfiles.data||[];
    const sum=ranked.reduce((n,x)=>n+x.total_points,0);
    $("studentsCount").textContent=s.data.length;$("adminsCount").textContent=a.count??0;$("pointsCount").textContent=sum;
    const rankById=new Map();let currentRank=0,previousPoints=null;
    ranked.forEach((x,i)=>{if(i===0||x.total_points!==previousPoints)currentRank=i+1;rankById.set(x.student_id,currentRank);previousPoints=x.total_points});
    dashboardRankById=rankById;
    renderAllStudentsRanking();
    renderStudentManagement();
    renderAchievementAwardSearch();
    if(selectedAdminStudentId)loadAdminStudentProfile(selectedAdminStudentId);
    await loadManualAdjustmentHistory(s.data,adminProfiles.data||[]);
     await loadAchievementCardAdminHistory(adminProfiles.data||[]);
    renderPeriodControls(c,w);await loadHistory(c);await loadAssistantManagement(c)
  }catch(e){msg("studentManagementMessage","تعذر تحميل البيانات: "+e.message,true)}
}

async function loadAchievementCardAdminHistory(admins=[]){
 const host=$("achievementCardAdminHistory");if(!host)return;
 const r=await db.from("admin_audit_logs").select("created_at,admin_user_id,entity_id,action,details").eq("entity_type","achievement_card").order("created_at",{ascending:false}).limit(30);
 if(r.error)throw r.error;
 const adminMap=new Map((admins||[]).map(x=>[x.user_id,x.display_name]));
 host.innerHTML=(r.data||[]).length?r.data.map(x=>{
  const d=x.details||{},action=x.action==="REVOKE"?"إلغاء اعتماد":x.action==="REACTIVATE"?"إعادة اعتماد":x.action;
  return "<tr><td>"+new Date(x.created_at).toLocaleString("ar-EG")+"</td><td dir='ltr'>"+esc(x.entity_id||"—")+"</td><td>"+esc(d.student_name||"—")+"</td><td>"+action+"</td><td>"+esc(d.reason||"—")+"</td><td>"+esc(adminMap.get(x.admin_user_id)||"مشرف")+"</td></tr>";
 }).join(""):'<tr><td colspan="6">لا توجد عمليات على كروت الإنجاز حتى الآن.</td></tr>';
}
function normalizeCardNumber(value){
 return String(value||"").replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\s/g,"");
}
async function searchAchievementCardAdmin(){
 const number=normalizeCardNumber($("achievementCardAdminNumber").value);
 $("achievementCardAdminNumber").value=number;
 $("achievementCardAdminResult").innerHTML="";
 if(!/^[0-9]{8}$/.test(number)){msg("achievementCardAdminMessage","رقم الكارت لازم يكون 8 أرقام.",true);return}
 msg("achievementCardAdminMessage","جاري البحث عن الكارت...");
 try{
  const {data,error}=await publicGateway("verify",{p_card_number:number});if(error)throw error;
  if(!data?.found){msg("achievementCardAdminMessage","لا يوجد كارت مسجل بهذا الرقم.",true);return}
  const active=data.status==="active";
  $("achievementCardAdminResult").innerHTML="<div class='achievement-admin-card'><div><small>اسم الطالب</small><strong>"+esc(data.student_name)+"</strong></div><div><small>رقم الكارت</small><strong dir='ltr'>"+esc(data.card_number)+"</strong></div><div><small>الحالة الحالية</small><strong class='"+(active?"status-active":"achievement-status-revoked")+"'>"+(active?"معتمد وصالح":"ملغي الاعتماد")+"</strong></div><div><small>تاريخ الإصدار</small><strong>"+new Date(data.issued_at).toLocaleString("ar-EG")+"</strong></div>"+(active?"<label for='achievementCardRevokeReason'>سبب إلغاء الاعتماد (اختياري)</label><textarea id='achievementCardRevokeReason' rows='2' maxlength='500' placeholder='اكتب سبب الإلغاء إن وجد'></textarea><button type='button' class='danger-btn' id='achievementCardRevokeBtn'>إلغاء اعتماد الكارت</button>":"<p class='muted-note'>هذا الكارت غير صالح حاليًا، ويمكن إعادة اعتماده عند الحاجة.</p><button type='button' class='primary' id='achievementCardReactivateBtn'>إعادة اعتماد الكارت</button>")+"</div>";
  $("achievementCardRevokeBtn")?.addEventListener("click",()=>setAchievementCardAdminStatus(number,"revoke",$("achievementCardRevokeReason").value.trim()));
  $("achievementCardReactivateBtn")?.addEventListener("click",()=>setAchievementCardAdminStatus(number,"reactivate",""));
  msg("achievementCardAdminMessage","");
 }catch(e){msg("achievementCardAdminMessage","تعذر البحث عن الكارت: "+e.message,true)}
}
async function setAchievementCardAdminStatus(number,action,reason){
 const label=action==="revoke"?"إلغاء اعتماد الكارت":"إعادة اعتماد الكارت";
 if(!confirm("هل أنت متأكد من "+label+" رقم "+number+"؟"))return;
 const buttons=$("achievementCardAdminResult").querySelectorAll("button");buttons.forEach(b=>b.disabled=true);
 try{
  const {data,error}=await db.rpc("admin_set_achievement_card_status",{p_card_number:number,p_action:action,p_reason:reason||null});if(error)throw error;
  await searchAchievementCardAdmin();
  const admins=await db.from("admin_profiles").select("user_id,display_name").eq("is_active",true);
  if(admins.error)throw admins.error;
  await loadAchievementCardAdminHistory(admins.data||[]);
  msg("achievementCardAdminMessage",action==="revoke"?"تم إلغاء اعتماد الكارت. عند مسح QR ستظهر حالة الإلغاء.":"تمت إعادة اعتماد الكارت بنجاح.");
 }catch(e){msg("achievementCardAdminMessage","تعذر تنفيذ العملية: "+e.message,true);buttons.forEach(b=>b.disabled=false)}
}
$("achievementCardAdminForm").onsubmit=async e=>{e.preventDefault();await searchAchievementCardAdmin()};
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
function normalizeStudentName(value){
 return String(value??"")
  .normalize("NFKC")
  .replace(/[أإآٱ]/g,"ا")
  .replace(/\s+/g," ")
  .trim()
  .toLocaleLowerCase("ar");
}
function matchesStudentName(fullName,query){
 const normalizedName=normalizeStudentName(fullName);
 const terms=normalizeStudentName(query).split(" ").filter(Boolean);
 return terms.length>0&&terms.every(term=>normalizedName.includes(term));
}
function adminRankFor(rows,id){
  const sorted=[...rows].sort((a,b)=>Number(b.total_points||0)-Number(a.total_points||0)||String(a.full_name||"").localeCompare(String(b.full_name||""),"ar"));
  let rank=0,previous=null;
  for(let i=0;i<sorted.length;i++){
   const points=Number(sorted[i].total_points||0),repeated=i>0&&points===previous;
   if(!repeated)rank++;
   if(sorted[i].student_id===id)return rankLabel(rank,repeated);
   previous=points;
  }
  return null;
}
function adminDateKey(date){
 const d=new Date(date);
 return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function adminMonthKey(date){
 const d=new Date(date);
 return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
}
function renderAdminStudentQuickView(student){
 const total=Number(dashboardRanked.find(y=>y.student_id===student.id)?.total_points||0);
 const disabled=student.is_active?"":"disabled";
 return "<article class='admin-student-quick-view'><div class='admin-student-summary'><div class='eyebrow'>بيانات الطالب الأساسية</div><h3>"+esc(student.full_name)+"</h3><div class='admin-student-meta'><span>الكود: "+esc(student.student_code)+"</span><span>إجمالي النقاط: "+total.toLocaleString("en-US")+"</span><span>المستوى: "+esc(level(total))+"</span><span>المجموعة المستهدفة: "+esc(student.group_level||"غير محددة")+"</span></div></div>"+
 "<section class='admin-student-tools'><h4>إدارة بيانات الطالب</h4>"+
 "<div class='admin-student-points-control'><label for='studentPoints-"+student.id+"'>عدد النقاط</label><input id='studentPoints-"+student.id+"' data-points-value type='number' min='0' step='1' placeholder='اكتب العدد' "+disabled+"><div class='student-points-actions'><button type='button' class='primary' data-set-total='"+student.id+"' "+disabled+">تعديل الإجمالي</button><button type='button' class='secondary' data-add-points='"+student.id+"' "+disabled+">إضافة نقاط</button></div></div>"+
 "<div class='student-search-card-actions admin-profile-actions'><button type='button' class='history-btn' data-edit-student='"+student.id+"'>تعديل الاسم</button><button type='button' class='history-btn' data-edit-student-group='"+student.id+"'>تعديل المجموعة</button></div>"+
 "<form id='editStudentForm' class='stack student-editor hidden'><h4>تعديل اسم الطالب</h4><input id='editStudentId' type='hidden'><label for='editStudentName'>الاسم الجديد</label><input id='editStudentName' maxlength='150' required><div class='actions'><button class='primary'>حفظ الاسم</button><button type='button' id='cancelStudentEdit' class='secondary'>إلغاء</button></div></form>"+
 "<form id='editStudentGroupForm' class='stack student-editor hidden'><h4>تعديل المجموعة المستهدفة</h4><input id='editStudentGroupId' type='hidden'><label for='editStudentGroup'>المجموعة المستهدفة الجديدة</label><select id='editStudentGroup' required><option value=''>اختر المجموعة</option><option value='الملكي'>الملكي</option><option value='الماسي'>الماسي</option><option value='الذهبي'>الذهبي</option><option value='الفضي'>الفضي</option><option value='البرونزي'>البرونزي</option><option value='الساعي'>الساعي</option></select><div class='actions'><button class='primary'>حفظ المجموعة</button><button type='button' id='cancelStudentGroupEdit' class='secondary'>إلغاء</button></div></form>"+
 "<button type='button' class='primary admin-open-profile' data-open-admin-profile='"+student.id+"'>فتح ملف الطالب ←</button>"+
 "<div class='admin-achievement-actions'><button type='button' class='history-btn' data-admin-card-image='"+student.id+"'>🖼️ تنزيل صورة الكارت</button><button type='button' class='history-btn' data-admin-card-pdf='"+student.id+"'>🖨️ طباعة / حفظ PDF</button></div></section></article>";
}
function renderAdminStudentProfile(student){
 const totalRow=dashboardRanked.find(y=>y.student_id===student.id);
 const total=Number(totalRow?.total_points||0),currentLevel=level(total),group=student.group_level||"غير محددة";
 const disabled=student.is_active?"":"disabled";
 const entries=Array.isArray(adminStudentEntries)?adminStudentEntries:[];
 const now=new Date(),dayMs=86400000,start7=new Date(now.getTime()-7*dayMs),start14=new Date(now.getTime()-14*dayMs);
 const pointsBetween=(from,to)=>entries.filter(e=>{const d=new Date(e.created_at);return d>=from&&d<to}).reduce((sum,e)=>sum+Number(e.points_delta||0),0);
 const last7=pointsBetween(start7,new Date(now.getTime()+1000)),previous7=pointsBetween(start14,start7);
 const monthStartDate=new Date(now.getFullYear(),now.getMonth(),1);
 const monthPoints=pointsBetween(monthStartDate,new Date(now.getTime()+1000));
 const earned=entries.reduce((sum,e)=>sum+Math.max(0,Number(e.points_delta||0)),0);
 const deducted=entries.reduce((sum,e)=>sum+Math.abs(Math.min(0,Number(e.points_delta||0))),0);
 const positiveEntries=entries.filter(e=>Number(e.points_delta)>0).length;
 const activeMembers=dashboardStudents.filter(s=>s.is_active);
 const totalsFor=members=>members.map(s=>({student_id:s.id,full_name:s.full_name,total_points:Number(dashboardRanked.find(t=>t.student_id===s.id)?.total_points||0)}));
 const allRows=totalsFor(activeMembers);
 const groupRows=totalsFor(activeMembers.filter(s=>s.group_level===student.group_level));
 const levelRows=totalsFor(activeMembers.filter(s=>level(Number(dashboardRanked.find(t=>t.student_id===s.id)?.total_points||0))===currentLevel));
 const overallRank=adminRankFor(allRows,student.id),groupRank=adminRankFor(groupRows,student.id),levelRank=adminRankFor(levelRows,student.id);
 const change=last7-previous7;
 const trendText=change>0?"تحسن عن السبعة أيام السابقة بـ "+change.toLocaleString("en-US")+" نقطة":change<0?"أقل من السبعة أيام السابقة بـ "+Math.abs(change).toLocaleString("en-US")+" نقطة":"نفس معدل السبعة أيام السابقة";
 const days=[];
 for(let i=13;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);const key=adminDateKey(d);const value=entries.filter(e=>adminDateKey(e.created_at)===key).reduce((s,e)=>s+Number(e.points_delta||0),0);days.push({key,label:d.toLocaleDateString("ar-EG",{day:"numeric",month:"short"}),value})}
 const dayMax=Math.max(1,...days.map(d=>Math.abs(d.value)));
 const dailyBars=days.map(d=>"<div class='admin-performance-bar-col'><div class='admin-performance-bar-value'>"+(d.value?d.value.toLocaleString("en-US"):"")+"</div><div class='admin-performance-bar-track'><i style='height:"+Math.max(d.value?4:0,Math.abs(d.value)/dayMax*100)+"%;' class='"+(d.value<0?"is-negative":"")+"'></i></div><small>"+esc(d.label)+"</small></div>").join("");
 const months=[];
 for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),key=adminMonthKey(d);const value=entries.filter(e=>adminMonthKey(e.created_at)===key).reduce((s,e)=>s+Number(e.points_delta||0),0);months.push({label:d.toLocaleDateString("ar-EG",{month:"short"}),value})}
 const monthMax=Math.max(1,...months.map(m=>Math.abs(m.value)));
 const monthlyBars=months.map(m=>"<div class='admin-performance-bar-col'><div class='admin-performance-bar-value'>"+(m.value?m.value.toLocaleString("en-US"):"")+"</div><div class='admin-performance-bar-track'><i style='height:"+Math.max(m.value?4:0,Math.abs(m.value)/monthMax*100)+"%;' class='"+(m.value<0?"is-negative":"")+"'></i></div><small>"+esc(m.label)+"</small></div>").join("");
 const recent=entries.slice(-8).reverse();
 const recentRows=recent.length?recent.map(e=>"<tr><td>"+new Date(e.created_at).toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"})+"</td><td class='"+(Number(e.points_delta)<0?"negative-points":"positive-points")+"'>"+(Number(e.points_delta)>0?"+":"")+Number(e.points_delta).toLocaleString("en-US")+"</td><td>"+esc(e.adjustment_reason||"تعديل نقاط")+"</td><td>"+Number(e.new_total??0).toLocaleString("en-US")+"</td></tr>").join(""):"<tr><td colspan='4'>لا توجد عمليات مسجلة لهذا الطالب حتى الآن.</td></tr>";
 const journeyEvents=[];
 if(student.created_at)journeyEvents.push({date:student.created_at,milestone:true,title:"بداية الرحلة",detail:"تم تسجيل الطالب في صفوة الحفاظ"});
 const journeyLevels=[["الساعي",75],["البرونزي",100],["الفضي",150],["الذهبي",200],["الماسي",250],["الملكي",300]];
 entries.forEach(e=>{
  const delta=Number(e.points_delta)||0,after=Number(e.new_total??0),before=Number(e.previous_total??(after-delta));
  journeyEvents.push({date:e.created_at,milestone:false,delta,title:delta>0?"إضافة نقاط":delta<0?"خصم نقاط":"تسوية رصيد",detail:(e.adjustment_reason||"عملية نقاط")+" · الرصيد بعد العملية: "+after.toLocaleString("en-US")+" نقطة"});
  journeyLevels.forEach(([name,threshold])=>{if(before<threshold&&after>=threshold)journeyEvents.push({date:e.created_at,milestone:true,title:"تحقيق المستوى "+name,detail:"وصل رصيد الطالب إلى "+threshold+" نقطة"})});
 });
 journeyEvents.sort((a,b)=>new Date(a.date)-new Date(b.date));
 const journeyHtml=journeyEvents.length?journeyEvents.slice(-40).reverse().map(ev=>"<article class='student-journey-event "+(ev.milestone?"is-milestone":"")+(ev.delta<0?" is-deduction":"")+"'><i></i><div><b>"+esc(ev.title)+"</b><p>"+esc(ev.detail)+"</p><small>"+new Date(ev.date).toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"})+"</small></div></article>").join(""):"<p class='muted-note'>لا توجد أحداث مسجلة في رحلة الطالب حتى الآن.</p>";
 const cards=Array.isArray(adminStudentCards)?adminStudentCards:[];
 const cardsHtml=cards.length?cards.map((card,index)=>"<article class='achievement-history-item'><div class='achievement-history-main'><b>الإصدار "+(index+1)+"</b><strong dir='ltr'>"+esc(card.card_number)+"</strong><span class='achievement-history-status "+(card.status==="active"?"is-active":"is-revoked")+"'>"+(card.status==="active"?"معتمد":"ملغي الاعتماد")+"</span></div><small>تاريخ الإصدار: "+new Date(card.issued_at).toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"})+"</small>"+(card.revoked_at?"<small>تاريخ الإلغاء: "+new Date(card.revoked_at).toLocaleString("ar-EG",{dateStyle:"medium",timeStyle:"short"})+"</small>":"")+(card.revoke_reason?"<p>سبب الإلغاء: "+esc(card.revoke_reason)+"</p>":"")+"</article>").join(""):"<p class='muted-note'>لا توجد كروت إنجاز صادرة لهذا الطالب حتى الآن.</p>";
 return "<div class='admin-student-profile-view'>"+
  "<button type='button' class='secondary admin-profile-back' data-back-admin-student>← الرجوع لنتائج البحث</button>"+
  "<section class='admin-student-summary'><div class='eyebrow'>الملف الشخصي للطالب</div><h2>"+esc(student.full_name)+"</h2><div class='admin-student-meta'><span>الكود: "+esc(student.student_code)+"</span><span>المجموعة المستهدفة: "+esc(group)+"</span><span>الحالة: "+(student.is_active?"نشط":"موقوف")+"</span><span>مستوى النقاط: "+esc(currentLevel)+"</span></div><div class='admin-student-total'><small>إجمالي النقاط الحالي</small><strong>"+total.toLocaleString("en-US")+"</strong><span>نقطة</span></div></section>"+
  "<section class='admin-student-tools'><h3>إدارة الطالب</h3>"+
  "<div class='admin-profile-editors'>"+
  "<form id='editStudentForm' class='stack student-editor hidden'><h4>تعديل اسم الطالب</h4><input id='editStudentId' type='hidden'><label for='editStudentName'>الاسم الجديد</label><input id='editStudentName' maxlength='150' required><div class='actions'><button class='primary'>حفظ الاسم</button><button type='button' id='cancelStudentEdit' class='secondary'>إلغاء</button></div></form>"+
  "<form id='editStudentGroupForm' class='stack student-editor hidden'><h4>تعديل المجموعة المستهدفة</h4><input id='editStudentGroupId' type='hidden'><label for='editStudentGroup'>المجموعة المستهدفة الجديدة</label><select id='editStudentGroup' required><option value=''>اختر المجموعة</option><option value='الملكي'>الملكي</option><option value='الماسي'>الماسي</option><option value='الذهبي'>الذهبي</option><option value='الفضي'>الفضي</option><option value='البرونزي'>البرونزي</option><option value='الساعي'>الساعي</option></select><div class='actions'><button class='primary'>حفظ المجموعة</button><button type='button' id='cancelStudentGroupEdit' class='secondary'>إلغاء</button></div></form>"+
  "</div><div class='admin-student-points-control'><label for='studentPoints-"+student.id+"'>عدد النقاط</label><input id='studentPoints-"+student.id+"' data-points-value type='number' min='0' step='1' placeholder='اكتب العدد' "+disabled+"><div class='student-points-actions'><button type='button' class='primary' data-set-total='"+student.id+"' "+disabled+">تعديل الإجمالي</button><button type='button' class='secondary' data-add-points='"+student.id+"' "+disabled+">إضافة نقاط</button></div></div><div class='student-search-card-actions admin-profile-actions'><button type='button' class='history-btn' data-edit-student='"+student.id+"'>تعديل الاسم</button><button type='button' class='history-btn' data-edit-student-group='"+student.id+"'>تعديل المجموعة</button><button type='button' class='danger-btn' data-delete-student='"+student.id+"'>حذف الطالب</button></div></section>"+
  "<section class='admin-performance-section'><h3>مؤشرات الأداء</h3><p class='muted-note'>المؤشرات محسوبة من سجل عمليات النقاط الفعلي المتاح للطالب.</p><div class='admin-performance-kpis'><article><small>نقاط آخر 7 أيام</small><strong>"+last7.toLocaleString("en-US")+"</strong></article><article><small>نقاط الشهر الحالي</small><strong>"+monthPoints.toLocaleString("en-US")+"</strong></article><article><small>متوسط اليوم خلال أسبوع</small><strong>"+(last7/7).toFixed(1)+"</strong></article><article><small>عمليات إضافة النقاط</small><strong>"+positiveEntries.toLocaleString("en-US")+"</strong></article><article><small>إجمالي المضاف</small><strong>"+earned.toLocaleString("en-US")+"</strong></article><article><small>إجمالي المخصوم</small><strong>"+deducted.toLocaleString("en-US")+"</strong></article></div><p class='admin-performance-trend'>"+esc(trendText)+"</p></section>"+
  "<section class='admin-performance-section admin-journey-section'><h3>رحلة إنجاز الطالب</h3><p class='muted-note'>تسلسل زمني لعمليات النقاط والمستويات التي وصل إليها الطالب، دون تغيير أي رصيد.</p><div class='student-journey-timeline'>"+journeyHtml+"</div></section>"+
  "<section class='admin-performance-section admin-card-history-section'><h3>سجل كروت الإنجاز</h3><p class='muted-note'>كل إصدار محفوظ برقم مستقل وتاريخ وحالة اعتماد، والإصدارات السابقة لا تُلغى تلقائيًا.</p><div class='achievement-history-list'>"+cardsHtml+"</div></section>"+
  "<section class='admin-performance-section'><h3>تطور النقاط اليومي</h3><p class='muted-note'>صافي النقاط المسجلة يوميًا خلال آخر 14 يومًا.</p><div class='admin-performance-chart'>"+dailyBars+"</div></section>"+
  "<section class='admin-performance-section'><h3>معدل الأداء الشهري</h3><p class='muted-note'>صافي النقاط المسجلة خلال آخر 6 أشهر.</p><div class='admin-performance-chart admin-month-chart'>"+monthlyBars+"</div></section>"+
  "<section class='admin-performance-section'><h3>ترتيب الطالب</h3><div class='admin-performance-ranks'><article><small>الترتيب العام</small><strong>"+(overallRank??"—")+"</strong><span>من "+allRows.length+" طالب نشط</span></article><article><small>ترتيبه في المجموعة</small><strong>"+(groupRank??"—")+"</strong><span>"+esc(group)+" · "+groupRows.length+" طالب</span></article><article><small>ترتيبه في مستوى النقاط</small><strong>"+(levelRank??"—")+"</strong><span>"+esc(currentLevel)+" · "+levelRows.length+" طالب</span></article></div></section>"+
  "<section class='admin-performance-section'><h3>آخر عمليات النقاط</h3><div class='table-wrap'><table><thead><tr><th>التاريخ</th><th>التغيير</th><th>السبب</th><th>الإجمالي بعد العملية</th></tr></thead><tbody>"+recentRows+"</tbody></table></div></section>"+
  "</div>";
}
function renderAllStudentsRanking(){
 const body=$("allStudentsRanking");
 if(!body)return;
 const studentsById=new Map(dashboardStudents.map(s=>[s.id,s]));
 const rows=dashboardRanked.map(x=>({...x,student:studentsById.get(x.student_id)})).filter(x=>x.student);
 let previousPoints=null,currentRank=0;
 body.innerHTML=rows.length?rows.map((x,i)=>{const points=Number(x.total_points||0),repeated=i>0&&points===previousPoints;if(!repeated)currentRank++;previousPoints=points;return '<tr><td class="all-students-rank">'+rankLabel(currentRank,repeated)+'</td><td class="all-students-name">'+esc(x.full_name||x.student.full_name)+'</td><td class="all-students-points">'+points.toLocaleString("en-US")+'</td><td><span class="all-students-group">'+esc(x.student.group_level||"غير محددة")+'</span></td><td class="all-students-code">'+esc(x.student_code||x.student.student_code||"—")+'</td><td class="all-students-level">'+esc(level(points))+'</td></tr>'}).join(""):'<tr><td colspan="6" class="muted-note">لا يوجد طلاب مسجلون حتى الآن.</td></tr>';
}
function renderStudentAddForm(query){
 const normalized=normalizeStudentName(query||"");
 const exact=!!query&&dashboardStudents.some(x=>normalizeStudentName(x.full_name)===normalized);
 const looksLikeCode=/^[0-9٠-٩۰-۹]+$/.test(query||"");
 const prefill=query&&!exact&&!looksLikeCode?query:"";
 return "<div class='add-student-area'><h4>إضافة طالب جديد</h4><p class='muted-note'>اكتب اسم الطالب واختر المجموعة؛ سيتم توليد كود فريد من خمسة أرقام تلقائيًا.</p><form id='addStudentForm' class='stack'><label for='newStudentName'>اسم الطالب</label><input id='newStudentName' autocomplete='off' maxlength='150' value='"+esc(prefill)+"' required><label for='newStudentGroup'>اختيار المجموعة المستهدفة</label><select id='newStudentGroup' required><option value=''>اختر المجموعة</option><option value='الملكي'>الملكي</option><option value='الماسي'>الماسي</option><option value='الذهبي'>الذهبي</option><option value='الفضي'>الفضي</option><option value='البرونزي'>البرونزي</option><option value='الساعي'>الساعي</option></select><button class='primary'>إضافة الطالب وتوليد الكود</button></form></div>";
}
function renderStudentManagement(){
 const query=$("studentAdminSearch").value.trim();
 const normalizedQuery=normalizeStudentName(query);
 const addForm=renderStudentAddForm(query);
 if(selectedAdminStudentId){
  const student=dashboardStudents.find(x=>x.id===selectedAdminStudentId);
  if(!student){selectedAdminStudentId=null;adminStudentProfileOpenId=null;adminStudentEntries=null}
  else{
   if(adminStudentProfileOpenId===student.id){
    if(adminStudentEntriesLoading){$("studentManagementResults").innerHTML="<p class='muted-note'>جاري تحميل سجل أداء الطالب...</p>"+addForm;return}
    $("studentManagementResults").innerHTML=renderAdminStudentProfile(student)+addForm;return;
   }
   $("studentManagementResults").innerHTML=renderAdminStudentQuickView(student)+addForm;return;
  }
 }
 if(!query){$("studentManagementResults").innerHTML='<p class="muted-note">ابدأ بكتابة اسم الطالب أو كوده للبحث.</p>'+addForm;return}
 const rows=dashboardStudents.filter(x=>matchesStudentName(x.full_name,normalizedQuery)||x.student_code.includes(query)).slice(0,30);
 const results=rows.length?rows.map(x=>{
  const total=Number(dashboardRanked.find(y=>y.student_id===x.id)?.total_points||0);
  return "<article class='student-search-card'><div class='student-search-card-info'><button type='button' class='admin-student-name-link' data-select-admin-student='"+x.id+"'>"+esc(x.full_name)+"</button><span>الكود: "+esc(x.student_code)+"</span><span>المجموعة: "+esc(x.group_level||"غير محددة")+" · الحالة: "+(x.is_active?"نشط":"موقوف")+"</span><b class='student-current-total'>الإجمالي الحالي: "+total.toLocaleString("en-US")+" نقطة</b></div><button type='button' class='secondary admin-select-profile' data-select-admin-student='"+x.id+"'>عرض بيانات الطالب</button></article>"
 }).join(""):'<p class="muted-note">لا توجد نتائج مطابقة لعملية البحث.</p>';
 $("studentManagementResults").innerHTML=results+addForm;
}

function renderAchievementAwardSearch(){
 const search=$("achievementAwardStudentSearch"),results=$("achievementAwardSearchResults"),detail=$("achievementAwardAdminStudent");
 if(!search||!results||!detail)return;
 if(selectedAchievementAdminStudentId){
  const student=dashboardStudents.find(s=>s.id===selectedAchievementAdminStudentId);
  if(!student){selectedAchievementAdminStudentId=null;achievementAdminAwards=[];achievementAdminAudit=[];}
  else{
   results.innerHTML='<button type="button" class="history-btn" data-award-admin-back>← العودة لنتائج البحث</button>';
   if(achievementAdminLoading){detail.innerHTML='<p class="muted-note">جاري تحميل أوسمة الطالب وسجل العمليات...</p>';return}
   renderAchievementAwardAdminStudent(student);return;
  }
 }
 detail.innerHTML="";
 const query=search.value.trim();
 if(query.length<2){results.innerHTML='<p class="muted-note">ابدأ بكتابة حرفين على الأقل من الاسم أو الكود.</p>';return}
 const normalized=normalizeStudentName(query),codeQuery=normalizeCardNumber(query);
 const rows=dashboardStudents.filter(s=>normalizeStudentName(s.full_name).includes(normalized)||String(s.student_code||"").includes(codeQuery)).slice(0,20);
 results.innerHTML=rows.length?rows.map(s=>{
  const total=Number(dashboardRanked.find(t=>t.student_id===s.id)?.total_points||0);
  return '<article class="achievement-award-search-result"><div><b>'+esc(s.full_name)+'</b><small>الكود: '+esc(s.student_code)+' · '+esc(level(total))+' · المجموعة المستهدفة: '+esc(s.group_level||"غير محددة")+'</small></div><button type="button" class="secondary" data-award-select-student="'+s.id+'">فتح ملف الأوسمة</button></article>';
 }).join(""):'<p class="muted-note">لم يتم العثور على طالب مطابق.</p>';
}
async function loadAchievementAwardAdminStudent(id){
 achievementAdminError=null;achievementAdminLoading=true;renderAchievementAwardSearch();
 try{
  const [awards,logs]=await Promise.all([
   db.from("achievement_awards").select("id,student_id,student_name,student_code,competition_id,competition_title,month_start,achievement_key,medal_tier,target_group_at_award,rank_at_award,points_at_award,status,earned_at,revoked_at,revoked_by,revoke_reason,restored_at,restored_by,restore_reason,greeting_seen_at").eq("student_id",id).order("month_start",{ascending:false}).order("earned_at",{ascending:false}),
   db.from("admin_audit_logs").select("created_at,admin_user_id,action,entity_id,details").eq("entity_type","achievement_award").filter("details->>student_id","eq",id).order("created_at",{ascending:false}).limit(100)
  ]);
  if(awards.error)throw awards.error;if(logs.error)throw logs.error;
  achievementAdminAwards=awards.data||[];achievementAdminAudit=logs.data||[];
 }catch(error){
  achievementAdminAwards=[];achievementAdminAudit=[];achievementAdminError=error.message;
 }finally{
  achievementAdminLoading=false;renderAchievementAwardSearch();
 }
}
function renderAchievementAwardAdminStudent(student){
 const host=$("achievementAwardAdminStudent");if(!host)return;
 const total=Number(dashboardRanked.find(t=>t.student_id===student.id)?.total_points||0);
 const groups=new Map();
 achievementAdminAwards.forEach(a=>{
  const key=a.competition_id||a.month_start||"unknown";
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(a);
 });
 const tierOrder={"وسام التاج":1,"وسام النخبة":2,"وسام الريادة":3,"وسام التميز":4,"وسام التفوق":5,"وسام التقدير":6,"وسام الاستحقاق":7};
 const monthHtml=Array.from(groups.values()).sort((a,b)=>String(b[0].month_start||"").localeCompare(String(a[0].month_start||""))).map(items=>{
  items.sort((a,b)=>(tierOrder[a.medal_tier]||99)-(tierOrder[b.medal_tier]||99));
  const comp=items[0].competition_id||"";
  const activeCount=items.filter(a=>a.status==="active").length;
  const revokedCount=items.filter(a=>a.status==="revoked").length;
  const monthActions=(activeCount?'<button type="button" class="danger-btn" data-award-admin-action="revoke_month" data-award-competition="'+esc(comp)+'">إلغاء أوسمة الشهر ('+activeCount+')</button>':"")+
   (revokedCount?'<button type="button" class="history-btn" data-award-admin-action="restore_month" data-award-competition="'+esc(comp)+'">استعادة أوسمة الشهر ('+revokedCount+')</button>':"");
  const rows=items.map(a=>{
   const status=a.status==="active"?"ساري":"ملغي";
   const revoked=a.revoked_at?'<small>تاريخ الإلغاء: '+new Date(a.revoked_at).toLocaleString("ar-EG")+' · السبب: '+esc(a.revoke_reason||"—")+'</small>':"";
   const restored=a.restored_at?'<small>آخر استعادة: '+new Date(a.restored_at).toLocaleString("ar-EG")+' · السبب: '+esc(a.restore_reason||"—")+'</small>':"";
   const action=a.status==="active"?'<button type="button" class="danger-btn" data-award-admin-action="revoke_one" data-award-id="'+a.id+'">إلغاء الوسام</button>':'<button type="button" class="history-btn" data-award-admin-action="restore_one" data-award-id="'+a.id+'">استعادة الوسام</button>';
   return '<article class="achievement-award-admin-item">'+awardMedalMarkup(a.medal_tier)+'<div><b>'+esc(a.medal_tier)+' · '+esc(awardAchievementLabel(a.achievement_key))+'</b><small>تاريخ المنح: '+new Date(a.earned_at).toLocaleString("ar-EG")+' · '+esc(a.target_group_at_award||"")+(a.rank_at_award?' · المركز '+a.rank_at_award:"")+' · '+Number(a.points_at_award||0).toLocaleString("en-US")+' نقطة</small><small>الحالة: '+status+'</small>'+revoked+restored+'</div><div class="achievement-award-item-actions">'+action+'</div></article>';
  }).join("");
  return '<section class="achievement-award-month-admin"><div class="achievement-award-month-admin-head"><h4>'+esc(awardMonthLabel(items[0]))+'</h4><div class="achievement-award-month-actions">'+monthActions+'</div></div>'+rows+'</section>';
 }).join("")||'<p class="muted-note">لا توجد أوسمة مسجلة لهذا الطالب حتى الآن.</p>';
 const monthContent=achievementAdminError?'<p class="message">'+esc("تعذر تحميل سجل الأوسمة: "+achievementAdminError)+'</p>':monthHtml;
 const adminMap=new Map(dashboardAdminProfiles.map(a=>[a.user_id,a.display_name]));
 const auditHtml=achievementAdminAudit.map(log=>{
  const d=log.details||{},label=log.action==="REVOKE"?"إلغاء وسام":log.action==="REACTIVATE"?"استعادة وسام":log.action==="AWARD_GRANTED_AFTER_REAPPROVAL"?"منح وسام بعد تصحيح التحدي":log.action;
  return '<div class="achievement-award-audit-item"><b>'+esc(label)+'</b> · '+new Date(log.created_at).toLocaleString("ar-EG")+' · '+esc(adminMap.get(log.admin_user_id)||"مشرف")+'<br>'+esc(d.medal_tier||"")+' · '+esc(d.competition_title||"")+'<br>السبب: '+esc(d.reason||"—")+'</div>';
 }).join("")||'<p class="muted-note">لا توجد عمليات إلغاء أو استعادة لهذا الطالب.</p>';
 host.innerHTML='<div class="achievement-award-admin-head"><h4>'+esc(student.full_name)+'</h4><div class="achievement-award-admin-meta"><span>كود الطالب: '+esc(student.student_code)+'</span><span>النقاط: '+total.toLocaleString("en-US")+'</span><span>المستوى: '+esc(level(total))+'</span><span>المجموعة المستهدفة: '+esc(student.group_level||"غير محددة")+'</span></div></div>'+monthContent+'<section class="achievement-award-audit"><h4>سجل عمليات الأوسمة</h4>'+auditHtml+'</section><p id="achievementAwardAdminMessage" class="message" aria-live="polite"></p>';
}
async function manageAchievementAward(action,awardId,competitionId){
 const studentId=selectedAchievementAdminStudentId;
 if(!studentId)return;
 const bulk=action==="revoke_month"||action==="restore_month";
 const matching=achievementAdminAwards.filter(a=>a.competition_id===competitionId&&(action.startsWith("revoke")?a.status==="active":a.status==="revoked"));
 const count=bulk?matching.length:1;
 if(bulk&&count===0){alert("لا توجد أوسمة مستحقة لهذه العملية في هذا التحدي.");return}
 const label=action.startsWith("revoke")?"إلغاء":"استعادة";
 const reason=window.prompt("اكتب سبب "+label+" الأوسمة (إجباري):");
 if(reason===null)return;
 if(!reason.trim()){alert("لازم تكتب سبب العملية.");return}
 const confirmText=bulk?"تأكيد "+label+" "+count+" وسامًا في "+(matching[0]?awardMonthLabel(matching[0]):"التحدي المحدد")+"؟":"تأكيد "+label+" هذا الوسام؟";
 if(!window.confirm(confirmText))return;
 const host=$("achievementAwardAdminStudent");
 try{
  host.querySelectorAll("button").forEach(b=>b.disabled=true);
  const {data,error}=await db.rpc("admin_manage_achievement_awards",{
   p_action:action,p_student_id:studentId,p_reason:reason.trim(),
   p_award_id:awardId||null,p_competition_id:competitionId||null
  });
  if(error)throw error;
  const affected=Number(data)||0;
  await loadAchievementAwardAdminStudent(studentId);
  const message=affected?"تم "+label+" "+affected+" وسامًا بنجاح.":"لم تتغير أي أوسمة؛ ربما نُفذت العملية بالفعل.";
  const status=$("achievementAwardAdminMessage");if(status)status.textContent=message;
 }catch(error){
  const status=$("achievementAwardAdminMessage");if(status)status.textContent="تعذر تنفيذ العملية: "+error.message;
  host.querySelectorAll("button").forEach(b=>b.disabled=false);
 }
}
$("achievementAwardStudentSearch").oninput=()=>{
 selectedAchievementAdminStudentId=null;achievementAdminAwards=[];achievementAdminAudit=[];achievementAdminError=null;achievementAdminLoading=false;renderAchievementAwardSearch();
};
$("achievementAwardSearchResults").addEventListener("click",async e=>{
 const back=e.target.closest("[data-award-admin-back]");
 if(back){selectedAchievementAdminStudentId=null;achievementAdminAwards=[];achievementAdminAudit=[];achievementAdminError=null;renderAchievementAwardSearch();return}
 const select=e.target.closest("[data-award-select-student]");
 if(select){selectedAchievementAdminStudentId=select.dataset.awardSelectStudent;achievementAdminError=null;achievementAdminLoading=true;renderAchievementAwardSearch();await loadAchievementAwardAdminStudent(selectedAchievementAdminStudentId)}
});
$("achievementAwardAdminStudent").addEventListener("click",async e=>{
 const back=e.target.closest("[data-award-admin-back]");
 if(back){selectedAchievementAdminStudentId=null;achievementAdminAwards=[];achievementAdminAudit=[];renderAchievementAwardSearch();return}
 const action=e.target.closest("[data-award-admin-action]");
 if(action)await manageAchievementAward(action.dataset.awardAdminAction,action.dataset.awardId,action.dataset.awardCompetition);
});

async function loadAdminStudentProfile(id){
 adminStudentEntriesLoading=true;adminStudentEntries=null;adminStudentCards=[];renderStudentManagement();
 try{
  const r=await db.from("point_entries").select("created_at,points_delta,entry_type,previous_total,new_total,adjustment_reason,competition_id,weekly_challenge_id").eq("student_id",id).order("created_at",{ascending:true});
  if(r.error)throw r.error;
  adminStudentEntries=r.data||[];
  const cardsResult=await db.from("achievement_cards").select("card_number,student_name,status,issued_at,revoked_at,revoke_reason").eq("student_id",id).order("issued_at",{ascending:true});
  if(cardsResult.error)throw cardsResult.error;
  adminStudentCards=cardsResult.data||[];
 }catch(error){
  if(adminStudentEntries===null)adminStudentEntries=[];
  adminStudentCards=[];
  msg("studentManagementMessage","تعذر تحميل سجل الطالب بالكامل: "+error.message,true);
 }finally{
  adminStudentEntriesLoading=false;
  if(selectedAdminStudentId===id)renderStudentManagement();
 }
}
$("studentAdminSearch").oninput=()=>{selectedAdminStudentId=null;adminStudentProfileOpenId=null;adminStudentEntries=null;adminStudentEntriesLoading=false;renderStudentManagement()};
$("studentManagementResults").onclick=async e=>{
 const adminImage=e.target.closest("[data-admin-card-image]");
 if(adminImage){await exportAdminStudentAchievementCard(adminImage.dataset.adminCardImage,"image",adminImage);return}
 const adminPdf=e.target.closest("[data-admin-card-pdf]");
 if(adminPdf){await exportAdminStudentAchievementCard(adminPdf.dataset.adminCardPdf,"pdf",adminPdf);return}
 const selectStudent=e.target.closest("[data-select-admin-student]");
 if(selectStudent){selectedAdminStudentId=selectStudent.dataset.selectAdminStudent;adminStudentProfileOpenId=null;adminStudentEntries=null;adminStudentEntriesLoading=false;renderStudentManagement();return}
 const openProfile=e.target.closest("[data-open-admin-profile]");
 if(openProfile){const id=openProfile.dataset.openAdminProfile;selectedAdminStudentId=id;adminStudentProfileOpenId=id;await loadAdminStudentProfile(id);return}
 const backProfile=e.target.closest("[data-back-admin-student]");
 if(backProfile){selectedAdminStudentId=null;adminStudentProfileOpenId=null;adminStudentEntries=null;renderStudentManagement();return}

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
$("studentManagementResults").addEventListener("click",e=>{
 const cancelName=e.target.closest("#cancelStudentEdit");
 if(cancelName){$("editStudentForm").classList.add("hidden");$("editStudentForm").reset();return}
 const cancelGroup=e.target.closest("#cancelStudentGroupEdit");
 if(cancelGroup){$("editStudentGroupForm").classList.add("hidden");$("editStudentGroupForm").reset();return}
});
$("studentManagementResults").addEventListener("submit",async e=>{
 if(e.target.id==="addStudentForm"){
  e.preventDefault();
  const name=$("newStudentName").value.trim(),group=$("newStudentGroup").value;
  if(!name||!group){msg("studentManagementMessage","اكتب اسم الطالب واختر المجموعة.",true);return}
  if(dashboardStudents.some(x=>normalizeStudentName(x.full_name)===normalizeStudentName(name))){
   msg("studentManagementMessage","الاسم مسجل بالفعل. افتح نتيجة الطالب الموجودة لتعديل بياناته.",true);return;
  }
  const submit=e.target.querySelector("button");
  try{
   submit.disabled=true;submit.textContent="جاري الإضافة...";
   msg("studentManagementMessage","جاري إضافة الطالب وتوليد الكود...");
   const r=await db.rpc("admin_create_student",{p_full_name:name,p_group_level:group});if(r.error)throw r.error;
   const x=Array.isArray(r.data)?r.data[0]:r.data;if(!x?.student_code)throw Error("لم يصل كود الطالب.");
   await loadDashboard();
   msg("studentManagementMessage","تمت إضافة "+x.full_name+" إلى مجموعة "+group+". كود الطالب: "+x.student_code+" — احتفظ بالكود.");
  }catch(err){
   const message=String(err.message||"");
   msg("studentManagementMessage",message.includes("بنفس الاسم")?"الاسم مسجل بالفعل. افتح نتيجة الطالب الموجودة لتعديلها.":"تعذر إضافة الطالب: "+message,true);
   submit.disabled=false;submit.textContent="إضافة الطالب وتوليد الكود";
  }
  return;
 }
 if(e.target.id==="editStudentGroupForm"){
  e.preventDefault();const id=$("editStudentGroupId").value,x=dashboardStudents.find(v=>v.id===id),group=$("editStudentGroup").value;
  if(!x||!group){msg("studentManagementMessage","اختر مجموعة صحيحة للطالب.",true);return}
  if(group===x.group_level){msg("studentManagementMessage","الطالب بالفعل ضمن هذه المجموعة.");$("editStudentGroupForm").classList.add("hidden");return}
  const save=$("editStudentGroupForm").querySelector("button.primary");
  try{save.disabled=true;save.textContent="جاري الحفظ...";const r=await db.rpc("admin_update_student_profile",{p_student_id:id,p_full_name:x.full_name,p_group_level:group});if(r.error)throw r.error;const user=await currentAdmin();await writeAudit(user,"update","student",id,{old_name:x.full_name,new_name:x.full_name,old_group:x.group_level,new_group:group});$("editStudentGroupForm").classList.add("hidden");$("editStudentGroupForm").reset();msg("studentManagementMessage","تم تحديث المجموعة المستهدفة للطالب "+x.full_name+" إلى "+group+".");await loadDashboard()}
  catch(err){msg("studentManagementMessage","تعذر تعديل المجموعة: "+err.message,true)}
  finally{save.disabled=false;save.textContent="حفظ المجموعة"}
  return;
 }
 if(e.target.id==="editStudentForm"){
  e.preventDefault();const id=$("editStudentId").value,x=dashboardStudents.find(v=>v.id===id),name=$("editStudentName").value.trim();
  if(!x||!name){msg("studentManagementMessage","اكتب اسمًا صحيحًا للطالب.",true);return}
  if(dashboardStudents.some(v=>v.id!==id&&normalizeStudentName(v.full_name)===normalizeStudentName(name))){msg("studentManagementMessage","يوجد طالب آخر مسجل بنفس الاسم.",true);return}
  const save=$("editStudentForm").querySelector("button.primary");
  try{save.disabled=true;save.textContent="جاري الحفظ...";const r=await db.rpc("admin_update_student_profile",{p_student_id:id,p_full_name:name,p_group_level:x.group_level});if(r.error)throw r.error;const user=await currentAdmin();await writeAudit(user,"update","student",id,{old_name:x.full_name,new_name:name,old_group:x.group_level,new_group:x.group_level});$("editStudentForm").classList.add("hidden");$("editStudentForm").reset();msg("studentManagementMessage","تم تحديث اسم الطالب بنجاح.");await loadDashboard()}
  catch(err){msg("studentManagementMessage","تعذر تعديل الاسم: "+err.message,true)}
  finally{save.disabled=false;save.textContent="حفظ الاسم"}
 }
});

function targetGroupOrder(name){
 return {"الساعي":1,"البرونزي":2,"الفضي":3,"الذهبي":4,"الماسي":5,"الملكي":6}[name]||99;
}
function currentLevelOrder(points){
 const value=Number(points)||0;
 return value>=300?6:value>=250?5:value>=200?4:value>=150?3:value>=100?2:value>=75?1:0;
}
async function previewMonthlyAwards(competitionId=null){
 const panel=$("monthlyAwardsPreview");
 const parent=panel.closest("details");if(parent)parent.open=true;
 panel.classList.remove("hidden");
 panel.innerHTML='<p class="muted-note">جاري تجهيز معاينة الأوسمة من بيانات التحدي...</p>';
 panel.scrollIntoView({behavior:"smooth",block:"start"});
 try{
  let competition;
  if(competitionId){
   const selected=await db.from("competitions").select("id,title,month_start,month_end,status,awards_finalized_at,awards_revision_pending").eq("id",competitionId).maybeSingle();
   if(selected.error)throw selected.error;competition=selected.data;
  }else{
   const active=await activeMonthly();
   if(!active)throw Error("لا يوجد تحدٍ شهري نشط لمعاينة أوسمته.");
   const selected=await db.from("competitions").select("id,title,month_start,month_end,status,awards_finalized_at,awards_revision_pending").eq("id",active.id).maybeSingle();
   if(selected.error)throw selected.error;competition=selected.data;
  }
  if(!competition)throw Error("لم يتم العثور على بيانات التحدي المحدد.");
  const [monthlyResult,studentsResult,lifetimeResult,existingResult]=await Promise.all([
   db.from("student_monthly_totals").select("student_id,full_name,student_code,is_active,total_points").eq("competition_id",competition.id),
   db.from("students").select("id,group_level,full_name,student_code,is_active").eq("is_active",true),
   db.from("student_lifetime_totals").select("student_id,total_points").eq("is_active",true),
   db.from("achievement_awards").select("student_id,student_name,student_code,achievement_key,medal_tier,target_group_at_award,points_at_award,status,rank_at_award").eq("competition_id",competition.id)
  ]);
  if(monthlyResult.error)throw monthlyResult.error;if(studentsResult.error)throw studentsResult.error;if(lifetimeResult.error)throw lifetimeResult.error;if(existingResult.error)throw existingResult.error;
  const students=new Map((studentsResult.data||[]).map(s=>[s.id,s]));
  const life=new Map((lifetimeResult.data||[]).map(s=>[s.student_id,Number(s.total_points)||0]));
  const existingAwards=existingResult.data||[];
  const isGroupSpecificKey=key=>["target_reached","target_exceeded","target_group_leader","higher_group_leader"].includes(key);
  const keyOf=(studentId,key,target)=>studentId+"|"+key+"|"+(isGroupSpecificKey(key)?(target||""):"");
  const existingMap=new Map(existingAwards.map(a=>[keyOf(a.student_id,a.achievement_key,a.target_group_at_award),a]));
  const preview=[],previewKeys=new Set();
  const addPreview=x=>{
   const key=keyOf(x.student.id,x.key,x.target_group_at_award);
   const old=existingMap.get(key);
   if(old)x.existingStatus=old.status;
   preview.push(x);previewKeys.add(key);
  };
  const rows=(monthlyResult.data||[]).filter(x=>x.is_active&&Number(x.total_points)>0&&students.has(x.student_id)).map(x=>({...x,student:students.get(x.student_id)}));
  const overall=[...rows].sort((a,b)=>Number(b.total_points)-Number(a.total_points));
  let rank=0,previous=null;
  overall.forEach((x,i)=>{
   const points=Number(x.total_points)||0;if(i===0||points!==previous)rank++;previous=points;
   if(rank<=10)addPreview({student:x.student,rank,key:rank===1?"overall_first":rank<=3?"overall_2_3":"overall_4_10",tier:rank===1?"وسام التاج":rank<=3?"وسام النخبة":"وسام الريادة",points,target_group_at_award:x.student.group_level});
  });
  const byTarget=new Map();
  rows.forEach(x=>{const group=x.student.group_level;if(!group)return;if(!byTarget.has(group))byTarget.set(group,[]);byTarget.get(group).push(x)});
  byTarget.forEach(groupRows=>{
   groupRows.sort((a,b)=>Number(b.total_points)-Number(a.total_points));
   if(!groupRows.length)return;
   const top=Number(groupRows[0].total_points)||0;
   groupRows.filter(x=>(Number(x.total_points)||0)===top).forEach(x=>addPreview({student:x.student,rank:1,key:"target_group_leader",tier:"وسام التفوق",points:Number(x.total_points)||0,target_group_at_award:x.student.group_level}));
  });
  const levelGroups=new Map();
  (studentsResult.data||[]).forEach(student=>{
   const lp=life.get(student.id)||0,lr=currentLevelOrder(lp);
   if(lr>0){if(!levelGroups.has(lr))levelGroups.set(lr,[]);levelGroups.get(lr).push({student,lifetimePoints:lp,levelRank:lr})}
  });
  levelGroups.forEach(groupRows=>{
   const top=Math.max(...groupRows.map(x=>x.lifetimePoints));
   groupRows.filter(x=>x.lifetimePoints===top&&x.levelRank>targetGroupOrder(x.student.group_level))
    .forEach(x=>addPreview({student:x.student,rank:1,key:"higher_group_leader",tier:"وسام التميز",points:x.lifetimePoints,target_group_at_award:x.student.group_level}));
  });
  (studentsResult.data||[]).forEach(student=>{
   const lp=life.get(student.id)||0,tr=targetGroupOrder(student.group_level),lr=currentLevelOrder(lp);
   if(tr>6)return;
   if(lr>=tr&&!previewKeys.has(keyOf(student.id,"target_reached",student.group_level))){
    addPreview({student,rank:null,key:"target_reached",tier:"وسام الاستحقاق",points:lp,target_group_at_award:student.group_level});
   }
   if(lr>tr&&!previewKeys.has(keyOf(student.id,"target_exceeded",student.group_level))){
    addPreview({student,rank:null,key:"target_exceeded",tier:"وسام التقدير",points:lp,target_group_at_award:student.group_level});
   }
  });
  existingAwards.forEach(a=>{
   const key=keyOf(a.student_id,a.achievement_key,a.target_group_at_award);
   if(previewKeys.has(key))return;
   const student=students.get(a.student_id)||{id:a.student_id,full_name:a.student_name,student_code:a.student_code,group_level:a.target_group_at_award};
   preview.push({student,rank:a.rank_at_award,key:a.achievement_key,tier:a.medal_tier,points:a.points_at_award,target_group_at_award:a.target_group_at_award,existingStatus:a.status,notExpected:true});
  });
  const d=new Date(competition.month_start+"T00:00:00");
  const title="تحدي "+d.toLocaleDateString("ar-EG",{month:"long",year:"numeric"});
  const rowsHtml=preview.map(x=>{
   const status=x.existingStatus?(x.existingStatus==="active"?"موجود بالفعل":"موجود لكنه ملغي"):(x.notExpected?"وسام سابق يحتاج مراجعة":"استحقاق متوقع");
   return '<div class="preview-award-row"><b>'+esc(x.student.full_name)+'</b> · '+esc(x.tier)+'<br>'+esc(awardAchievementLabel(x.key))+(x.target_group_at_award?" · المجموعة المستهدفة: "+esc(x.target_group_at_award):"")+(x.rank?' · المركز '+x.rank:"")+' · '+Number(x.points||0).toLocaleString("en-US")+' نقطة<br><small>'+status+(x.notExpected?" · لا يظهر ضمن الاستحقاقات الحالية":"")+'</small></div>';
  }).join("");
  const reviewNote=competition.status==="archived"&&competition.awards_revision_pending?
   '<section class="monthly-awards-reapproval"><p><b>هذا التحدي أُعيد فتحه ثم إغلاقه للتصحيح.</b> الأوسمة القديمة لم تتغير تلقائيًا. الاعتماد يضيف الاستحقاقات الجديدة فقط؛ أما الأوسمة القديمة التي لم تعد مستحقة فتراجعها الإدارة وتلغيها من قسم إدارة الأوسمة.</p><button id="approveReopenedAwardsBtn" class="primary" type="button">اعتماد الاستحقاقات بعد التصحيح</button></section>':"";
  panel.innerHTML='<h4>معاينة أوسمة '+esc(title)+'</h4><p class="muted-note">المعاينة للعرض والمراجعة فقط، ولا تمنح أي وسام بمجرد فتحها.</p><p><b>'+preview.length+'</b> بندًا للمراجعة وفق البيانات الحالية.</p>'+(rowsHtml||'<p class="muted-note">لا توجد استحقاقات ظاهرة حاليًا.</p>')+reviewNote;
  const approve=$("approveReopenedAwardsBtn");
  if(approve)approve.onclick=async()=>{
   const reason=window.prompt("اكتب سبب اعتماد تصحيح الأوسمة (إجباري):");
   if(reason===null)return;
   if(!reason.trim()){alert("لازم تكتب سبب الاعتماد.");return}
   if(!window.confirm("بعد المراجعة، اعتماد الاستحقاقات الجديدة لهذا التحدي؟ الأوسمة القديمة لن تُلغى تلقائيًا."))return;
   approve.disabled=true;approve.textContent="جاري الاعتماد...";
   try{
    const result=await db.rpc("admin_approve_reopened_achievement_awards",{p_competition_id:competition.id,p_reason:reason.trim()});
    if(result.error)throw result.error;
    await loadDashboard();
    await previewMonthlyAwards(competition.id);
    const note=document.createElement("p");note.className="message";note.textContent="تم اعتماد التصحيح. أضيف "+(Number(result.data)||0)+" وسامًا جديدًا، ولم يتم إلغاء أي وسام قديم تلقائيًا.";
    panel.prepend(note);
   }catch(error){approve.disabled=false;approve.textContent="اعتماد الاستحقاقات بعد التصحيح";alert("تعذر اعتماد التصحيح: "+error.message)}
  };
 }catch(error){panel.innerHTML='<p class="message">'+esc("تعذر تجهيز المعاينة: "+error.message)+'</p>'}
}
$("monthlyAwardsPreviewBtn").onclick=()=>{
 const panel=$("monthlyAwardsPreview");
 if(!panel.classList.contains("hidden")){panel.classList.add("hidden");return}
 previewMonthlyAwards();
};

function weekName(n){return ["","الأول","الثاني","الثالث","الرابع","الخامس"][n]||String(n)}
function renderPeriodControls(monthly,weekly){
  $("monthlyAwardsPreviewBtn").classList.toggle("hidden",!monthly);
  $("monthlyAwardsPreview").classList.add("hidden");
  $("monthlyStatus").textContent=monthly?"نشط — من "+dateText(monthly.month_start)+" إلى "+dateText(monthly.month_end):"لا يوجد تحدٍ شهري نشط";
  if($("monthlyStartDate")){$("monthlyStartDate").value=monthly?.month_start||"";$("monthlyStartDate").disabled=false;}
  if($("monthlyEndDate"))$("monthlyEndDate").value=monthly?.month_end||"";
  $("monthlyStartBtn").classList.toggle("hidden",!!monthly||!!selectedReopenCompetitionId);$("monthlyEndBtn").classList.toggle("hidden",!monthly);$("monthlySaveDatesBtn").classList.toggle("hidden",!monthly);$("monthlyReopenBtn").classList.toggle("hidden",!!monthly||!selectedReopenCompetitionId);
  $("weeklyStatus").textContent=weekly?"نشط — الأسبوع "+weekName(weekly.week_number)+" — من "+dateText(weekly.week_start)+" إلى "+(weekly.week_end?dateText(weekly.week_end):"نهاية غير محددة"):"لا يوجد أسبوع نشط حاليًا";
  $("weeklyEndBtn").classList.toggle("hidden",!weekly);
  $("weeklyStartBtn").classList.toggle("hidden",!!weekly||!monthly);
  if(!$("weeklyStartDate").value)$("weeklyStartDate").value=localDate();
  if(!$("weeklyEndDate").value)$("weeklyEndDate").value=localDate();
  $("weeklyStartBtn").textContent="بدء الأسبوع المحدد"
}
async function loadHistory(monthly){
  const [w,c]=await Promise.all([
    db.from("weekly_challenges").select("id,competition_id,week_number,title,week_start,week_end,status").order("created_at",{ascending:false}).limit(200),
    db.from("competitions").select("id,title,month_start,month_end,status,awards_revision_pending,awards_finalized_at").order("created_at",{ascending:false}).limit(20)
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
  $("monthlyHistory").innerHTML=c.data.length?c.data.map(month=>{
    const weeks=(w.data||[]).filter(x=>x.competition_id===month.id);
    const slots=Array.from({length:5},(_,i)=>{
      const n=i+1,x=weeks.find(v=>Number(v.week_number)===n);
      return "<div class='archive-week-row'><div><b>الأسبوع "+weekName(n)+"</b><small>"+(x?dateText(x.week_start)+" – "+dateText(x.week_end):"لم يبدأ بعد")+"</small></div><span>"+(x?(x.status==="active"?"نشط":"مكتمل"):"غير متاح")+"</span>"+(x?"<button class='history-btn' data-history-type='weekly' data-history-id='"+x.id+"'>النتائج</button>":"")+"</div>";
    }).join("");
    return "<tr><td>"+esc(month.title||"التحدي الشهري")+"</td><td>"+dateText(month.month_start)+" – "+dateText(month.month_end)+"</td><td>"+(month.status==="active"?"نشط":"منتهي")+"</td><td><details class='admin-month-archive'><summary>الأسابيع الخمسة</summary>"+slots+"</details>"+(month.status==="archived"?"<button class='history-btn' data-history-type='monthly' data-history-id='"+month.id+"'>نتائج الشهر</button>":"")+(month.status==="archived"&&month.awards_revision_pending?"<button class='history-btn' data-history-type='monthly_awards' data-history-id='"+month.id+"'>مراجعة أوسمة التحدي</button>":"")+(month.status==="archived"&&!month.awards_revision_pending&&month.awards_finalized_at?"<button class='history-btn' data-history-type='monthly_reopen' data-history-id='"+month.id+"' data-reopen-start='"+month.month_start+"' data-reopen-end='"+(month.month_end||"")+"'>إعادة فتح الدورة</button>":"")+"</td></tr>";
  }).join(""):'<tr><td colspan="4">لا يوجد سجل شهري</td></tr>'
}
$("weeklyHistory").onclick=handleHistoryClick;$("weeklyProgress").onclick=handleHistoryClick;$("monthlyHistory").onclick=handleHistoryClick;
async function handleHistoryClick(e){const b=e.target.closest("[data-history-id]");if(!b)return;if(b.dataset.historyType==="monthly_reopen"){selectedReopenCompetitionId=b.dataset.historyId;$("monthlyStartBtn").classList.add("hidden");$("monthlyStartDate").value=b.dataset.reopenStart||"";$("monthlyEndDate").value=b.dataset.reopenEnd||"";$("monthlyReopenBtn").classList.remove("hidden");$("monthlyReopenBtn").scrollIntoView({behavior:"smooth",block:"center"});msg("pointsMessage","تم اختيار الدورة المؤرشفة. راجع التواريخ ثم اضغط إعادة فتح الدورة.");return}if(b.dataset.historyType==="monthly_awards"){await previewMonthlyAwards(b.dataset.historyId);return}await showPeriodResults(b.dataset.historyType,b.dataset.historyId)}
async function showPeriodResults(type,id){
  try{
    const monthly=type==="monthly",column=monthly?"competition_id":"weekly_challenge_id",view=monthly?"student_monthly_totals":"student_weekly_totals";
    const archived=await db.from("challenge_result_snapshots").select("student_id,student_name,total_points,rank").eq("period_type",type).eq("period_id",id).order("rank",{ascending:true});
    if(archived.error)throw archived.error;
    let rows=(archived.data||[]).map(x=>({student_id:x.student_id,full_name:x.student_name,total_points:x.total_points,rank:x.rank}));
    if(!rows.length){
      const period=monthly?await db.from("competitions").select("status").eq("id",id).maybeSingle():await db.from("weekly_challenges").select("status").eq("id",id).maybeSingle();
      if(period.error)throw period.error;
      if(period.data?.status!=="archived"){const live=await db.from(view).select("student_id,full_name,total_points").eq(column,id);if(live.error)throw live.error;rows=(live.data||[]).sort((a,b)=>b.total_points-a.total_points||a.full_name.localeCompare(b.full_name,"ar"));}
    }else rows.sort((a,b)=>a.rank-b.rank||a.full_name.localeCompare(b.full_name,"ar"));
    $("challengeResultsTitle").textContent=monthly?"نتائج التحدي الشهري":"نتائج التحدي الأسبوعي";
    let lastPoints=null,lastRank=0;
    $("challengeResultsTable").innerHTML=rows.length?rows.map((x,i)=>{const points=Number(x.total_points)||0,repeated=i>0&&points===lastPoints;if(!repeated)lastRank++;lastPoints=points;return "<tr><td>"+rankLabel(lastRank,repeated)+"</td><td>"+esc(x.full_name)+"</td><td>"+points.toLocaleString("en-US")+"</td></tr>"}).join(""):'<tr><td colspan="3">لا توجد نقاط مسجلة لهذا التحدي</td></tr>';
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
    const start=$("monthlyStartDate").value,end=$("monthlyEndDate").value;
    if(!start||!end||end<start)throw Error("حدد تاريخ بداية ونهاية صحيحين للتحدي الشهري.");
    const r=await db.rpc("admin_start_monthly_challenge",{p_month_start:start,p_month_end:end});if(r.error)throw r.error;
    const created=Array.isArray(r.data)?r.data[0]:r.data;
    await writeAudit(user,"start","monthly_challenge",created.id,{month_start:start,month_end:end});msg("pointsMessage","بدأ التحدي الشهري بنجاح.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر بدء التحدي الشهري: "+e.message,true)}
};
$("monthlySaveDatesBtn").onclick=async()=>{
  try{
    const user=await currentAdmin(),active=await activeMonthly();
    if(!active)throw Error("ابدأ التحدي الشهري أولًا.");
    const start=$("monthlyStartDate").value,end=$("monthlyEndDate").value;
    if(!start||!end||end<start)throw Error("تأكد من صحة تاريخ بداية ونهاية الشهر.");
    const r=await db.rpc("admin_set_monthly_dates",{p_competition_id:active.id,p_month_start:start,p_month_end:end});if(r.error)throw r.error;
    await writeAudit(user,"update","monthly_challenge",active.id,{old_month_start:active.month_start,month_start:start,month_end:end});
    msg("pointsMessage","تم حفظ تواريخ بداية ونهاية التحدي الشهري.");await loadDashboard();
  }catch(e){msg("pointsMessage","تعذر حفظ تاريخ النهاية: "+e.message,true)}
};
let selectedReopenCompetitionId=null;
$("monthlyReopenBtn").onclick=async()=>{
 try{
  if(!selectedReopenCompetitionId)throw Error("اختر دورة مؤرشفة من سجل التحديات أولًا.");
  const start=$("monthlyStartDate").value,end=$("monthlyEndDate").value;
  if(!start||!end||end<start)throw Error("راجع تاريخ بداية ونهاية الدورة.");
  const reason=prompt("اكتب سبب إعادة فتح الدورة:");
  if(reason===null)return;
  if(!reason.trim())throw Error("سبب إعادة فتح الدورة مطلوب.");
  const user=await currentAdmin();
  const {error}=await db.rpc("admin_reopen_monthly_challenge",{p_competition_id:selectedReopenCompetitionId,p_month_start:start,p_month_end:end,p_reason:reason.trim()});
  if(error)throw error;
  await writeAudit(user,"reopen","monthly_challenge",selectedReopenCompetitionId,{month_start:start,month_end:end,reason:reason.trim()});
  selectedReopenCompetitionId=null;
  msg("pointsMessage","تمت إعادة فتح نفس الدورة بنجاح. بعد إنهائها مجددًا ستظهر مراجعة الأوسمة لاعتماد أي تغييرات.");
  await loadDashboard();
 }catch(error){msg("pointsMessage","تعذر إعادة فتح الدورة: "+error.message,true)}
};
$("monthlyEndBtn").onclick=async()=>{
  try{const user=await currentAdmin(),active=await activeMonthly();if(!active)throw Error("لا يوجد تحدٍ شهري نشط.");
    if(await activeWeekly())throw Error("أنهِي الأسبوع النشط أولًا قبل إنهاء التحدي الشهري.");
    if(!active.month_end)throw Error("حدد تاريخ نهاية التحدي الشهري واحفظه أولًا.");
    const r=await db.from("competitions").update({status:"archived",archived_at:new Date().toISOString(),ended_by:user.id}).eq("id",active.id);if(r.error)throw r.error;
    await writeAudit(user,"end","monthly_challenge",active.id,{month_start:active.month_start});msg("pointsMessage","انتهى التحدي الشهري وحُفظت نتائجه.");await loadDashboard()
  }catch(e){msg("pointsMessage","تعذر إنهاء التحدي الشهري: "+e.message,true)}
};



let assistantMemberships=[],assistantCurrentCompetition=null,assistantCurrentTotals=new Map(),assistantSelectedStudentId=null,assistantProfileEntries=[];
function assistantMessage(message,bad=false){const el=$("assistantManagementMessage");if(el){el.textContent=message||"";el.style.color=bad?"#f1a39a":"#b58b3b"}}
function assistantPointsFor(id){return Number(assistantCurrentTotals.get(id)||0)}
function renderAssistantList(){
 const host=$("assistantListResults");if(!host)return;
 const raw=$("assistantListSearch").value.trim(),query=normalizeStudentName(raw),code=normalizeCardNumber(raw);
 const rows=assistantMemberships.filter(m=>m.is_active).map(m=>({membership:m,student:dashboardStudents.find(s=>s.id===m.student_id)})).filter(x=>x.student)
 .filter(x=>!raw||normalizeStudentName(x.student.full_name).includes(query)||String(x.student.student_code||"").includes(code))
 .sort((x,y)=>assistantPointsFor(y.student.id)-assistantPointsFor(x.student.id)||String(x.student.full_name).localeCompare(String(y.student.full_name),"ar"));
 host.innerHTML=rows.length?rows.map(x=>"<article class='assistant-list-item'><button type='button' class='assistant-list-open' data-assistant-open='"+x.student.id+"'><span><b>"+esc(x.student.full_name)+"</b><small>الكود: "+esc(x.student.student_code)+"</small></span><strong>"+assistantPointsFor(x.student.id).toLocaleString("en-US")+" نقطة</strong></button></article>").join(""):"<p class='muted-note'>"+(assistantMemberships.some(m=>m.is_active)?"لا توجد نتائج مطابقة.":"لم تتم إضافة مساعدين حتى الآن.")+"</p>";
}
function renderAssistantAddResults(){
 const host=$("assistantAddResults");if(!host)return;
 const raw=$("assistantAddSearch").value.trim(),query=normalizeStudentName(raw),code=normalizeCardNumber(raw);
 if(!raw){host.innerHTML="<p class='muted-note'>ابدأ بكتابة اسم الطالب أو كوده.</p>";return}
 const rows=dashboardStudents.filter(s=>normalizeStudentName(s.full_name).includes(query)||String(s.student_code||"").includes(code)).slice(0,12);
 host.innerHTML=rows.length?rows.map(s=>{
  const exists=assistantMemberships.some(m=>m.student_id===s.id&&m.is_active);
  return "<article class='assistant-add-result'><div><b>"+esc(s.full_name)+"</b><small>الكود: "+esc(s.student_code)+"</small></div>"+(exists?"<span class='assistant-already-added'>مضاف بالفعل</span>":"<button type='button' class='secondary' data-assistant-add='"+s.id+"'>إضافة مساعد</button>")+"</article>";
 }).join(""):"<p class='muted-note'>لا يوجد طالب مطابق للبحث.</p>";
}
async function loadAssistantManagement(monthly=null){
 if(!monthly)monthly=await activeMonthly();
 const [membersResult,entriesResult]=await Promise.all([
  db.from("assistant_memberships").select("id,student_id,is_active,added_at,removed_at").eq("is_active",true),
  monthly?db.from("assistant_point_entries").select("student_id,points_delta").eq("competition_id",monthly.id):Promise.resolve({data:[],error:null})
 ]);
 if(membersResult.error)throw membersResult.error;if(entriesResult.error)throw entriesResult.error;
 assistantMemberships=membersResult.data||[];assistantCurrentCompetition=monthly;assistantCurrentTotals=new Map();
 (entriesResult.data||[]).forEach(x=>assistantCurrentTotals.set(x.student_id,(assistantCurrentTotals.get(x.student_id)||0)+Number(x.points_delta||0)));
 const cycle=$("assistantCycleStatus");
 if(cycle)cycle.textContent=monthly?"الدورة الحالية: "+(monthly.title||"التحدي الشهري")+" · "+dateText(monthly.month_start)+" – "+dateText(monthly.month_end):"لا توجد دورة نشطة حاليًا؛ إضافة المساعدين متاحة، لكن تسجيل النقاط متوقف.";
 renderAssistantList();renderAssistantAddResults();
 if(assistantSelectedStudentId)await loadAssistantProfile(assistantSelectedStudentId);else $("assistantProfile").classList.add("hidden");
}
async function loadAssistantProfile(studentId){
 const host=$("assistantProfile"),student=dashboardStudents.find(s=>s.id===studentId);if(!host||!student)return;
 host.classList.remove("hidden");host.innerHTML="<p class='muted-note'>جاري تحميل ملف المساعد وسجل النقاط...</p>";
 try{
  const [entriesResult,adminsResult]=await Promise.all([
   db.from("assistant_point_entries").select("id,competition_id,operation_type,points_value,points_delta,previous_total,new_total,created_by,created_at,competition:competitions(title,month_start,month_end)").eq("student_id",studentId).order("created_at",{ascending:false}),
   db.from("admin_profiles").select("user_id,display_name").eq("is_active",true)
  ]);
  if(entriesResult.error)throw entriesResult.error;if(adminsResult.error)throw adminsResult.error;
  assistantProfileEntries=entriesResult.data||[];
  const adminMap=new Map((adminsResult.data||[]).map(x=>[x.user_id,x.display_name]));
  const currentId=assistantCurrentCompetition?.id,currentTotal=assistantPointsFor(studentId);
  const currentEntries=assistantProfileEntries.filter(x=>x.competition_id===currentId);
  const history=currentEntries.length?currentEntries.map(x=>"<tr><td>"+new Date(x.created_at).toLocaleString("ar-EG")+"</td><td>"+(x.operation_type==="add"?"إضافة نقاط":"تعديل الإجمالي")+"</td><td>"+Number(x.points_value).toLocaleString("en-US")+"</td><td>"+Number(x.previous_total).toLocaleString("en-US")+" ← "+Number(x.new_total).toLocaleString("en-US")+"</td><td>"+esc(adminMap.get(x.created_by)||"مشرف")+"</td></tr>").join(""):"<tr><td colspan='5'>لا توجد عمليات نقاط في الدورة الحالية.</td></tr>";
  const archiveMap=new Map();
  assistantProfileEntries.forEach(x=>{if(!x.competition_id||x.competition_id===currentId)return;const c=x.competition||{};if(!archiveMap.has(x.competition_id))archiveMap.set(x.competition_id,{title:c.title||"دورة سابقة",start:c.month_start,end:c.month_end,total:0});archiveMap.get(x.competition_id).total+=Number(x.points_delta||0)});
  const archives=Array.from(archiveMap.values()).sort((x,y)=>String(y.start||"").localeCompare(String(x.start||""))).map(x=>"<article class='assistant-archive-item'><b>"+esc(x.title)+"</b><small>"+dateText(x.start)+" – "+dateText(x.end)+"</small><strong>"+x.total.toLocaleString("en-US")+" نقطة</strong></article>").join("")||"<p class='muted-note'>لا يوجد أرشيف نقاط سابق لهذا المساعد.</p>";
  const canPoints=!!assistantCurrentCompetition;
  host.innerHTML="<div class='assistant-profile-head'><div><div class='eyebrow'>ملف المساعد</div><h4>"+esc(student.full_name)+"</h4><p>كود الطالب: "+esc(student.student_code)+" · "+(student.is_active?"طالب نشط":"طالب موقوف")+"</p></div><button type='button' class='history-btn' data-assistant-remove='"+studentId+"'>إزالة من قائمة المساعدين</button></div><div class='assistant-current-total'><span>رصيد الدورة الحالية</span><strong>"+currentTotal.toLocaleString("en-US")+" نقطة</strong></div><section class='assistant-points-tools'><h4>إدارة نقاط المساعد</h4><label for='assistantPointsValue'>عدد النقاط</label><input id='assistantPointsValue' type='number' min='0' step='1' placeholder='اكتب العدد' "+(canPoints?"":"disabled")+"><div class='student-points-actions'><button type='button' class='primary' data-assistant-set='"+studentId+"' "+(canPoints?"":"disabled")+">تعديل الإجمالي</button><button type='button' class='secondary' data-assistant-points-add='"+studentId+"' "+(canPoints?"":"disabled")+">إضافة نقاط</button></div>"+(canPoints?"":"<p class='muted-note'>لا يمكن تسجيل نقاط قبل بدء دورة جديدة من إدارة التحديات.</p>")+"</section><section class='assistant-points-history'><h4>سجل عمليات الدورة الحالية</h4><div class='table-wrap'><table><thead><tr><th>التاريخ والوقت</th><th>العملية</th><th>القيمة</th><th>قبل ← بعد</th><th>الإداري</th></tr></thead><tbody>"+history+"</tbody></table></div></section><section class='assistant-archive'><h4>أرشيف نقاط الدورات السابقة</h4>"+archives+"</section>";
 }catch(error){host.innerHTML="<p class='message'>تعذر تحميل ملف المساعد: "+esc(error.message)+"</p>"}
}
async function setAssistantMembership(studentId,action){
 try{
  const {error}=await db.rpc("admin_set_assistant_membership",{p_student_id:studentId,p_action:action});if(error)throw error;
  if(action==="remove"){assistantSelectedStudentId=null;$("assistantProfile").classList.add("hidden")}
  assistantMessage(action==="add"?"تمت إضافة المساعد بنجاح.":"تمت إزالة المساعد من القائمة الحالية، مع الاحتفاظ بسجلاته ونقاطه.");
  await loadAssistantManagement(assistantCurrentCompetition);
 }catch(error){assistantMessage("تعذر تنفيذ العملية: "+error.message,true)}
}
async function adjustAssistantPoints(studentId,mode){
 const value=Number($("assistantPointsValue")?.value);
 if(!Number.isInteger(value)||value<0||(mode==="add"&&value===0)){assistantMessage("اكتب عددًا صحيحًا مناسبًا للنقاط.",true);return}
 try{
  const {error}=await db.rpc("admin_adjust_assistant_points",{p_student_id:studentId,p_mode:mode,p_points:value});if(error)throw error;
  assistantMessage(mode==="add"?"تمت إضافة النقاط بنجاح.":"تم تعديل إجمالي نقاط المساعد بنجاح.");
  await loadAssistantManagement(assistantCurrentCompetition);
 }catch(error){assistantMessage("تعذر تعديل نقاط المساعد: "+error.message,true)}
}
$("assistantListSearch").oninput=renderAssistantList;
$("assistantAddSearch").oninput=renderAssistantAddResults;
$("assistantListResults").onclick=e=>{const b=e.target.closest("[data-assistant-open]");if(!b)return;assistantSelectedStudentId=b.dataset.assistantOpen;loadAssistantProfile(assistantSelectedStudentId)};
$("assistantAddResults").onclick=async e=>{const b=e.target.closest("[data-assistant-add]");if(b)await setAssistantMembership(b.dataset.assistantAdd,"add")};
$("assistantProfile").onclick=async e=>{
 const remove=e.target.closest("[data-assistant-remove]");if(remove){if(confirm("هل تريد إزالة هذا المساعد من القائمة الحالية؟ لن تُحذف نقاطه أو سجلاته."))await setAssistantMembership(remove.dataset.assistantRemove,"remove");return}
 const add=e.target.closest("[data-assistant-points-add]");if(add){await adjustAssistantPoints(add.dataset.assistantPointsAdd,"add");return}
 const set=e.target.closest("[data-assistant-set]");if(set)await adjustAssistantPoints(set.dataset.assistantSet,"set_total");
};

loadPublicLeaderboards();
(async()=>{const r=await db.auth.getSession();if(r.data.session){try{await routeAdmin(r.data.session.user)}catch(e){await db.auth.signOut()}}})();

