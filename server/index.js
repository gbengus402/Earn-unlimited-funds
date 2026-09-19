import express from "express";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import {
  S3Client,
  GetObjectCommand
} from "@aws-sdk/client-s3";

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

const SITE_URL =
  process.env.RENDER_EXTERNAL_URL ||
  "https://earn-unlimited-funds.onrender.com";

// ======================================================
// EXPRESS SETUP
// ======================================================

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const publicFolder = path.join(__dirname, "..", "public");

app.use(express.static(publicFolder));

// ======================================================
// POSTGRESQL
// ======================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ======================================================
// CLOUDFLARE R2
// ======================================================

const r2Configured =
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME;

let r2 = null;

if (r2Configured) {
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
}

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
    r2Key: "how-to-pass-high-in-exams.pdf",
    downloadName: "How-to-Pass-High-in-Exams.pdf",
    contentType: "application/pdf",
    selarUrl: "https://selar.com/5m7y791u94"
  },

  "ai-response-complete-guide": {
    id: "ai-response-complete-guide",
    name: "AI Response Complete Guide",
    description:
      "A practical guide to using AI effectively for better responses, ideas, productivity, communication and results.",
    priceNaira: 40000,
    amountKobo: 4000000,
    r2Key: "AI_Response_Complete_Guide-3.pdf",
    downloadName: "AI-Response-Complete-Guide.pdf",
    contentType: "application/pdf",
    selarUrl: "https://selar.com/376717994x"
  },

  "facebook-automation": {
    id: "facebook-automation",
    name: "Facebook Automation",
    description:
      "Learn practical Facebook automation strategies for marketing, content management, audience growth and business promotion.",
    priceNaira: 60000,
    amountKobo: 6000000,
    r2Key: "Facebook_Automation_Ebook_GBENGA-1.pdf",
    downloadName: "Facebook-Automation-Ebook.pdf",
    contentType: "application/pdf",
    selarUrl: "https://selar.com/9b2t7798i4"
  },

  "save-a-billion-from-zero-account": {
    id: "save-a-billion-from-zero-account",
    name: "How to Save a Billion from a Zero Account",
    description:
      "A practical financial guide focused on saving, discipline, money management and building long-term financial habits.",
    priceNaira: 80000,
    amountKobo: 8000000,
    r2Key: "How_to_Save_a_Billion_from_a_Zero_Account-1.pdf",
    downloadName: "How-to-Save-a-Billion-from-a-Zero-Account.pdf",
    contentType: "application/pdf",
    selarUrl: "https://selar.com/40v70a9277"
  },

  "pregnancy-care": {
    id: "pregnancy-care",
    name: "Pregnancy Care Guide",
    description:
      "A general pregnancy care guide covering important information and practical considerations throughout pregnancy.",
    priceNaira: 150000,
    amountKobo: 15000000,
    r2Key: "Pregnancy_Care_Guide_Ebook-1.docx",
    downloadName: "Pregnancy-Care-Guide.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    selarUrl: "https://selar.com/327021wa25"
  },

  "sell-faster": {
    id: "sell-faster",
    name: "Sell Faster Professional Ebook",
    description:
      "A practical professional guide to improving sales, attracting customers and increasing business results.",
    priceNaira: 150200,
    amountKobo: 15020000,
    r2Key: "Sell_Faster_Professional_Ebook-2.pdf",
    downloadName: "Sell-Faster-Professional-Ebook.pdf",
    contentType: "application/pdf",
    selarUrl: "https://selar.com/4v623f9qhw"
  }
};

