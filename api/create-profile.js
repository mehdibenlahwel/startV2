import { createClient } from '@supabase/supabase-js';



const PACKAGE_ID_BY_PLAN = {
  // ✅ استبدل هذه القيم بـ UUIDs الفعلية من جدول packages عندك
  basic: "978b133e-6e14-4edf-aa44-133d11fb2929",
  pro: "a1095068-a87d-4828-827e-cbfac0f0e736",
  premium: "4b562e5d-0fef-4389-9d31-909c3f60b19c",
};

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  // CORS (اختياري)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json(res, 500, { error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables.' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const firstName = (body?.first_name || '').trim();
    const lastName = (body?.last_name || '').trim();
    const email = (body?.email || '').trim();
    const phone = (body?.phone || '').trim();
    const whatsapp = (body?.whatsapp || '').trim();
    const nationality = (body?.nationality || '').trim();
    const residenceCountry = (body?.residence_country || '').trim();
    const plan = (body?.plan || '').trim(); // basic | pro | premium

    if (!firstName || !lastName || !email || !phone || !nationality || !residenceCountry || !plan) {
      return json(res, 400, {
        error: 'Missing required fields. Required: first_name, last_name, email, phone, nationality, residence_country, plan',
      });
    }

    const packageId = PACKAGE_ID_BY_PLAN[plan];
    if (!packageId) {
      return json(res, 400, { error: 'Invalid plan. Must be one of: basic, pro, premium.' });
    }

    // ⚠️ نُدخل فقط الأعمدة المؤكدة في جدول profiles لتفادي أخطاء "column does not exist"
    const profilePayload = {
      full_name: `${firstName} ${lastName}`.trim(),
      email,
      Phone_num: phone,
      whatsapp: whatsapp || null,
      country: nationality,
      residance_country: residenceCountry,
      package_id: packageId,
      // ملاحظة: لا نرسل created_at لأنه غالبًا Default في DB
      // ولا نرسل is_admin لأنه يجب أن يبقى false افتراضيًا
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert(profilePayload)
      .select('id, full_name, email, package_id')
      .single();

    if (error) {
      // في حال تعارض RLS أو أي خطأ
      return json(res, 400, { error: error.message, details: error });
    }

    return json(res, 200, { ok: true, profile: data });
  } catch (err) {
    return json(res, 500, { error: 'Server error', details: String(err?.message || err) });
  }
}
