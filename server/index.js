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

const SITE_URL =
  process.env.RENDER_EXTERNAL_URL ||
  "https://earn-unlimited-funds.onrender.com";

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
    contentType: "application/pdf",
    selarUrl: "https://selar.com/5m7y791u94"
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
    contentType: "application/pdf",
    selarUrl: "https://selar.com/376717994x"
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
    contentType: "application/pdf",
    selarUrl: "https://selar.com/9b2t7798i4"
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
    contentType: "application/pdf",
    selarUrl: "https://selar.com/40v70a9277"
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
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    selarUrl: "https://selar.com/327021wa25"
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
    contentType: "application/pdf",
    selarUrl: "https://selar.com/4v623f9qhw"
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
  console.warn(
    "WARNING: Cloudflare R2 environment variables are incomplete."
  );
}

// ======================================================
// DATABASE SETUP
// ======================================================

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing.");
  }

  // ----------------------------------------------------
  // PAYMENTS
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // DOWNLOADS
  // ----------------------------------------------------

  await pool.query(`
    CREATE TABLE IF NOT EXISTS downloads (
      id SERIAL PRIMARY KEY,
      token_hash TEXT UNIQUE NOT NULL,
      reference TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      product_id TEXT NOT NULL,
      email TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE downloads
    ADD COLUMN IF NOT EXISTS reference TEXT
  `);

  await pool.query(`
    ALTER TABLE downloads
    ADD COLUMN IF NOT EXISTS payment_reference TEXT
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_downloads_token_hash
    ON downloads(token_hash)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_downloads_payment_reference
    ON downloads(payment_reference)
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
// START SELAR PAYMENT
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

    if (!product.selarUrl) {
      return res.status(500).json({
        success: false,
        message:
          "Selar payment link has not been configured for this product yet."
      });
    }

    const reference =
      `EUF-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;

    await pool.query(
      `
      INSERT INTO payments
      (
        reference,
        email,
        product_id,
        amount,
        currency,
        status
      )
      VALUES
      ($1, $2, $3, $4, $5, $6)
      `,
      [
        reference,
        email.trim(),
        product.id,
        product.priceNaira,
        "NGN",
        "pending"
      ]
    );

    return res.json({
      success: true,
      reference,
      productId: product.id,
      checkout_url: product.selarUrl,
      return_url:
        `${SITE_URL}/payment-success.html?product=${encodeURIComponent(
          product.id
        )}&reference=${encodeURIComponent(reference)}`
    });

  } catch (error) {
    console.error(
      "Selar payment initialization error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to start payment."
    });
  }
});

// ======================================================
// SELAR WEBHOOK
// ======================================================
//
// IMPORTANT:
// This endpoint receives the sale notification from Selar.
//
// Do NOT put your Selar API key in this route.
//
// We first receive and record the actual Selar sale.
// We do not trust the customer's browser redirect as
// proof of payment.
//
// ======================================================

