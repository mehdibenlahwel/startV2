const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { plan } = req.body || {};

    // 1) ضع أسعارك هنا (بالسنت)
    const PRICES = {
      basic: 250,     // مثال: $99.00
      advanced: 600, // مثال: $199.00
      golden: 800,   // مثال: $299.00
    };

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({ error: "Plan غير صحيح" });
    }

    // 2) أنشئ PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PRICES[plan],
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { plan },
    });

    return res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