// ======================================================
// DATABASE INITIALIZATION
// ======================================================

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        reference TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        product_id TEXT NOT NULL,
        amount NUMERIC DEFAULT 0,
        currency TEXT DEFAULT 'NGN',
        status TEXT DEFAULT 'PENDING',
        created_at BIGINT,
        updated_at BIGINT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS downloads (
        id SERIAL PRIMARY KEY,
        token_hash TEXT UNIQUE NOT NULL,
        reference TEXT,
        payment_reference TEXT,
        product_id TEXT NOT NULL,
        email TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        expires_at BIGINT,
        created_at BIGINT
      )
    `);

    // --------------------------------------------------
    // Add missing columns if old tables already exist
    // --------------------------------------------------

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS created_at BIGINT
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS updated_at BIGINT
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'NGN'
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING'
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
      ALTER TABLE downloads
      ADD COLUMN IF NOT EXISTS used INTEGER DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE downloads
      ADD COLUMN IF NOT EXISTS expires_at BIGINT
    `);

    await pool.query(`
      ALTER TABLE downloads
      ADD COLUMN IF NOT EXISTS created_at BIGINT
    `);

    console.log("PostgreSQL database initialized.");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

// ======================================================
// HELPER: CREATE DOWNLOAD TOKEN
// ======================================================