app.post("/api/selar/webhook", async (req, res) => {
  try {
    console.log("==========================================");
    console.log("SELAR WEBHOOK RECEIVED");
    console.log("==========================================");

    const payload = req.body || {};

    // TEMPORARY TEST LOGGING
    // Keep this until we confirm the exact Selar payload.
    console.log(
      JSON.stringify(payload, null, 2)
    );

    // --------------------------------------------------
    // Extract possible data containers
    // --------------------------------------------------

    const sale =
      payload.data ||
      payload.sale ||
      payload.transaction ||
      payload.payment ||
      payload;

    // --------------------------------------------------
    // Event
    // --------------------------------------------------

    const event =
      payload.event ||
      payload.type ||
      payload.action ||
      payload.name ||
      "";

    // --------------------------------------------------
    // Customer
    // --------------------------------------------------

    const customer =
      sale.customer ||
      payload.customer ||
      {};

    const email =
      sale.email ||
      sale.customer_email ||
      sale.customerEmail ||
      customer.email ||
      payload.email ||
      "";

    // --------------------------------------------------
    // Product
    // --------------------------------------------------

    const rawProduct =
      sale.product ||
      sale.item ||
      payload.product ||
      {};

    const selarProductId =
      typeof rawProduct === "object"
        ? (
            rawProduct.id ||
            rawProduct.slug ||
            rawProduct.product_id ||
            rawProduct.productId ||
            ""
          )
        : rawProduct;

    const productName =
      typeof rawProduct === "object"
        ? (
            rawProduct.name ||
            rawProduct.title ||
            ""
          )
        : "";

    // --------------------------------------------------
    // Amount
    // --------------------------------------------------

    const rawAmount =
      sale.amount ||
      sale.total ||
      sale.price ||
      payload.amount ||
      0;

    const amount =
      Number(rawAmount) || 0;

    // --------------------------------------------------
    // Currency
    // --------------------------------------------------

    const currency =
      sale.currency ||
      payload.currency ||
      "NGN";

    // --------------------------------------------------
    // Payment status
    // --------------------------------------------------

    const status =
      sale.status ||
      sale.payment_status ||
      sale.paymentStatus ||
      payload.status ||
      "";

    const normalizedStatus =
      String(status)
        .toLowerCase()
        .trim();

    // --------------------------------------------------
    // Payment reference
    // --------------------------------------------------

    const selarReference =
      sale.payment_reference ||
      sale.paymentReference ||
      sale.transaction_reference ||
      sale.transactionReference ||
      sale.reference ||
      sale.transaction_id ||
      sale.transactionId ||
      sale.id ||
      payload.payment_reference ||
      payload.reference ||
      payload.transaction_id ||
      "";

    console.log("SELAR EVENT:", event);
    console.log("SELAR EMAIL:", email);
    console.log("SELAR PRODUCT ID:", selarProductId);
    console.log("SELAR PRODUCT NAME:", productName);
    console.log("SELAR AMOUNT:", amount);
    console.log("SELAR CURRENCY:", currency);
    console.log("SELAR STATUS:", normalizedStatus);
    console.log(
      "SELAR REFERENCE:",
      selarReference
    );

    // --------------------------------------------------
    // Basic validation
    // --------------------------------------------------

    if (!email) {
      console.log(
        "Webhook rejected: customer email missing."
      );

      return res.status(400).json({
        success: false,
        message: "Customer email is missing."
      });
    }

    if (!selarReference) {
      console.log(
        "Webhook rejected: payment reference missing."
      );

      return res.status(400).json({
        success: false,
        message: "Payment reference is missing."
      });
    }

    // --------------------------------------------------
    // IMPORTANT:
    // Resolve the product.
    //
    // First try our own payment reference.
    // This is important because /api/pay creates:
    //
    // EUF-xxxxx-xxxxx
    //
    // If Selar returns that reference, we can directly
    // identify the product.
    // --------------------------------------------------

    let localPayment = null;

    const localPaymentResult =
      await pool.query(
        `
        SELECT *
        FROM payments
        WHERE reference = $1
        LIMIT 1
        `,
        [selarReference]
      );

    if (localPaymentResult.rows.length > 0) {
      localPayment =
        localPaymentResult.rows[0];
    }

    // --------------------------------------------------
    // Resolve product ID
    // --------------------------------------------------

    let productId =
      localPayment?.product_id ||
      "";

    if (!productId) {
      if (
        selarProductId &&
        PRODUCTS[selarProductId]
      ) {
        productId = selarProductId;
      }
    }

    if (!productId && productName) {
      const matchingProduct =
        Object.values(PRODUCTS).find(
          (product) =>
            product.name.toLowerCase() ===
            String(productName)
              .toLowerCase()
              .trim()
        );

      if (matchingProduct) {
        productId =
          matchingProduct.id;
      }
    }

    if (!productId) {
      console.log(
        "Could not match Selar product to local product."
      );

      // Return 200 so Selar does not repeatedly resend
      // the same event while we investigate the payload.
      return res.status(200).json({
        success: true,
        message:
          "Sale received but product mapping requires review."
      });
    }

    const product =
      PRODUCTS[productId];

    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Product does not exist locally."
      });
    }

    // --------------------------------------------------
    // Successful payment detection
    // --------------------------------------------------

    const successfulStatuses = [
      "paid",
      "success",
      "successful",
      "completed",
      "complete",
      "confirmed"
    ];

    const successful =
      successfulStatuses.includes(
        normalizedStatus
      );

    // If Selar sends an explicit sale event without
    // a status field, keep the event visible for testing
    // but DO NOT automatically grant access yet.
    if (!successful) {
      console.log(
        "Payment is not explicitly marked successful."
      );

      return res.status(200).json({
        success: true,
        message:
          "Webhook received; payment not marked successful.",
        status: normalizedStatus
      });
    }

    // --------------------------------------------------
    // Find the local payment record
    // --------------------------------------------------

    if (!localPayment) {
      console.log(
        "No local payment record found for Selar reference:",
        selarReference
      );

      return res.status(200).json({
        success: true,
        message:
          "Successful Selar sale received but no local payment record was found."
      });
    }

    // --------------------------------------------------
    // Validate customer email
    // --------------------------------------------------

    if (
      String(localPayment.email)
        .trim()
        .toLowerCase() !==
      String(email)
        .trim()
        .toLowerCase()
    ) {
      console.log(
        "Email mismatch between local payment and Selar sale."
      );

      return res.status(400).json({
        success: false,
        message:
          "Payment customer does not match local payment."
      });
    }

    // --------------------------------------------------
    // Validate product
    // --------------------------------------------------

    if (
      localPayment.product_id !==
      product.id
    ) {
      console.log(
        "Product mismatch between local payment and Selar sale."
      );

      return res.status(400).json({
        success: false,
        message:
          "Purchased product does not match local payment."
      });
    }

    // --------------------------------------------------
    // Validate amount where available
    // --------------------------------------------------

    if (
      amount > 0 &&
      amount !== product.priceNaira &&
      amount !== product.amountKobo
    ) {
      console.log(
        "Amount mismatch:",
        amount,
        "expected:",
        product.priceNaira,
        "or:",
        product.amountKobo
      );

      return res.status(400).json({
        success: false,
        message:
          "Payment amount does not match product price."
      });
    }

    // --------------------------------------------------
    // Mark payment as paid
    // --------------------------------------------------

    await pool.query(
      `
      UPDATE payments
      SET
        status = 'paid',
        updated_at = NOW()
      WHERE reference = $1
      `,
      [localPayment.reference]
    );

    console.log(
      "PAYMENT MARKED PAID:",
      localPayment.reference
    );

    // --------------------------------------------------
    // Prevent duplicate download tokens
    // --------------------------------------------------

    const existingDownload =
      await pool.query(
        `
        SELECT
          id,
          token_hash,
          expires_at,
          used
        FROM downloads
        WHERE payment_reference = $1
        LIMIT 1
        `,
        [localPayment.reference]
      );

    if (
      existingDownload.rows.length > 0
    ) {
      console.log(
        "Download token already exists for payment:",
        localPayment.reference
      );

      return res.status(200).json({
        success: true,
        message:
          "Payment already processed and download already created."
      });
    }

    // --------------------------------------------------
    // Create secure download token
    // --------------------------------------------------

    const rawToken =
      crypto.randomBytes(32).toString("hex");

    const tokenHash =
      crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    const now = Date.now();

    // 24-hour download token
    const expiresAt =
      now + 24 * 60 * 60 * 1000;

    await pool.query(
      `
      INSERT INTO downloads
      (
        token_hash,
        reference,
        payment_reference,
        product_id,
        email,
        used,
        expires_at,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8
      )
      `,
      [
        tokenHash,
        localPayment.reference,
        localPayment.reference,
        product.id,
        localPayment.email,
        0,
        expiresAt,
        now
      ]
    );

    console.log(
      "SECURE DOWNLOAD CREATED:",
      localPayment.reference
    );

    // --------------------------------------------------
    // Create customer download URL
    // --------------------------------------------------

    const downloadUrl =
      `${SITE_URL}/api/download?token=${encodeURIComponent(
        rawToken
      )}`;

    console.log(
      "DOWNLOAD URL:",
      downloadUrl
    );

    // --------------------------------------------------
    // Return success
    // --------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Selar payment processed successfully.",
      reference:
        localPayment.reference,
      product_id:
        product.id,
      download_url:
        downloadUrl
    });

  } catch (error) {
    console.error(
      "SELAR WEBHOOK ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Selar webhook processing failed."
    });
  }
});

