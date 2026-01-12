import { createClient } from '@supabase/supabase-js';

const PACKAGE_ID_BY_PLAN = {
  // ✅ استبدل هذه القيم بـ UUIDs الفعلية من جدول packages عندك (هي نفسها الموجودة في ملفك الحالي)
  basic: "978b133e-6e14-4edf-aa44-133d11fb2929",
  pro: "a1095068-a87d-4828-827e-cbfac0f0e736",
  premium: "4b562e5d-0fef-4389-9d31-909c3f60b19c",
};

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function safeTrim(v) {
  return (v ?? '').toString().trim();
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

    // Required (كما كان)
    const firstName = safeTrim(body?.first_name);
    const lastName = safeTrim(body?.last_name);
    const email = safeTrim(body?.email);
    const phone = safeTrim(body?.phone);
    const whatsapp = safeTrim(body?.whatsapp);
    const nationality = safeTrim(body?.nationality);
    const residenceCountry = safeTrim(body?.residence_country);
    const plan = safeTrim(body?.plan); // basic | pro | premium

    // ✅ NEW: حقول كانت لا تُرسل/لا تُحفظ
    const sexe = safeTrim(body?.sexe);          // profiles.sexe
    const birthday = safeTrim(body?.birthday);  // profiles.birthday (date: YYYY-MM-DD)
    const adressRaw = safeTrim(body?.adress);   // profiles.adress
    const adress = (adressRaw && adressRaw !== 'غير محدد') ? adressRaw : null;

    // عندك في الفورم birthday + sexe إجبارية، فنعتبرها Required هنا أيضاً
    if (!firstName || !lastName || !email || !phone || !nationality || !residenceCountry || !plan || !sexe || !birthday) {
      return json(res, 400, {
        error: 'Missing required fields. Required: first_name, last_name, email, phone, nationality, residence_country, plan, sexe, birthday',
      });
    }

    const packageId = PACKAGE_ID_BY_PLAN[plan];
    if (!packageId) {
      return json(res, 400, { error: 'Invalid plan. Must be one of: basic, pro, premium.' });
    }

    // ✅ ندخل أعمدة جدول profiles الحقيقية
    const profilePayload = {
      full_name: `${firstName} ${lastName}`.trim(),
      email,
      Phone_num: phone,
      whatsapp: whatsapp || null,
      country: nationality,
      residance_country: residenceCountry,
      package_id: packageId,

      // ✅ NEW fields
      sexe: sexe,
      birthday: birthday,
      adress: adress,

      // ملاحظة: created_at غالباً Default في DB
      // is_admin لا نرسله ليبقى false افتراضياً
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert(profilePayload)
      .select('id, full_name, email, package_id, sexe, birthday, adress')
      .single();

    if (error) {
      return json(res, 400, { error: error.message, details: error });
    }

    return json(res, 200, { ok: true, profile: data });
  } catch (err) {
    return json(res, 500, { error: 'Server error', details: String(err?.message || err) });
  }
}