async function createDownloadToken({
  paymentReference,
  productId,
  email
}) {
  const rawToken = crypto.randomBytes(32).toString("hex");

  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const now = Date.now();

  // 24 hours
  const expiresAt = now + 24 * 60 * 60 * 1000;

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
      ($1, $2, $3, $4, $5, 0, $6, $7)
    `,
    [
      tokenHash,
      paymentReference,
      paymentReference,
      productId,
      email,
      expiresAt,
      now
    ]
  );

  const downloadUrl =
    `${SITE_URL}/api/download?token=${encodeURIComponent(rawToken)}`;

  return {
    rawToken,
    downloadUrl,
    expiresAt
  };
}

// ======================================================
// API: GET ALL PRODUCTS
// ======================================================

app.get("/api/products", (req, res) => {
  try {
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
  } catch (error) {
    console.error("Products error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load products."
    });
  }
});

// ======================================================
// API: GET SINGLE PRODUCT
// ======================================================

app.get("/api/products/:id", (req, res) => {
  try {
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
  } catch (error) {
    console.error("Single product error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load product."
    });
  }
});

// ======================================================
// API: START PAYMENT
// ======================================================

app.post("/api/pay", async (req, res) => {
  try {
    const {
      email,
      product_id,
      productId
    } = req.body;

    const selectedProductId = product_id || productId;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }

    if (!selectedProductId) {
      return res.status(400).json({
        success: false,
        message: "Product is required."
      });
    }

    const product = PRODUCTS[selectedProductId];

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found."
      });
    }

    const reference =
      `EUF-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const now = Date.now();

    await pool.query(
      `
        INSERT INTO payments
        (
          reference,
          email,
          product_id,
          amount,
          currency,
          status,
          created_at,
          updated_at
        )
        VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        reference,
        String(email).trim().toLowerCase(),
        product.id,
        product.amountKobo,
        "NGN",
        "PENDING",
        now,
        now
      ]
    );

    const returnUrl =
      `${SITE_URL}/payment-success.html?product=${encodeURIComponent(
        product.id
      )}&reference=${encodeURIComponent(reference)}`;

    res.json({
      success: true,
      reference,
      product_id: product.id,
      product_name: product.name,
      checkout_url: product.selarUrl,
      selar_url: product.selarUrl,
      return_url: returnUrl
    });
  } catch (error) {
    console.error("Payment start error:", error);

    res.status(500).json({
      success: false,
      message: "Payment could not be started.",
      error: error.message
    });
  }
});

// ======================================================
// SELAR WEBHOOK
// ======================================================

app.post("/api/selar/webhook", async (req, res) => {
  console.log("");
  console.log("======================================================");
  console.log("SELAR WEBHOOK PROCESSING");
  console.log("======================================================");

  try {
    console.log("Body:", req.body);

    const body = req.body || {};

    const buyerEmail = String(
      body.buyer_email ||
      body.email ||
      body.customer_email ||
      ""
    )
      .trim()
      .toLowerCase();

    const productName = String(
      body.product_names ||
      body.product_name ||
      body.product ||
      ""
    ).trim();

    const productCode = String(
      body.product_codes ||
      body.product_code ||
      ""
    ).trim();

    const amount = Number(body.amount || 0);

    const currency = String(
      body.currency || "NGN"
    ).trim();

    const receiptUrl = String(
      body.receipt_url || ""
    ).trim();

    if (!buyerEmail) {
      console.log("Webhook rejected: buyer email missing.");

      return res.status(400).json({
        success: false,
        message: "buyer_email is required."
      });
    }

    // --------------------------------------------------
    // PRODUCT MATCHING
    // --------------------------------------------------

    let product = null;

    // Temporary Selar Test Mode mapping.
    //
    // Selar's single test transaction uses the product
    // name "Tst". We map it to the exam product only
    // for the one available test transaction.
    if (productName.toLowerCase() === "tst") {
      product = PRODUCTS["how-to-pass-high-in-exams"];

      console.log(
        "TEST MODE: Tst mapped to How to Pass High in Exams."
      );
    }

    // Normal production product matching.
    if (!product) {
      product = Object.values(PRODUCTS).find(
        (item) =>
          item.name.toLowerCase() ===
          productName.toLowerCase()
      );
    }

    if (!product) {
      console.log("Product could not be matched.");
      console.log("Product name:", productName);
      console.log("Product code:", productCode);

      return res.status(400).json({
        success: false,
        message: "Selar product could not be matched.",
        product_name: productName,
        product_code: productCode
      });
    }

    console.log("Matched product:", product.name);

    // --------------------------------------------------
    // FIND EXISTING PAYMENT
    // --------------------------------------------------

    let paymentResult = await pool.query(
      `
        SELECT *
        FROM payments
        WHERE LOWER(email) = LOWER($1)
        AND product_id = $2
        AND status = 'PENDING'
        ORDER BY id DESC
        LIMIT 1
      `,
      [
        buyerEmail,
        product.id
      ]
    );

    let payment;

    if (paymentResult.rows.length > 0) {
      payment = paymentResult.rows[0];

      const now = Date.now();

      await pool.query(
        `
          UPDATE payments
          SET
            status = 'PAID',
            amount = $1,
            currency = $2,
            updated_at = $3
          WHERE reference = $4
        `,
        [
          amount,
          currency,
          now,
          payment.reference
        ]
      );

      console.log(
        "Existing payment marked PAID:",
        payment.reference
      );
    } else {
      // ------------------------------------------------
      // FALLBACK PAYMENT
      // ------------------------------------------------

      const fallbackReference =
        `SELAR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      const now = Date.now();

      await pool.query(
        `
          INSERT INTO payments
          (
            reference,
            email,
            product_id,
            amount,
            currency,
            status,
            created_at,
            updated_at
          )
          VALUES
          ($1, $2, $3, $4, $5, 'PAID', $6, $7)
        `,
        [
          fallbackReference,
          buyerEmail,
          product.id,
          amount,
          currency,
          now,
          now
        ]
      );

      const fallbackResult = await pool.query(
        `
          SELECT *
          FROM payments
          WHERE reference = $1
          LIMIT 1
        `,
        [fallbackReference]
      );

      payment = fallbackResult.rows[0];

      console.log(
        "Created fallback PAID payment:",
        fallbackReference
      );
    }

    // --------------------------------------------------
    // CHECK FOR EXISTING ACTIVE DOWNLOAD
    // --------------------------------------------------

    const activeDownloadResult = await pool.query(
      `
        SELECT *
        FROM downloads
        WHERE payment_reference = $1
        AND used = 0
        AND expires_at > $2
        ORDER BY id DESC
        LIMIT 1
      `,
      [
        payment.reference,
        Date.now()
      ]
    );

    let downloadUrl = null;
    let expiresAt = null;

    if (activeDownloadResult.rows.length > 0) {
      console.log(
        "An active download already exists for this payment."
      );

      // The raw token is intentionally not stored in the database,
      // so an existing raw download URL cannot be reconstructed.
      //
      // A new secure token is therefore created for the webhook
      // response.
    }

    // --------------------------------------------------
    // CREATE SECURE DOWNLOAD
    // --------------------------------------------------

    const download = await createDownloadToken({
      paymentReference: payment.reference,
      productId: product.id,
      email: buyerEmail
    });

    downloadUrl = download.downloadUrl;
    expiresAt = download.expiresAt;

    console.log("");
    console.log("PAYMENT PROCESSED SUCCESSFULLY");
    console.log("Reference:", payment.reference);
    console.log("Product:", product.name);
    console.log("Buyer:", buyerEmail);
    console.log("Download created: YES");
    console.log(
      "Download expires:",
      new Date(expiresAt).toISOString()
    );
    console.log("======================================================");
    console.log("");

    return res.status(200).json({
      success: true,
      message: "Payment processed successfully.",
      reference: payment.reference,
      product_id: product.id,
      product_name: product.name,
      buyer_email: buyerEmail,
      amount,
      currency,
      receipt_url: receiptUrl,
      download_url: downloadUrl,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error("");
    console.error("SELAR WEBHOOK ERROR");
    console.error(error);
    console.error("");

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed.",
      error: error.message
    });
  }
});