// ======================================================
// PAYMENT SUCCESS PAGE
// ======================================================

app.get("/payment-success.html", (req, res) => {
  res.sendFile(
    path.join(
      publicFolder,
      "payment-success.html"
    )
  );
});

// ======================================================
// PURCHASE STATUS
// ======================================================

app.get("/api/purchase-status", async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message:
          "Payment reference is required."
      });
    }

    const result =
      await pool.query(
        `
        SELECT
          reference,
          email,
          product_id,
          amount,
          currency,
          status
        FROM payments
        WHERE reference = $1
        LIMIT 1
        `,
        [reference]
      );

    if (
      result.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Payment record not found."
      });
    }

    return res.json({
      success: true,
      payment:
        result.rows[0]
    });

  } catch (error) {
    console.error(
      "Purchase status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to check purchase status."
    });
  }
});

// ======================================================
// R2 DOWNLOAD TEST V2
// TEMPORARY - REMOVE AFTER TESTING
// ======================================================

app.get("/api/test-download-v2", async (req, res) => {
  try {
    const productId =
      "how-to-pass-high-in-exams";

    const product =
      PRODUCTS[productId];

    if (!product) {
      return res.status(404).send(
        "Product not found."
      );
    }

    if (!r2Client) {
      return res.status(500).send(
        "Cloudflare R2 is not configured correctly."
      );
    }

    if (!r2BucketName) {
      return res.status(500).send(
        "R2_BUCKET_NAME is missing."
      );
    }

    const rawToken =
      crypto.randomBytes(32).toString("hex");

    const tokenHash =
      crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    const now =
      Date.now();

    const expiresAt =
      now + 10 * 60 * 1000;

    const testReference =
      `TEST-V2-${now}`;

    await pool.query(
      `
      INSERT INTO downloads
      (
        token_hash,
        reference,
        payment_reference,
        product_id,
        email,
        used,
        expires_at,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8
      )
      `,
      [
        tokenHash,
        testReference,
        testReference,
        productId,
        "test@example.com",
        0,
        expiresAt,
        now
      ]
    );

    console.log(
      "R2 TEST V2 CREATED:",
      testReference
    );

    res.setHeader(
      "Set-Cookie",
      `download_token=${rawToken}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax`
    );

    return res.redirect(
      "/api/download"
    );

  } catch (error) {
    console.error(
      "R2 TEST V2 ERROR:",
      error
    );

    return res.status(500).send(
      "R2 TEST V2 failed: " +
      error.message
    );
  }
});

