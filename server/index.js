import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

const publicFolder = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicFolder));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicFolder, "index.html"));
});

// Paystack payment initialization
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
            "https://earn-unlimited-funds.onrender.com/payment-success.html"
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        message: data.message || "Unable to initialize payment."
      });
    }

    res.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference
    });

  } catch (error) {
    console.error("Paystack error:", error);

    res.status(500).json({
      message: "Payment service is temporarily unavailable."
    });
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