// ======================================================
// API: PURCHASE STATUS
// ======================================================

app.get("/api/purchase-status", async (req, res) => {
  try {
    const reference = String(
      req.query.reference || ""
    ).trim();

    const email = String(
      req.query.email || ""
    ).trim()
    .toLowerCase();

    if (!reference && !email) {
      return res.status(400).json({
        success: false,
        message: "Reference or email is required."
      });
    }

    let result;

    if (reference) {
      result = await pool.query(
        `
          SELECT *
          FROM payments
          WHERE reference = $1
          LIMIT 1
        `,
        [reference]
      );
    } else {
      result = await pool.query(
        `
          SELECT *
          FROM payments
          WHERE LOWER(email) = LOWER($1)
          ORDER BY id DESC
          LIMIT 1
        `,
        [email]
      );
    }

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        paid: false,
        message: "Payment not found."
      });
    }

    const payment = result.rows[0];

    const product = PRODUCTS[payment.product_id];

    const downloadResult = await pool.query(
      `
        SELECT *
        FROM downloads
        WHERE payment_reference = $1
        AND used = 0
        AND expires_at > $2
        ORDER BY id DESC
        LIMIT 1
      `,
      [
        payment.reference,
        Date.now()
      ]
    );

    res.json({
      success: true,
      paid: payment.status === "PAID",
      reference: payment.reference,
      email: payment.email,
      product_id: payment.product_id,
      product_name: product
        ? product.name
        : payment.product_id,
      status: payment.status,
      download_available:
        downloadResult.rows.length > 0,
      download_url: null
    });
  } catch (error) {
    console.error(
      "Purchase status error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Unable to check purchase status.",
      error: error.message
    });
  }
});

// ======================================================
// SECURE DOWNLOAD
// ======================================================