// ======================================================
// SECURE DOWNLOAD
// ======================================================

app.get("/api/download", async (req, res) => {
  try {

    // --------------------------------------------------
    // Support BOTH:
    //
    // 1. HttpOnly cookie
    // 2. One-time ?token=... URL
    //
    // This allows the Selar webhook to generate a
    // download URL.
    // --------------------------------------------------

    let rawToken =
      req.query.token || null;

    if (!rawToken) {
      rawToken =
        req.headers.cookie
          ?.split(";")
          .map((item) =>
            item.trim()
          )
          .find((item) =>
            item.startsWith(
              "download_token="
            )
          )
          ?.split("=")
          .slice(1)
          .join("=");
    }

    if (!rawToken) {
      return res.status(403).send(
        "Download access denied. Complete your purchase."
      );
    }

    const tokenHash =
      crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

    const downloadResult =
      await pool.query(
        `
        SELECT *
        FROM downloads
        WHERE token_hash = $1
        LIMIT 1
        `,
        [tokenHash]
      );

    if (
      downloadResult.rows.length === 0
    ) {
      return res.status(403).send(
        "Download access denied. Complete your purchase."
      );
    }

    const download =
      downloadResult.rows[0];

    if (
      Number(download.expires_at) <=
      Date.now()
    ) {
      return res.status(403).send(
        "This download link has expired."
      );
    }

    if (
      Number(download.used) === 1
    ) {
      return res.status(403).send(
        "This download link has already been used."
      );
    }

    const product =
      PRODUCTS[download.product_id];

    if (!product) {
      return res.status(404).send(
        "Product not found."
      );
    }

    if (!r2Client) {
      return res.status(500).send(
        "Cloudflare R2 is not configured correctly."
      );
    }

    const r2Response =
      await r2Client.send(
        new GetObjectCommand({
          Bucket:
            r2BucketName,
          Key:
            product.fileKey
        })
      );

    if (!r2Response.Body) {
      return res.status(404).send(
        "Product file could not be found."
      );
    }

    const usedResult =
      await pool.query(
        `
        UPDATE downloads
        SET used = 1
        WHERE token_hash = $1
          AND used = 0
          AND expires_at > $2
        RETURNING id
        `,
        [
          tokenHash,
          Date.now()
        ]
      );

    if (
      usedResult.rows.length === 0
    ) {
      return res.status(403).send(
        "This download link has already been used or has expired."
      );
    }

    res.setHeader(
      "Set-Cookie",
      "download_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"
    );

    res.setHeader(
      "Content-Type",
      product.contentType
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${product.downloadName}"`
    );

    if (
      r2Response.ContentLength
    ) {
      res.setHeader(
        "Content-Length",
        String(
          r2Response.ContentLength
        )
      );
    }

    r2Response.Body.pipe(res);

  } catch (error) {

    console.error(
      "Download error:",
      error
    );

    if (
      error.name === "NoSuchKey" ||
      error.Code === "NoSuchKey"
    ) {
      return res.status(404).send(
        "The product file was not found in Cloudflare R2."
      );
    }

    return res.status(500).send(
      "Unable to download the product right now: " +
      error.message
    );
  }
});

// ======================================================
// HOME PAGE
// ======================================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      publicFolder,
      "hex.html"
    )
  );
});

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message:
      "Earn Unlimited Funds server is running"
  });
});

// ======================================================
// START SERVER
// ======================================================

async function startServer() {
  try {

    await initializeDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `Earn Unlimited Funds server running on port ${PORT}`
        );
      }
    );

  } catch (error) {

    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);
  }
}

startServer();
