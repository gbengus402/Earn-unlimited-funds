import express from "express";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 10000;

const publicFolder = path.join(__dirname, "..", "public");

// ======================================================
// PRODUCTS
// ======================================================

const PRODUCTS = {
  "how-to-pass-high-in-exams": {
    id: "how-to-pass-high-in-exams",
    name: "How to Pass High in Exams",
    description:
      "A practical guide designed to help students prepare better, study effectively, manage examination pressure and improve their academic performance.",
    priceNaira: 25000,
    amountKobo: 2500000,
    fileKey: "how-to-pass-high-in-exams.pdf",
    downloadName: "How-to-Pass-High-in-Exams.pdf",
    contentType: "application/pdf"
  },

  "ai-response-complete-guide": {
    id: "ai-response-complete-guide",
    name: "AI Response Complete Guide",
    description:
      "A practical guide to using AI effectively for better responses, ideas, productivity, communication and online work.",
    priceNaira: 40000,
    amountKobo: 4000000,
    fileKey: "AI_Response_Complete_Guide-3.pdf",
    downloadName: "AI-Response-Complete-Guide.pdf",
    contentType: "application/pdf"
  },

  "facebook-automation": {
    id: "facebook-automation",
    name: "Facebook Automation",
    description:
      "Learn practical Facebook automation strategies that can help you manage your online presence, respond to customers and improve your digital marketing workflow.",
    priceNaira: 60000,
    amountKobo: 6000000,
    fileKey: "Facebook_Automation_Ebook_GBENGA-1.pdf",
    downloadName: "Facebook-Automation.pdf",
    contentType: "application/pdf"
  },

  "save-a-billion-from-zero-account": {
    id: "save-a-billion-from-zero-account",
    name: "How to Save a Billion from a Zero Account",
    description:
      "A practical financial guide focused on building better money habits, saving strategies, planning and long-term financial growth.",
    priceNaira: 80000,
    amountKobo: 8000000,
    fileKey: "How_to_Save_a_Billion_from_a_Zero_Account-1.pdf",
    downloadName: "How-to-Save-a-Billion-from-a-Zero-Account.pdf",
    contentType: "application/pdf"
  },

  "pregnancy-care": {
    id: "pregnancy-care",
    name: "Pregnancy Care Guide",
    description:
      "A practical pregnancy care guide covering useful information, preparation, healthy routines and important considerations during pregnancy.",
    priceNaira: 150000,
    amountKobo: 15000000,
    fileKey: "Pregnancy_Care_Guide_Ebook-1.docx",
    downloadName: "Pregnancy-Care-Guide.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },

  "sell-faster": {
    id: "sell-faster",
    name: "Sell Faster Professional Ebook",
    description:
      "A practical guide for improving your selling approach, attracting potential customers, presenting offers and increasing your chances of making sales.",
    priceNaira: 150200,
    amountKobo: 15020000,
    fileKey: "Sell_Faster_Professional_Ebook-2.pdf",
    downloadName: "Sell-Faster-Professional-Ebook.pdf",
    contentType: "application/pdf"
  }
};

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(publicFolder));

// ======================================================
// POSTGRESQL
// ======================================================

if (!process.env.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL is not set.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

// ======================================================
// CLOUDFLARE R2
// ======================================================

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;

let r2Client = null;

if (
  r2AccountId &&
  r2AccessKeyId &&
  r2SecretAccessKey &&
  r2BucketName
) {
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey
    }
  });
} else {
  console.warn("WARNING: Cloudflare R2 environment variables are incomplete.");
}

