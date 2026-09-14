import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

const publicFolder = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicFolder));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicFolder, "index.html"));
});

// Initialize Paystack payment
app.post("/api/pay", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email address is required."
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        message: "Paystack secret key is not configured."
      });
    }

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email,
          amount: 2500000,
          currency: "NGN",
          callback_url:
            "https://earn-unlimited-funds.onrender.com/payment-callback"
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status || !data.data) {
      return res.status(400).json({
        message: data.message || "Unable to initialize payment."
      });
    }

    res.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference
    });

  } catch (error) {
    console.error("Paystack initialization error:", error);

    res.status(500).json({
      message: "Payment service is temporarily unavailable."
    });
  }
});

// Paystack payment callback and verification
app.get("/payment-callback", async (req, res) => {
  try {
    // Paystack normally returns the reference as ?reference=...
    const reference =
      req.query.reference ||
      req.query.trxref ||
      req.body?.reference ||
      req.body?.trxref;

    console.log("Paystack callback received:", req.query);

    if (!reference) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Reference Missing</title>
        </head>
        <body style="font-family:Arial;text-align:center;padding:50px;">
          <h1>Payment reference is missing</h1>
          <p>We could not receive the payment reference from Paystack.</p>
          <p>Please contact support if money was deducted from your account.</p>
        </body>
        </html>
      `);
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).send("Payment verification is not configured.");
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    console.log("Paystack verification response:", data);

    if (
      !response.ok ||
      !data.status ||
      !data.data ||
      data.data.status !== "success" ||
      Number(data.data.amount) !== 2500000 ||
      data.data.currency !== "NGN"
    ) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Verification Failed</title>
        </head>
        <body style="font-family:Arial;text-align:center;padding:50px;">
          <h1>Payment could not be verified</h1>
          <p>Please contact support if money was deducted from your account.</p>
        </body>
        </html>
      `);
    }

    // Payment has been successfully verified by Paystack
    res.redirect(
      `/payment-success.html?reference=${encodeURIComponent(reference)}`
    );

  } catch (error) {
    console.error("Paystack verification error:", error);

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Verification Error</title>
      </head>
      <body style="font-family:Arial;text-align:center;padding:50px;">
        <h1>Payment verification failed</h1>
        <p>Please contact support.</p>
      </body>
      </html>
    `);
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Earn Unlimited Funds server is running"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
  
