import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteOrigin = "https://safwat-elhofaz.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": siteOrigin,
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "طريقة الطلب غير مدعومة." }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== siteOrigin) return response({ error: "مصدر الطلب غير مسموح." }, 403);

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const rules = {
      lookup: { max: 10, window: 600 },
      issue: { max: 20, window: 600 },
      verify: { max: 60, window: 600 },
    } as const;
    if (!(action in rules)) return response({ error: "نوع الطلب غير صحيح." }, 400);

    const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
    if (!ip || ip.length > 128) return response({ error: "تعذر التحقق من مصدر الاتصال. حاول مرة أخرى." }, 503);

    // Forward the gateway-verified client IP to the existing database lookup limiter.
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-forwarded-for": ip } },
    });
    const rule = rules[action as keyof typeof rules];
    const bucketKey = await sha256(action + ":" + ip);
    const { data: permitted, error: limitError } = await client.rpc("consume_public_request_limit", {
      p_bucket_key: bucketKey, p_max_requests: rule.max, p_window_seconds: rule.window,
    });
    if (limitError) throw limitError;
    if (!permitted) return response({ error: "تم تجاوز عدد المحاولات المسموح. حاول مرة أخرى بعد قليل." }, 429);

    let rpcName: string;
    let rpcArgs: Record<string, string>;
    if (action === "lookup") {
      const code = String(body?.p_student_code || "").trim();
      if (!/^[0-9]{5}$/.test(code)) return response({ error: "الكود لازم يكون خمسة أرقام." }, 400);
      rpcName = "student_lookup_by_code"; rpcArgs = { p_student_code: code };
    } else if (action === "issue") {
      const code = String(body?.p_student_code || "").trim();
      if (!/^[0-9]{5}$/.test(code)) return response({ error: "كود الطالب غير صحيح." }, 400);
      rpcName = "get_or_create_achievement_card"; rpcArgs = { p_student_code: code };
    } else {
      const number = String(body?.p_card_number || "").trim();
      if (!/^[0-9]{8}$/.test(number)) return response({ error: "رقم الكارت لازم يكون 8 أرقام." }, 400);
      rpcName = "verify_achievement_card"; rpcArgs = { p_card_number: number };
    }

    const { data, error } = await client.rpc(rpcName, rpcArgs);
    if (error) {
      const message = String(error.message || "");
      if (message.includes("تجاوز عدد محاولات الاستعلام")) return response({ error: message }, 429);
      if (message.includes("غير صحيح") || message.includes("غير موجود") || message.includes("غير نشط")) return response({ error: message }, 400);
      throw error;
    }
    return response({ data });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "تعذر تنفيذ الطلب حاليًا." }, 500);
  }
});