app.get("/api/download", async (req, res) => {
  try {
    const token = String(
      req.query.token || ""
    ).trim();

    if (!token) {
      return res.status(400).send(
        "Download token is required."
      );
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const result = await pool.query(
      `
        SELECT *
        FROM downloads
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(404).send(
        "Invalid or expired download link."
      );
    }

    const download = result.rows[0];

    // --------------------------------------------------
    // CHECK USED
    // --------------------------------------------------

    if (Number(download.used) === 1) {
      return res.status(410).send(
        "This download link has already been used."
      );
    }

    // --------------------------------------------------
    // CHECK EXPIRATION
    // --------------------------------------------------

    if (
      download.expires_at &&
      Number(download.expires_at) < Date.now()
    ) {
      return res.status(410).send(
        "This download link has expired."
      );
    }

    const product = PRODUCTS[download.product_id];

    if (!product) {
      return res.status(404).send(
        "Product associated with this download was not found."
      );
    }

    if (!r2Configured || !r2) {
      return res.status(500).send(
        "R2 storage is not configured."
      );
    }

    // --------------------------------------------------
    // GET FILE FROM R2
    // --------------------------------------------------

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: product.r2Key
    });

    const object = await r2.send(command);

    if (!object.Body) {
      return res.status(404).send(
        "File was not found in storage."
      );
    }

    // --------------------------------------------------
    // MARK TOKEN USED
    // --------------------------------------------------

    await pool.query(
      `
        UPDATE downloads
        SET used = 1
        WHERE token_hash = $1
      `,
      [tokenHash]
    );

    // --------------------------------------------------
    // DOWNLOAD HEADERS
    // --------------------------------------------------

    res.setHeader(
      "Content-Type",
      product.contentType
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${product.downloadName}"`
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    // --------------------------------------------------
    // STREAM R2 FILE
    // --------------------------------------------------

    object.Body.pipe(res);
  } catch (error) {
    console.error(
      "Download error:",
      error
    );

    if (!res.headersSent) {
      if (
        error &&
        (
          error.name === "NoSuchKey" ||
          error.$metadata?.httpStatusCode === 404
        )
      ) {
        return res.status(404).send(
          "The requested file was not found."
        );
      }

      return res.status(500).send(
        "Download failed."
      );
    }
  }
});

// ======================================================
// TEMPORARY PRODUCT TESTING
// ======================================================
//
// This route is for testing each product's R2 file and
// secure download without making another Selar test.
//
// REMOVE THIS ROUTE AFTER ALL PRODUCTS ARE VERIFIED.
// ======================================================

app.get(
  "/api/test-product/:productId",
  async (req, res) => {
    try {
      const productId = req.params.productId;

      const product = PRODUCTS[productId];

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
          available_products: Object.keys(PRODUCTS)
        });
      }

      const testEmail =
        "test@earnunlimitedfunds.com";

      const reference =
        `TEST-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      const now = Date.now();

      await pool.query(
        `
          INSERT INTO payments
          (
            reference,
            email,
            product_id,
            amount,
            currency,
            status,
            created_at,
            updated_at
          )
          VALUES
          ($1, $2, $3, $4, $5, 'PAID', $6, $7)
        `,
        [
          reference,
          testEmail,
          product.id,
          product.amountKobo,
          "NGN",
          now,
          now
        ]
      );

      const download =
        await createDownloadToken({
          paymentReference: reference,
          productId: product.id,
          email: testEmail
        });

      console.log("");
      console.log("======================================================");
      console.log("TEMPORARY PRODUCT TEST");
      console.log("Product:", product.name);
      console.log("R2 Key:", product.r2Key);
      console.log("Download:", product.downloadName);
      console.log("Reference:", reference);
      console.log("Download URL:", download.downloadUrl);
      console.log(
        "Expires:",
        new Date(
          download.expiresAt
        ).toISOString()
      );
      console.log("======================================================");
      console.log("");

      return res.json({
        success: true,
        test: true,
        product_id: product.id,
        product_name: product.name,
        r2_key: product.r2Key,
        download_name: product.downloadName,
        payment_reference: reference,
        download_url: download.downloadUrl,
        expires_at: download.expiresAt
      });
    } catch (error) {
      console.error(
        "Temporary product test error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Product test failed.",
        error: error.message
      });
    }
  }
);

// ======================================================
// OLD TEST DOWNLOAD ROUTE
// ======================================================

app.get("/api/test-download-v2", (req, res) => {
  res.json({
    success: false,
    message:
      "Use /api/test-product/:productId to test a product."
  });
});

// ======================================================
// PAYMENT SUCCESS PAGE
// ======================================================

app.get(
  "/payment-success.html",
  (req, res) => {
    res.sendFile(
      path.join(
        publicFolder,
        "payment-success.html"
      )
    );
  }
);

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

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      status: "healthy",
      database: "connected",
      r2: r2Configured
        ? "configured"
        : "not configured",
      site: SITE_URL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: "unhealthy",
      database: "error",
      error: error.message
    });
  }
});

// ======================================================
// 404 HANDLER
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
    path: req.originalUrl
  });
});

// ======================================================
// START SERVER
// ======================================================

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(
        `Earn Unlimited Funds server running on port ${PORT}`
      );

      console.log(
        `Site URL: ${SITE_URL}`
      );

      console.log(
        `R2 configured: ${r2Configured ? "YES" : "NO"}`
      );
    });
  } catch (error) {
    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);
  }
}

startServer();
