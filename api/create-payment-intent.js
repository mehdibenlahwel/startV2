const Stripe = require("stripe");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) تحقق من وجود المفتاح السري
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({
        error: "STRIPE_SECRET_KEY غير موجود في Environment Variables على Vercel (تأكد من Preview و Production).",
      });
    }

    const stripe = new Stripe(secretKey);

    // 2) اقرأ body بشكل آمن (قد يكون object أو string)
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const plan = body.plan;

    // 3) أسعار الباقات (بالسنت) — عدّلها حسب مشروعك
    const PRICES = {
      basic: 9900,
      advanced: 19900,
      golden: 29900,
    };

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({
        error: "Plan غير صحيح. يجب أن يكون: basic أو advanced أو golden",
        receivedPlan: plan,
      });
    }

    // 4) أنشئ PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PRICES[plan],
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { plan },
    });

    return res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    // رجّع تفاصيل واضحة بدل FUNCTION_INVOCATION_FAILED الغامض
    return res.status(500).json({
      error: err.message || "Server error",
      type: err.type,
      code: err.code,
    });
  }
};
