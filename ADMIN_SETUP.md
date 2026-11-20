# إعداد حسابات مشرفي مسابقة صفوة الحفاظ

تم تجهيز شاشة الدخول لتستخدم اسم المستخدم، مع حساب داخلي لكل مشرف بصيغة البريد التالية:
`<username>@admins.safwa.local`

## إنشاء حسابات Auth

1. افتح لوحة Supabase للمشروع: https://supabase.com/dashboard/project/rjbiahkjfmhexexssczg/auth/users
2. اختر **Add user** ثم **Create new user**.
3. أنشئ الحسابات الستة باستخدام البريد الداخلي المقابل لكل اسم مستخدم، وكلمة المرور المؤقتة التي تم تسليمها للمشرف.
4. فعّل **Auto Confirm User** لكل حساب. لا يلزم إرسال بريد إلكتروني؛ هذه عناوين داخلية لتسجيل الدخول فقط.

| اسم المستخدم | البريد الداخلي |
|---|---|
| Waleed-abdelmon3m | waleed-abdelmon3m@admins.safwa.local |
| Somiaa-osman | somiaa-osman@admins.safwa.local |
| Farouk-salah | farouk-salah@admins.safwa.local |
| Basmala-hendy | basmala-hendy@admins.safwa.local |
| Yousef-Mohamed | yousef-mohamed@admins.safwa.local |
| Asmaa-mekky | asmaa-mekky@admins.safwa.local |

## ربط الحسابات بصلاحيات المشرف

بعد إنشاء المستخدمين الستة، افتح SQL Editor:
https://supabase.com/dashboard/project/rjbiahkjfmhexexssczg/sql/new

انسخ محتوى `supabase/admin_profiles_seed.sql` ونفّذه مرة واحدة. سيضيف الحسابات إلى `admin_profiles` بصلاحيات متساوية، ويجعل تغيير كلمة المرور إلزاميًا عند أول تسجيل دخول.

## ملاحظات أمنية

- لا تضف أي كلمة مرور إلى GitHub أو ملفات SQL.
- لا تشارك كلمات المرور في مجموعة عامة.
- بعد أول تسجيل دخول، سيطلب الموقع من كل مشرف تعيين كلمة مرور شخصية جديدة (12 حرفًا على الأقل).
- كل المشرفين الستة لهم نفس الصلاحيات.