// ======================================================
// DATABASE SETUP
// ======================================================

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      product_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_reference
    ON payments(reference)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_email
    ON payments(email)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS downloads (
      id SERIAL PRIMARY KEY,
      token_hash TEXT UNIQUE NOT NULL,
      payment_reference TEXT NOT NULL,
      product_id TEXT NOT NULL,
      email TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_downloads_token_hash
    ON downloads(token_hash)
  `);

  console.log("PostgreSQL database initialized.");
}

// ======================================================
// GET ALL PRODUCTS
// ======================================================

app.get("/api/products", (req, res) => {
  const products = Object.values(PRODUCTS).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    priceNaira: product.priceNaira,
    amountKobo: product.amountKobo
  }));

  res.json({
    success: true,
    products
  });
});

// ======================================================
// GET ONE PRODUCT
// ======================================================

app.get("/api/products/:id", (req, res) => {
  const product = PRODUCTS[req.params.id];

  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found."
    });
  }

  res.json({
    success: true,
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      priceNaira: product.priceNaira,
      amountKobo: product.amountKobo
    }
  });
});

// ======================================================
// START PAYSTACK PAYMENT
// ======================================================

app.post("/api/pay", async (req, res) => {
  try {
    const { email, productId } = req.body;

    if (!email || !productId) {
      return res.status(400).json({
        success: false,
        message: "Email and product are required."
      });
    }

    const product = PRODUCTS[productId];

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found."
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Paystack secret key is not configured."
      });
    }

    const reference =
      `EUF-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim(),
          amount: product.amountKobo,
          currency: "NGN",
          reference,
          callback_url:
            `${process.env.RENDER_EXTERNAL_URL || ""}/payment-callback`,
          metadata: {
            product_id: product.id,
            product_name: product.name
          }
        })
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack initialize error:", paystackData);

      return res.status(500).json({
        success: false,
        message:
          paystackData.message || "Unable to initialize payment."
      });
    }

    await pool.query(
      `
      INSERT INTO payments
      (reference, email, product_id, amount, currency, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        reference,
        email.trim(),
        product.id,
        product.amountKobo,
        "NGN",
        "pending"
      ]
    );

    return res.json({
      success: true,
      reference,
      authorization_url: paystackData.data.authorization_url
    });
  } catch (error) {
    console.error("Payment initialization error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment initialization failed."
    });
  }
});

// ======================================================
// PAYSTACK PAYMENT CALLBACK
// ======================================================

app.get("/payment-callback", async (req, res) => {
  try {
    const reference = req.query.reference;

    if (!reference) {
      return res.status(400).send("Missing payment reference.");
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).send("Paystack secret key is not configured.");
    }

    // Find our payment record
    const paymentResult = await pool.query(
      `
      SELECT *
      FROM payments
      WHERE reference = $1
      LIMIT 1
      `,
      [reference]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).send("Payment record not found.");
    }

    const payment = paymentResult.rows[0];

    // Verify transaction directly with Paystack
    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const verifyData = await verifyResponse.json();

    if (!verifyResponse.ok || !verifyData.status) {
      console.error("Paystack verification error:", verifyData);

      return res.status(400).send("Payment verification failed.");
    }

    const transaction = verifyData.data;

    // Check payment status
    if (transaction.status !== "success") {
      return res.status(400).send(
        `Payment was not successful. Current status: ${transaction.status}`
      );
    }

    // Check amount
    if (Number(transaction.amount) !== Number(payment.amount)) {
      console.error("Payment amount mismatch.", {
        expected: payment.amount,
        received: transaction.amount
      });

      return res.status(400).send("Payment amount verification failed.");
    }

    // Check currency
    if (transaction.currency !== payment.currency) {
      return res.status(400).send("Payment currency verification failed.");
    }

    const product = PRODUCTS[payment.product_id];

    if (!product) {
      return res.status(404).send("Product no longer exists.");
    }

    // Mark payment successful
    await pool.query(
      `
      UPDATE payments
      SET status = 'successful',
          updated_at = NOW()
      WHERE reference = $1
      `,
      [reference]
    );

    // Generate one-time download token
    const rawToken = crypto.randomBytes(48).toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Token expires after 24 hours
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );

    await pool.query(
      `
      INSERT INTO downloads
      (
        token_hash,
        payment_reference,
        product_id,
        email,
        used,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        tokenHash,
        reference,
        product.id,
        payment.email,
        0,
        expiresAt
      ]
    );

    // Store token securely in HttpOnly cookie
    res.cookie("download_token", rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    });

    // Send customer to success page
    return res.redirect("/payment-success.html");
  } catch (error) {
    console.error("Payment callback error:", error);

    return res.status(500).send(
      "Something went wrong while verifying your payment."
    );
  }
});

// ======================================================
// SECURE ONE-TIME DOWNLOAD
// ======================================================

app.get("/api/download", async (req, res) => {
  try {
    const rawToken = req.headers.cookie
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("download_token="))
      ?.split("=")
      .slice(1)
      .join("=");

    if (!rawToken) {
      return res.status(403).send(
        "Download access denied. Complete your purchase."
      );
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Find token
    const downloadResult = await pool.query(
      `
      SELECT *
      FROM downloads
      WHERE token_hash = $1
      LIMIT 1
      `,
      [tokenHash]
    );

    if (downloadResult.rows.length === 0) {
      return res.status(403).send(
        "Download access denied. Complete your purchase."
      );
    }

    const download = downloadResult.rows[0];

    // Check if already used
    if (download.used === 1) {
      return res.status(403).send(
        "This download link has already been used."
      );
    }

    // Check expiration
    if (new Date(download.expires_at) <= new Date()) {
      return res.status(403).send(
        "This download link has expired."
      );
    }

    const product = PRODUCTS[download.product_id];

    if (!product) {
      return res.status(404).send("Product not found.");
    }

    if (!r2Client) {
      return res.status(500).send(
        "Cloudflare R2 is not configured correctly."
      );
    }

    // Get file from Cloudflare R2
    const r2Response = await r2Client.send(
      new GetObjectCommand({
        Bucket: r2BucketName,
        Key: product.fileKey
      })
    );

    if (!r2Response.Body) {
      return res.status(404).send(
        "Product file could not be found."
      );
    }

    // Atomically mark token as used.
    // Only the first successful request can use it.
    const usedResult = await pool.query(
      `
      UPDATE downloads
      SET used = 1
      WHERE token_hash = $1
        AND used = 0
        AND expires_at > NOW()
      RETURNING id
      `,
      [tokenHash]
    );

    if (usedResult.rows.length === 0) {
      return res.status(403).send(
        "This download link has already been used or has expired."
      );
    }

    // Remove cookie after successful token claim
    res.setHeader(
      "Set-Cookie",
      "download_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"
    );

    // Correct file type
    res.setHeader(
      "Content-Type",
      product.contentType
    );

    // Correct filename
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${product.downloadName}"`
    );

    if (r2Response.ContentLength) {
      res.setHeader(
        "Content-Length",
        String(r2Response.ContentLength)
      );
    }

    // Stream file directly from Cloudflare R2
    r2Response.Body.pipe(res);
  } catch (error) {
    console.error("Download error:", error);

    if (error.name === "NoSuchKey") {
      return res.status(404).send(
        "The product file was not found in Cloudflare R2."
      );
    }

    return res.status(500).send(
      "Unable to download the product right now."
    );
  }
});

// ======================================================
// HOME PAGE
// ======================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(publicFolder, "hex.html"));
});

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Earn Unlimited Funds server is running"
  });
});

// ======================================================
// START SERVER
// ======================================================

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Earn Unlimited Funds server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
