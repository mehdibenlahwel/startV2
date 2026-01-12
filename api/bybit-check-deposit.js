// api/bybit-check-deposit.js
import crypto from "crypto";

const BYBIT_BASE_URL = "https://api.bybit.com";
const RECV_WINDOW = "5000"; // 5 ثواني

function hmacSha256Hex(secret, message) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function toMs(t) {
  // يقبل رقم (ms) أو ISO string
  if (!t) return null;
  if (typeof t === "number") return t;
  const d = new Date(t);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ok(res, data) {
  res.status(200).json(data);
}

function bad(res, msg, extra = {}) {
  res.status(400).json({ ok: false, error: msg, ...extra });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, "Method not allowed. Use POST.");
  }

  try {
    const apiKey = process.env.BYBIT_API_KEY;
    const apiSecret = process.env.BYBIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      return bad(res, "Missing BYBIT_API_KEY or BYBIT_API_SECRET in environment variables.");
    }

    // توقعنا من الواجهة إرسال:
    // coin: "USDT" أو "BTC" أو "ETH" ...
    // expectedAmount: رقم
    // pressedAt: وقت الضغط (ms أو ISO)
    // chain: اختياري (مفيد لـ USDT)
    // windowBeforeMin: افتراضي 5
    // windowAfterMin: افتراضي 15
    // tolerance: افتراضي 10 (±10)
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const coin = (body?.coin || "").toString().trim().toUpperCase();
    const chain = (body?.chain || "").toString().trim(); // قد تكون TRC20 / ERC20 / ... أو اسم Bybit مثل TRX/ETH/BSC
    const expectedAmount = Number(body?.expectedAmount);
    const tolerance = Number.isFinite(Number(body?.tolerance)) ? Number(body.tolerance) : 10;

    const pressedAtMs = toMs(body?.pressedAt);
    if (!coin) return bad(res, "coin is required (e.g., USDT, BTC, ETH).");
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) return bad(res, "expectedAmount must be a positive number.");
    if (!pressedAtMs) return bad(res, "pressedAt is required (ms timestamp or ISO date).");

    const windowBeforeMin = Number.isFinite(Number(body?.windowBeforeMin)) ? Number(body.windowBeforeMin) : 5;
    const windowAfterMin  = Number.isFinite(Number(body?.windowAfterMin))  ? Number(body.windowAfterMin)  : 15;

    const startTime = pressedAtMs - windowBeforeMin * 60 * 1000;
    const endTime   = pressedAtMs + windowAfterMin  * 60 * 1000;

    // Bybit V5 deposit records endpoint (asset)
    // نستخدم startTime/endTime/coin لتقليل النتائج (بدل سحب كل التاريخ)
    const params = new URLSearchParams();
    params.set("startTime", String(startTime));
    params.set("endTime", String(endTime));
    params.set("coin", coin);
    params.set("limit", "50");

    const queryString = params.toString();
    const timestamp = String(Date.now());

    // توقيع Bybit V5: timestamp + apiKey + recvWindow + queryString (GET) :contentReference[oaicite:2]{index=2}
    const preSign = timestamp + apiKey + RECV_WINDOW + queryString;
    const sign = hmacSha256Hex(apiSecret, preSign);

    const url = `${BYBIT_BASE_URL}/v5/asset/deposit/query-record?${queryString}`;

    const r = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-SIGN": sign,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": RECV_WINDOW,
        "Content-Type": "application/json",
      },
    });

    const data = await r.json();

    if (!r.ok) {
      return bad(res, "Bybit API HTTP error", { status: r.status, bybit: data });
    }
    if (data?.retCode !== 0) {
      return bad(res, "Bybit API returned error", { bybit: data });
    }

    const rows = data?.result?.rows || [];

    // فلترة: عملة + مبلغ ضمن ±tolerance + (اختياري) شبكة
    const minAmt = expectedAmount - tolerance;
    const maxAmt = expectedAmount + tolerance;

    const normalize = (s) => (s || "").toString().trim().toUpperCase();

    const matched = rows.find((tx) => {
      const txCoin = normalize(tx?.coin);
      const amt = Number(tx?.amount);
      if (txCoin !== coin) return false;
      if (!Number.isFinite(amt)) return false;
      if (amt < minAmt || amt > maxAmt) return false;

      // لو أرسلت chain من الواجهة، نحاول مطابقتها بشكل مرن
      if (chain) {
        const txChain = normalize(tx?.chain || tx?.chainType || "");
        const want = normalize(chain);

        // مطابقة مرنة (contains) لأن أسماء الشبكات تختلف أحيانًا بين واجهتك وBybit
        if (!txChain.includes(want) && !want.includes(txChain)) return false;
      }

      // حالة الإيداع: نعتبره “وصل” إذا يوجد وقت نجاح أو status يدل مكتمل
      // بعض ردود Bybit تحتوي successAt أو status
      const successAt = tx?.successAt;
      const status = String(tx?.status ?? "");

      const hasSuccessTime = successAt !== undefined && successAt !== null && String(successAt).length > 0;
      const looksCompleted = status === "3" || status.toLowerCase() === "success" || status.toLowerCase() === "completed";

      return hasSuccessTime || looksCompleted;
    });

    return ok(res, {
      ok: true,
      found: Boolean(matched),
      match: matched || null,
      window: {
        startTime,
        endTime,
        expectedAmount,
        tolerance,
        coin,
        chain: chain || null,
      },
    });
  } catch (e) {
    return bad(res, "Server error", { details: String(e?.message || e) });
  }
}
