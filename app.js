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
let selectedAdminStudentId=null;
let adminStudentEntries=null;
let adminStudentEntriesLoading=false;
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
function renderLevelLeaderboard(){
 const groupName=$("leaderboardLevelSelect").value;
 const rows=publicLeaderboardData?.groups?.[groupName]||[];
 $("levelLeaderboard").innerHTML=leaderboardRows(rows,groupName);
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
  await loadPublicChallengeArchive();
 }catch(error){
  $("overallLeaderboard").innerHTML='<tr><td colspan="3" class="leaderboard-empty">تعذر تحميل الترتيب حاليًا.</td></tr>';
  $("levelLeaderboard").innerHTML='<tr><td colspan="3" class="leaderboard-empty">تعذر تحميل الترتيب حاليًا.</td></tr>';
  $("leaderboardMessage").textContent="تأكد من اتصال الإنترنت وحاول تحديث الصفحة.";
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
  const {data,error}=await db.rpc("student_lookup_by_code",{p_student_code:code});if(error)throw error;
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
 const weeklyLine=history.length?"نقاطك المسجلة أسبوعيًا: "+history.map(w=>"الأسبوع "+Number(w.week_number)+": "+(Number(w.points)||0).toLocaleString("en-US")+" نقطة").join(" · "):"لا توجد نقاط أسبوعية مسجلة في المسابقة الحالية.";
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
 <header class="achievement-card-header"><span class="achievement-mark">۞</span><div><b>مركز صفوة الحفاظ</b><small>مسابقة النقاط · بطاقة إنجاز الطالب</small></div><span class="achievement-mark">۞</span></header>
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
async function createAchievementExportStage(){
 if(!currentAchievementData)throw Error("بيانات كارت الإنجاز غير متاحة");
 const holder=document.createElement("div");
 holder.className="achievement-export-stage";
 holder.innerHTML=renderAchievementCard(currentAchievementData);
 const card=holder.querySelector("#studentAchievementCard");
 if(!card)throw Error("تعذر تجهيز تصميم الكارت");
 if(!window.QRCode)throw Error("تعذر تحميل مولّد رمز QR. حدّث الصفحة وحاول مرة أخرى.");
 const studentCode=currentAchievementData?.student?.student_code;
 if(!studentCode)throw Error("كود الطالب غير متاح لإنشاء كارت الإنجاز.");
 const {data:cardData,error:cardError}=await db.rpc("get_or_create_achievement_card",{p_student_code:String(studentCode)});
 if(cardError)throw cardError;
 if(!cardData?.card_number)throw Error("تعذر إنشاء رقم كارت الإنجاز.");
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
 .achievement-export-stage .achievement-card-qr-code,.achievement-export-stage .achievement-card-qr-code canvas,.achievement-export-stage .achievement-card-qr-code img{display:block!important;width:126px!important;height:126px!important}
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
 return {holder,card};
}
async function printStudentAchievementCard(){
 let stage;
 const status=$("studentExportMessage");
 try{stage=await createAchievementExportStage()}catch(e){status.textContent=e.message||"تعذر تجهيز كارت الإنجاز";return}
 document.body.classList.add("printing-achievement-card");
 const cleanup=()=>{document.body.classList.remove("printing-achievement-card");stage.holder.remove()};
 window.addEventListener("afterprint",cleanup,{once:true});
 window.print();
 setTimeout(cleanup,2500);
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
 const weeklyChartHtml=history.length?'<div class="student-weekly-chart">'+history.map(w=>'<div class="student-week-column"><div class="student-week-bars"><i class="student-own-bar" style="height:'+Math.max(3,(Number(w.points)||0)/chartMax*100)+'%"></i><i class="student-average-bar" style="height:'+Math.max(3,(Number(w.group_average)||0)/chartMax*100)+'%"></i></div><b>أسبوع '+Number(w.week_number)+'</b><small>'+(Number(w.points)||0)+' نقطة</small></div>').join("")+'</div><div class="student-chart-legend"><span><i class="student-own-key"></i> نقاطك</span><span><i class="student-average-key"></i> متوسط المجموعة</span></div>':'<p class="muted-note">لا توجد بيانات أسابيع مسجلة في المسابقة الحالية بعد.</p>';
 const ownVsAverage=Math.max(0,Number(performance.group_average)||0,total,1),groupOwnWidth=Math.min(100,total/ownVsAverage*100),groupAverageWidth=Math.min(100,(Number(performance.group_average)||0)/ownVsAverage*100);
 const neighborRows=[{label:"الطالب السابق",student:previousStudent},{label:"الطالب التالي",student:nextStudent}];
 const neighborHtml='<div class="student-nearby-pair">'+neighborRows.map(item=>item.student?'<article><small>'+item.label+'</small><b>'+esc(item.student.name)+'</b><span>المركز '+Number(item.student.rank)+' · '+Number(item.student.points).toLocaleString("en-US")+' نقطة</span></article>':'<article class="is-empty"><small>'+item.label+'</small><b>'+(item.label==="الطالب السابق"?"أنت في أول الترتيب":"أنت في آخر الترتيب")+'</b><span>لا يوجد طالب آخر في هذا الاتجاه</span></article>').join("")+'</div>';

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

   <section class="student-progress-card student-performance-card"><h3>أداؤك أسبوعًا بعد أسبوع</h3><p class="student-chart-note">مقارنة نقاطك بمتوسط نقاط مجموعتك في كل أسبوع من المسابقة</p>${weeklyChartHtml}</section>
   <section class="student-progress-card student-group-performance"><h3>معدلات أدائك في مجموعتك</h3><div class="student-group-kpis"><div><strong>${Number(performance.group_rank)||"—"}</strong><span>ترتيبك في المجموعة</span></div><div><strong>${Number(performance.group_size)||0}</strong><span>عدد طلاب المجموعة</span></div><div><strong>${Number(performance.group_average)||0}</strong><span>متوسط نقاط المجموعة</span></div></div><div class="student-compare-row"><span>نقاطك</span><div class="student-compare-track"><i style="width:${groupOwnWidth}%"></i></div><b>${total}</b></div><div class="student-compare-row average"><span>المتوسط</span><div class="student-compare-track"><i style="width:${groupAverageWidth}%"></i></div><b>${Number(performance.group_average)||0}</b></div><p class="student-chart-note">${total>Number(performance.group_average||0)?"أنت أعلى من متوسط مجموعتك بـ "+(total-Number(performance.group_average||0))+" نقطة.":total<Number(performance.group_average||0)?"متبقي لك "+(Number(performance.group_average||0)-total)+" نقطة لتصل إلى متوسط مجموعتك.":"أنت عند متوسط مجموعتك تمامًا."}</p></section>
   <section class="student-progress-card student-nearby-card"><h3>الطالبان المجاوران لترتيبك</h3><p class="student-chart-note">اسم الطالب السابق والطالب التالي لك مباشرة في ترتيب المجموعة</p>${neighborHtml}</section>
   <section class="student-progress-card student-rankings"><h3>ترتيبك بين زملائك في المجموعة المستهدفة</h3><div class="student-ranking-grid">
    <div><h4>أفضل الطلاب إجمالًا</h4><ol id="studentOverallTop"><li>جاري تحميل الترتيب...</li></ol></div>
    <div><h4>أفضل الطلاب في مجموعتك المستهدفة</h4><ol id="studentLevelTop"><li>جاري تحميل الترتيب...</li></ol></div>
   </div></section>
   <div class="student-report-footer"><span>أثرٌ يبقى</span><i>۞</i><span>نورٌ لا ينطفئ</span><small>هذا التقرير يعرض بيانات الطالب وقت الاستعلام</small></div>
  </div>
  <div class="student-profile-actions"><button type="button" class="secondary" id="studentPrintBtn">🖨️ طباعة / حفظ PDF</button><button type="button" class="secondary" id="studentImageBtn">🖼️ حفظ التقرير صورة</button><button type="button" class="primary" id="studentLookupAgain">استعلام بكود آخر</button></div><p id="studentExportMessage" class="message" aria-live="polite"></p>`;
 $("studentLookupAgain").onclick=()=>{$("studentProfile").classList.add("hidden");$("studentForm").classList.remove("hidden");$("studentCode").value="";$("studentMessage").textContent="";$("studentCode").focus()};
 $("studentPrintBtn").onclick=printStudentAchievementCard;
 $("studentImageBtn").onclick=saveStudentReportImage;
 currentAchievementData=data;
 loadStudentReportRankings(s);
}
async function loadStudentReportRankings(student){
 try{
  const {data,error}=await db.rpc("public_leaderboards");if(error)throw error;
  const overall=(data?.overall||[]).slice(0,10),byLevel=(data?.groups?.[student.group_level]||[]).slice(0,10);
  const render=rows=>{let previousPoints=null,currentRank=0;return rows.length?rows.map((x,i)=>{const points=Number(x.points)||0,repeated=i>0&&points===previousPoints;if(!repeated)currentRank++;previousPoints=points;return '<li class="'+(x.name===student.full_name?'is-me':'')+'"><span>'+rankLabel(currentRank,repeated)+'</span><b>'+esc(x.name)+(x.name===student.full_name?' (أنت)':'')+'</b><strong>'+points.toLocaleString("en-US")+'</strong></li>'}).join(""):'<li>لا توجد بيانات متاحة حاليًا.</li>'};
  $("studentOverallTop").innerHTML=render(overall);$("studentLevelTop").innerHTML=render(byLevel);
 }catch(e){$("studentOverallTop").innerHTML="<li>تعذر تحميل الترتيب حاليًا.</li>";$("studentLevelTop").innerHTML="<li>تعذر تحميل الترتيب حاليًا.</li>";}
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
$("adminHomeBtn").onclick=()=>show("homeView");
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
    renderAllStudentsRanking();
    renderStudentManagement();
    if(selectedAdminStudentId)loadAdminStudentProfile(selectedAdminStudentId);
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
 return "<div class='admin-student-profile-view'>"+
  "<button type='button' class='secondary admin-profile-back' data-back-admin-student>← الرجوع لنتائج البحث</button>"+
  "<section class='admin-student-summary'><div class='eyebrow'>الملف الشخصي للطالب</div><h2>"+esc(student.full_name)+"</h2><div class='admin-student-meta'><span>الكود: "+esc(student.student_code)+"</span><span>المجموعة المستهدفة: "+esc(group)+"</span><span>الحالة: "+(student.is_active?"نشط":"موقوف")+"</span><span>مستوى النقاط: "+esc(currentLevel)+"</span></div><div class='admin-student-total'><small>إجمالي النقاط الحالي</small><strong>"+total.toLocaleString("en-US")+"</strong><span>نقطة</span></div></section>"+
  "<section class='admin-student-tools'><h3>إدارة الطالب</h3>"+
  "<div class='admin-profile-editors'>"+
  "<form id='editStudentForm' class='stack student-editor hidden'><h4>تعديل اسم الطالب</h4><input id='editStudentId' type='hidden'><label for='editStudentName'>الاسم الجديد</label><input id='editStudentName' maxlength='150' required><div class='actions'><button class='primary'>حفظ الاسم</button><button type='button' id='cancelStudentEdit' class='secondary'>إلغاء</button></div></form>"+
  "<form id='editStudentGroupForm' class='stack student-editor hidden'><h4>تعديل المجموعة المستهدفة</h4><input id='editStudentGroupId' type='hidden'><label for='editStudentGroup'>المجموعة المستهدفة الجديدة</label><select id='editStudentGroup' required><option value=''>اختر المجموعة</option><option value='الملكي'>الملكي</option><option value='الماسي'>الماسي</option><option value='الذهبي'>الذهبي</option><option value='الفضي'>الفضي</option><option value='البرونزي'>البرونزي</option><option value='الساعي'>الساعي</option></select><div class='actions'><button class='primary'>حفظ المجموعة</button><button type='button' id='cancelStudentGroupEdit' class='secondary'>إلغاء</button></div></form>"+
  "</div><div class='admin-student-points-control'><label for='studentPoints-"+student.id+"'>عدد النقاط</label><input id='studentPoints-"+student.id+"' data-points-value type='number' min='0' step='1' placeholder='اكتب العدد' "+disabled+"><div class='student-points-actions'><button type='button' class='primary' data-set-total='"+student.id+"' "+disabled+">تعديل الإجمالي</button><button type='button' class='secondary' data-add-points='"+student.id+"' "+disabled+">إضافة نقاط</button></div></div><div class='student-search-card-actions admin-profile-actions'><button type='button' class='history-btn' data-edit-student='"+student.id+"'>تعديل الاسم</button><button type='button' class='history-btn' data-edit-student-group='"+student.id+"'>تعديل المجموعة</button><button type='button' class='danger-btn' data-delete-student='"+student.id+"'>حذف الطالب</button></div></section>"+
  "<section class='admin-performance-section'><h3>مؤشرات الأداء</h3><p class='muted-note'>المؤشرات محسوبة من سجل عمليات النقاط الفعلي المتاح للطالب.</p><div class='admin-performance-kpis'><article><small>نقاط آخر 7 أيام</small><strong>"+last7.toLocaleString("en-US")+"</strong></article><article><small>نقاط الشهر الحالي</small><strong>"+monthPoints.toLocaleString("en-US")+"</strong></article><article><small>متوسط اليوم خلال أسبوع</small><strong>"+(last7/7).toFixed(1)+"</strong></article><article><small>عمليات إضافة النقاط</small><strong>"+positiveEntries.toLocaleString("en-US")+"</strong></article><article><small>إجمالي المضاف</small><strong>"+earned.toLocaleString("en-US")+"</strong></article><article><small>إجمالي المخصوم</small><strong>"+deducted.toLocaleString("en-US")+"</strong></article></div><p class='admin-performance-trend'>"+esc(trendText)+"</p></section>"+
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
 body.innerHTML=rows.length?rows.map((x,i)=>{const points=Number(x.total_points||0),repeated=i>0&&points===previousPoints;if(!repeated)currentRank++;previousPoints=points;return '<tr><td class="all-students-rank">'+rankLabel(currentRank,repeated)+'</td><td class="all-students-name">'+esc(x.full_name||x.student.full_name)+'</td><td class="all-students-points">'+points.toLocaleString("en-US")+'</td><td><span class="all-students-group">'+esc(x.student.group_level||"غير محددة")+'</span></td></tr>'}).join(""):'<tr><td colspan="4" class="muted-note">لا يوجد طلاب مسجلون حتى الآن.</td></tr>';
}
function renderStudentManagement(){
 const query=$("studentAdminSearch").value.trim().toLocaleLowerCase("ar");
 if(selectedAdminStudentId){
  const student=dashboardStudents.find(x=>x.id===selectedAdminStudentId);
  if(!student){selectedAdminStudentId=null;adminStudentEntries=null}
  else{
   if(adminStudentEntriesLoading){$("studentManagementResults").innerHTML="<p class='muted-note'>جاري تحميل سجل أداء الطالب...</p>";return}
   $("studentManagementResults").innerHTML=renderAdminStudentProfile(student);return;
  }
 }
 if(!query){$("studentManagementResults").innerHTML='<p class="muted-note">ابدأ بكتابة اسم الطالب أو كوده للبحث.</p>';return}
 const rows=dashboardStudents.filter(x=>x.full_name.toLocaleLowerCase("ar").includes(query)||x.student_code.includes(query)).slice(0,30);
 $("studentManagementResults").innerHTML=rows.length?rows.map(x=>{
  const total=Number(dashboardRanked.find(y=>y.student_id===x.id)?.total_points||0);
  return "<article class='student-search-card'><div class='student-search-card-info'><button type='button' class='admin-student-name-link' data-open-admin-student='"+x.id+"'>"+esc(x.full_name)+"</button><span>الكود: "+esc(x.student_code)+"</span><span>المجموعة: "+esc(x.group_level||"غير محددة")+" · الحالة: "+(x.is_active?"نشط":"موقوف")+"</span><b class='student-current-total'>الإجمالي الحالي: "+total.toLocaleString("en-US")+" نقطة</b></div><button type='button' class='secondary admin-open-profile' data-open-admin-student='"+x.id+"'>فتح ملف الطالب ←</button></article>"
 }).join(""):'<p class="muted-note">لا توجد نتائج مطابقة لعملية البحث.</p>';
}
async function loadAdminStudentProfile(id){
 adminStudentEntriesLoading=true;adminStudentEntries=null;renderStudentManagement();
 try{
  const r=await db.from("point_entries").select("created_at,points_delta,entry_type,previous_total,new_total,adjustment_reason,competition_id,weekly_challenge_id").eq("student_id",id).order("created_at",{ascending:true});
  if(r.error)throw r.error;
  adminStudentEntries=r.data||[];
 }catch(error){
  adminStudentEntries=[];
  msg("studentManagementMessage","تعذر تحميل سجل النقاط: "+error.message,true);
 }finally{
  adminStudentEntriesLoading=false;
  if(selectedAdminStudentId===id)renderStudentManagement();
 }
}
$("studentAdminSearch").oninput=renderStudentManagement;
$("studentManagementResults").onclick=async e=>{
 const openProfile=e.target.closest("[data-open-admin-student]");
 if(openProfile){const id=openProfile.dataset.openAdminStudent;selectedAdminStudentId=id;await loadAdminStudentProfile(id);return}
 const backProfile=e.target.closest("[data-back-admin-student]");
 if(backProfile){selectedAdminStudentId=null;adminStudentEntries=null;renderStudentManagement();return}

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
function weekName(n){return ["","الأول","الثاني","الثالث","الرابع","الخامس"][n]||String(n)}
function renderPeriodControls(monthly,weekly){
  $("monthlyStatus").textContent=monthly?"نشط — من "+dateText(monthly.month_start)+" إلى "+dateText(monthly.month_end):"لا يوجد تحدٍ شهري نشط";
  if($("monthlyStartDate")){$("monthlyStartDate").value=monthly?.month_start||"";$("monthlyStartDate").disabled=false;}
  if($("monthlyEndDate"))$("monthlyEndDate").value=monthly?.month_end||"";
  $("monthlyStartBtn").classList.toggle("hidden",!!monthly);$("monthlyEndBtn").classList.toggle("hidden",!monthly);$("monthlySaveDatesBtn").classList.toggle("hidden",!monthly);
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
    db.from("competitions").select("id,title,month_start,month_end,status").order("created_at",{ascending:false}).limit(20)
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
    return "<tr><td>"+esc(month.title||"التحدي الشهري")+"</td><td>"+dateText(month.month_start)+" – "+dateText(month.month_end)+"</td><td>"+(month.status==="active"?"نشط":"منتهي")+"</td><td><details class='admin-month-archive'><summary>الأسابيع الخمسة</summary>"+slots+"</details>"+(month.status==="archived"?"<button class='history-btn' data-history-type='monthly' data-history-id='"+month.id+"'>نتائج الشهر</button>":"")+"</td></tr>";
  }).join(""):'<tr><td colspan="4">لا يوجد سجل شهري</td></tr>'
}
$("weeklyHistory").onclick=handleHistoryClick;$("weeklyProgress").onclick=handleHistoryClick;$("monthlyHistory").onclick=handleHistoryClick;
async function handleHistoryClick(e){const b=e.target.closest("[data-history-id]");if(!b)return;await showPeriodResults(b.dataset.historyType,b.dataset.historyId)}
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
$("monthlyEndBtn").onclick=async()=>{
  try{const user=await currentAdmin(),active=await activeMonthly();if(!active)throw Error("لا يوجد تحدٍ شهري نشط.");
    if(await activeWeekly())throw Error("أنهِي الأسبوع النشط أولًا قبل إنهاء التحدي الشهري.");
    if(!active.month_end)throw Error("حدد تاريخ نهاية التحدي الشهري واحفظه أولًا.");
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

