import "dotenv/config";

import express from "express";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pg from "pg";

import {
  S3Client,
  GetObjectCommand
} from "@aws-sdk/client-s3";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 10000;

const SITE_URL =
  process.env.RENDER_EXTERNAL_URL ||
  "https://earn-unlimited-funds.onrender.com";

/* ======================================================
   EXPRESS
====================================================== */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  express.static(
    path.join(__dirname, "..", "public")
  )
);

/* ======================================================
   DATABASE
====================================================== */

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not configured."
  );
}

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  }
});

/* ======================================================
   CLOUDFLARE R2
====================================================== */

let r2 = null;

if (
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
) {
  r2 = new S3Client({
    region: "auto",

    endpoint:
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
      accessKeyId:
        process.env.R2_ACCESS_KEY_ID,

      secretAccessKey:
        process.env.R2_SECRET_ACCESS_KEY
    }
  });

  console.log(
    "Cloudflare R2 configured."
  );
} else {
  console.log(
    "Cloudflare R2 is not fully configured."
  );
}

/* ======================================================
   PRODUCTS
====================================================== */

const   "tst": {
    id: "tst",

    name: "Tst",

    description:
      "Have raw knowledge",

    priceNaira: 0,

    amountKobo: 0,

    r2Key:
      "Tst.pdf",

    downloadName:
      "Tst.pdf",

    contentType:
      "application/pdf",

    selarUrl:
      "https://selar.com/4j11q9844e"
  }, = {
  "how-to-pass-high-in-exams": {
    id: "how-to-pass-high-in-exams",

    name: "How to Pass High in Exams",

    description:
      "A practical guide designed to help students prepare better, study effectively, manage examination pressure and improve their academic performance.",

    priceNaira: 25000,

    amountKobo: 2500000,

    r2Key:
      "how-to-pass-high-in-exams.pdf",

    downloadName:
      "How-to-Pass-High-in-Exams.pdf",

    contentType:
      "application/pdf",

    selarUrl:
      "https://selar.com/5m7y791u94"
  },

  "ai-response-complete-guide": {
    id: "ai-response-complete-guide",

    name: "AI Response Complete Guide",

    description:
      "A practical guide to using AI effectively for better responses, ideas, productivity, communication and results.",

    priceNaira: 40000,

    amountKobo: 4000000,

    r2Key:
      "AI_Response_Complete_Guide-3.pdf",

    downloadName:
      "AI-Response-Complete-Guide.pdf",

    contentType:
      "application/pdf",

    selarUrl:
      "https://selar.com/376717994x"
  },

  "facebook-automation": {
    id: "facebook-automation",

    name: "Facebook Automation",

    description:
      "Learn practical Facebook automation strategies for improving your online marketing and business activities.",

    priceNaira: 60000,

    amountKobo: 6000000,

    r2Key:
      "Facebook_Automation_Ebook_GBENGA-1.pdf",

    downloadName:
      "Facebook-Automation-Ebook.pdf",

    contentType:
      "application/pdf",

    selarUrl:
      "https://selar.com/9b2t7798i4"
  },

  "save-a-billion-from-zero-account": {
    id: "save-a-billion-from-zero-account",

    name:
      "How to Save a Billion from a Zero Account",

    description:
      "A practical financial guide about building saving habits and growing money from a small starting point.",

    priceNaira: 80000,

    amountKobo: 8000000,

    r2Key:
      "How_to_Save_a_Billion_from_a_Zero_Account-1.pdf",

    downloadName:
      "How-to-Save-a-Billion-from-a-Zero-Account.pdf",

    contentType:
      "application/pdf",

    selarUrl:
      "https://selar.com/40v70a9277"
  },

  "pregnancy-care": {
    id: "pregnancy-care",

    name:
      "Pregnancy Care Guide",

    description:
      "A pregnancy care reference guide covering practical information for expectant mothers.",

    priceNaira: 150000,

    amountKobo: 15000000,

    r2Key:
      "Pregnancy_Care_Guide_Ebook-1.docx",

    downloadName:
      "Pregnancy-Care-Guide.docx",

    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    selarUrl:
      "https://selar.com/327021wa25"
  },

  "sell-faster": {
    id: "sell-faster",

    name:
      "Sell Faster Professional Ebook",

    description:
      "A practical guide for improving selling skills, attracting customers and increasing sales.",

    priceNaira: 150200,

    amountKobo: 15020000,

    r2Key:
      "Sell_Faster_Professional_Ebook-2.pdf",

    downloadName:
      "Sell-Faster-Professional-Ebook.pdf",

    contentType:
      "application/pdf",

    selarUrl:
      "https://selar.com/4v623f9qhw"
  }
};

/* ======================================================
   DATABASE INITIALIZATION
====================================================== */

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
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS reference TEXT
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS email TEXT
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS product_id TEXT
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
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS created_at BIGINT
    `);

    await pool.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS updated_at BIGINT
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
      ADD COLUMN IF NOT EXISTS product_id TEXT
    `);

    await pool.query(`
      ALTER TABLE downloads
      ADD COLUMN IF NOT EXISTS email TEXT
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

    /*
      Keep the webhook table so every received
      Selar event can be recorded.
    */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS selar_webhook_events (
        id SERIAL PRIMARY KEY,
        event_id TEXT,
        event_type TEXT,
        payload JSONB,
        headers JSONB,
        received_at BIGINT
      )
    `);

    console.log(
      "PostgreSQL database initialized."
    );
  } catch (error) {
    console.error(
      "Database initialization error:",
      error
    );

    throw error;
  }
}

/* ======================================================
   CREATE DOWNLOAD TOKEN
====================================================== */

async function createDownloadToken({
  paymentReference,
  productId,
  email
}) {
  const rawToken =
    crypto.randomBytes(32).toString("hex");

  const tokenHash =
    crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

  const now = Date.now();

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
      ($1,$2,$3,$4,$5,0,$6,$7)
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

  return {
    token: rawToken,

    downloadUrl:
      `${SITE_URL}/api/download?token=${encodeURIComponent(rawToken)}`,

    expiresAt
  };
}

/* ======================================================
   PRODUCTS API
====================================================== */

app.get(
  "/api/products",
  (req, res) => {
    res.json({
      success: true,

      products:
        Object.values(PRODUCTS).map(
          (product) => ({
            id: product.id,
            name: product.name,
            description:
              product.description,
            priceNaira:
              product.priceNaira,
            amountKobo:
              product.amountKobo,
            selarUrl:
              product.selarUrl
          })
        )
    });
  }
);

/* ======================================================
   SINGLE PRODUCT API
====================================================== */

app.get(
  "/api/products/:id",
  (req, res) => {
    const product =
      PRODUCTS[req.params.id];

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found."
      });
    }

    res.json({
      success: true,
      product
    });
  }
);

/* ======================================================
   START PAYMENT
====================================================== */

app.post(
  "/api/pay",
  async (req, res) => {
    try {
      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

      const productId =
        req.body.product_id ||
        req.body.productId;

      if (!email) {
        return res.status(400).json({
          success: false,
          message:
            "Email is required."
        });
      }

      if (
        !productId ||
        !PRODUCTS[productId]
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid product is required."
        });
      }

      const product =
        PRODUCTS[productId];

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
          ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          reference,
          email,
          productId,
          product.priceNaira,
          "NGN",
          "PENDING",
          now,
          now
        ]
      );

      const returnUrl =
        `${SITE_URL}/payment-success.html?product=${encodeURIComponent(productId)}&reference=${encodeURIComponent(reference)}`;

      res.json({
        success: true,
        reference,
        product_id:
          productId,
        checkout_url:
          product.selarUrl,
        return_url:
          returnUrl
      });

    } catch (error) {
      console.error(
        "Payment start error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to start payment."
      });
    }
  }
);

/* ======================================================
   SELAR WEBHOOK - PRODUCTION
====================================================== */

app.post(
  "/api/selar/webhook",
  async (req, res) => {
    try {
      console.log("");
      console.log(
        "=================================================="
      );

      console.log(
        "          SELAR WEBHOOK RECEIVED"
      );

      console.log(
        "=================================================="
      );

      const body =
        req.body || {};

      console.log(
        "Time:",
        new Date().toISOString()
      );

      console.log(
        "BODY:",
        JSON.stringify(
          body,
          null,
          2
        )
      );

      /* ================================================
         GET SELAR FIELDS
      ================================================ */

      const buyerEmail =
        String(
          body.buyer_email || ""
        )
          .trim()
          .toLowerCase();

      const buyerName =
        String(
          body.buyer_full_name || ""
        ).trim();

      const productName =
        String(
          body.product_names || ""
        ).trim();

      const productCode =
        String(
          body.product_codes || ""
        ).trim();

      const amount =
        Number(
          body.amount || 0
        );

      const currency =
        String(
          body.currency || "NGN"
        )
          .trim()
          .toUpperCase();

      const receiptUrl =
        String(
          body.receipt_url || ""
        ).trim();

      console.log(
        "Buyer:",
        buyerEmail
      );

      console.log(
        "Product:",
        productName
      );

      console.log(
        "Product code:",
        productCode
      );

      console.log(
        "Amount:",
        amount
      );

      console.log(
        "Currency:",
        currency
      );

      console.log(
        "Receipt:",
        receiptUrl
      );

      /* ================================================
         SAVE WEBHOOK EVENT
      ================================================ */

      const eventId =
        body.id ||
        body.event_id ||
        body.order_id ||
        null;

      const eventType =
        body.event ||
        body.type ||
        body.event_type ||
        null;

      await pool.query(
        `
          INSERT INTO selar_webhook_events
          (
            event_id,
            event_type,
            payload,
            headers,
            received_at
          )
          VALUES
          ($1,$2,$3,$4,$5)
        `,
        [
          eventId
            ? String(eventId)
            : null,

          eventType
            ? String(eventType)
            : null,

          JSON.stringify(body),

          JSON.stringify(
            req.headers
          ),

          Date.now()
        ]
      );

      /* ================================================
         CHECK EMAIL
      ================================================ */

      if (!buyerEmail) {
        console.log(
          "Buyer email missing."
        );

        return res.status(200).json({
          success: true,
          received: true,
          paid: false,
          message:
            "Buyer email missing."
        });
      }

      /* ================================================
         IGNORE ZERO-AMOUNT TEST EVENTS
      ================================================ */

      if (amount <= 0) {
        console.log(
          "Zero amount webhook received."
        );

        console.log(
          "This is treated as a test/non-paid event."
        );

        return res.status(200).json({
          success: true,
          received: true,
          paid: false,
          test: true,
          message:
            "Zero-amount/test webhook received."
        });
      }

      /* ================================================
         MATCH PRODUCT
      ================================================ */

      let product =
        Object.values(
          PRODUCTS
        ).find(
          (item) =>
            item.name.toLowerCase() ===
            productName.toLowerCase()
        );

      /*
        Support the Selar Tst product only when
        a non-zero amount is received.
      */

      if (
        !product &&
        productName.toLowerCase() ===
          "tst"
      ) {
        product =
          PRODUCTS[
            "how-to-pass-high-in-exams"
          ];
      }

      if (!product) {
        console.log(
          "Product could not be matched:",
          productName
        );

        return res.status(200).json({
          success: true,
          received: true,
          paid: false,
          message:
            "Product could not be matched.",
          product_name:
            productName,
          product_code:
            productCode
        });
      }

      console.log(
        "Matched product:",
        product.id
      );

      /* ================================================
         CHECK AMOUNT
      ================================================ */

      if (
        amount <
        product.priceNaira
      ) {
        console.log(
          "Payment amount is below product price."
        );

        console.log(
          "Expected:",
          product.priceNaira
        );

        console.log(
          "Received:",
          amount
        );

        return res.status(200).json({
          success: true,
          received: true,
          paid: false,
          message:
            "Payment amount is below product price."
        });
      }

      /* ================================================
         FIND PENDING WEBSITE PAYMENT
      ================================================ */

      const paymentResult =
        await pool.query(
          `
            SELECT *
            FROM payments
            WHERE LOWER(email) = $1
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

      if (
        paymentResult.rows.length ===
        0
      ) {
        console.log(
          "No matching pending website payment found."
        );

        /*
          IMPORTANT:
          Do not create a fallback payment.
        */

        return res.status(200).json({
          success: true,
          received: true,
          paid: false,
          message:
            "No matching pending website payment found."
        });
      }

      const payment =
        paymentResult.rows[0];

      console.log(
        "Website payment found:",
        payment.reference
      );

      /* ================================================
         MARK PAYMENT AS PAID
      ================================================ */

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
          Date.now(),
          payment.reference
        ]
      );

      console.log(
        "PAYMENT MARKED PAID"
      );

      console.log(
        "Reference:",
        payment.reference
      );

      console.log(
        "Product:",
        product.name
      );

      console.log(
        "Buyer:",
        buyerEmail
      );

      /* ================================================
         CREATE DOWNLOAD TOKEN
      ================================================ */

      const download =
        await createDownloadToken({
          paymentReference:
            payment.reference,

          productId:
            product.id,

          email:
            buyerEmail
        });

      console.log(
        "DOWNLOAD TOKEN CREATED"
      );

      console.log(
        "Download URL:",
        download.downloadUrl
      );

      console.log(
        "=================================================="
      );

      /* ================================================
         SUCCESS
      ================================================ */

      return res.status(200).json({
        success: true,
        received: true,
        paid: true,

        buyer_email:
          buyerEmail,

        buyer_name:
          buyerName,

        product_id:
          product.id,

        product_name:
          product.name,

        product_code:
          productCode,

        amount:
          amount,

        currency:
          currency,

        reference:
          payment.reference,

        receipt_url:
          receiptUrl,

        download_url:
          download.downloadUrl,

        expires_at:
          download.expiresAt
      });

    } catch (error) {
      console.error(
        "SELAR WEBHOOK ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Webhook processing failed."
      });
    }
  }
);

/* ======================================================
   PURCHASE STATUS
====================================================== */

app.get(
  "/api/purchase-status",
  async (req, res) => {
    try {
      const reference =
        String(
          req.query.reference || ""
        ).trim();

      if (!reference) {
        return res.status(400).json({
          success: false,
          message:
            "Reference is required."
        });
      }

      const result =
        await pool.query(
          `
            SELECT *
            FROM payments
            WHERE reference = $1
            LIMIT 1
          `,
          [reference]
        );

      if (
        result.rows.length === 0
      ) {
        return res.json({
          success: true,
          found: false,
          paid: false
        });
      }

      const payment =
        result.rows[0];

      res.json({
        success: true,
        found: true,

        paid:
          payment.status ===
          "PAID",

        status:
          payment.status,

        reference:
          payment.reference,

        product_id:
          payment.product_id,

        email:
          payment.email
      });

    } catch (error) {
      console.error(
        "Purchase status error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to check purchase status."
      });
    }
  }
);

/* ======================================================
   GET DOWNLOAD AFTER PAYMENT
====================================================== */

app.get(
  "/api/get-download",
  async (req, res) => {
    try {
      const reference =
        String(
          req.query.reference || ""
        ).trim();

      if (!reference) {
        return res.status(400).json({
          success: false,
          message:
            "Reference is required."
        });
      }

      const result =
        await pool.query(
          `
            SELECT *
            FROM payments
            WHERE reference = $1
            LIMIT 1
          `,
          [reference]
        );

      if (
        result.rows.length === 0
      ) {
        return res.json({
          success: true,
          paid: false,
          message:
            "Payment not found yet."
        });
      }

      const payment =
        result.rows[0];

      if (
        payment.status !== "PAID"
      ) {
        return res.json({
          success: true,
          paid: false,
          status:
            payment.status,
          message:
            "Payment has not been verified yet."
        });
      }

      const product =
        PRODUCTS[
          payment.product_id
        ];

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found."
        });
      }

      /*
        Generate a new secure download token
        only after the payment has been confirmed.
      */

      const download =
        await createDownloadToken({
          paymentReference:
            payment.reference,

          productId:
            product.id,

          email:
            payment.email
        });

      res.json({
        success: true,
        paid: true,

        reference:
          payment.reference,

        product_id:
          product.id,

        product_name:
          product.name,

        email:
          payment.email,

        download_url:
          download.downloadUrl,

        expires_at:
          download.expiresAt
      });

    } catch (error) {
      console.error(
        "Get download error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to prepare download."
      });
    }
  }
);

/* ======================================================
   SECURE R2 DOWNLOAD
====================================================== */

app.get(
  "/api/download",
  async (req, res) => {
    try {
      const token =
        String(
          req.query.token || ""
        ).trim();

      if (!token) {
        return res.status(400).send(
          "Download token is required."
        );
      }

      const tokenHash =
        crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");

      const result =
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
        result.rows.length === 0
      ) {
        return res.status(403).send(
          "Invalid or expired download link."
        );
      }

      const download =
        result.rows[0];

      if (
        Number(download.used) === 1
      ) {
        return res.status(403).send(
          "This download link has already been used."
        );
      }

      if (
        download.expires_at &&
        Date.now() >
          Number(
            download.expires_at
          )
      ) {
        return res.status(403).send(
          "This download link has expired."
        );
      }

      const product =
        PRODUCTS[
          download.product_id
        ];

      if (!product) {
        return res.status(404).send(
          "Product not found."
        );
      }

      if (!r2) {
        return res.status(500).send(
          "R2 storage is not configured."
        );
      }

      const command =
        new GetObjectCommand({
          Bucket:
            process.env.R2_BUCKET_NAME,

          Key:
            product.r2Key
        });

      const object =
        await r2.send(command);

      /*
        Mark token as used.
      */

      await pool.query(
        `
          UPDATE downloads
          SET used = 1
          WHERE token_hash = $1
        `,
        [tokenHash]
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
        object.ContentLength
      ) {
        res.setHeader(
          "Content-Length",
          object.ContentLength
        );
      }

      object.Body.pipe(res);

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
          "The product file was not found in R2."
        );
      }

      res.status(500).send(
        "Unable to download product."
      );
    }
  }
);

/* ======================================================
   TEST PRODUCT DOWNLOAD
====================================================== */

app.get(
  "/api/test-product/:productId",
  async (req, res) => {
    try {
      const productId =
        req.params.productId;

      const product =
        PRODUCTS[productId];

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found."
        });
      }

      const email =
        "test@example.com";

      const reference =
        `TEST-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      const now =
        Date.now();

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
          ($1,$2,$3,$4,$5,'PAID',$6,$7)
        `,
        [
          reference,
          email,
          productId,
          product.priceNaira,
          "NGN",
          now,
          now
        ]
      );

      const download =
        await createDownloadToken({
          paymentReference:
            reference,

          productId,

          email
        });

      res.json({
        success: true,
        test: true,

        product_id:
          product.id,

        product_name:
          product.name,

        r2_key:
          product.r2Key,

        download_name:
          product.downloadName,

        download_url:
          download.downloadUrl,

        expires_at:
          download.expiresAt
      });

    } catch (error) {
      console.error(
        "Test product error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Test failed."
      });
    }
  }
);

/* ======================================================
   TEST DOWNLOAD INFO
====================================================== */

app.get(
  "/api/test-download-v2",
  (req, res) => {
    res.json({
      success: true,

      message:
        "Use /api/test-product/:productId to test a product download.",

      example:
        "/api/test-product/how-to-pass-high-in-exams"
    });
  }
);

/* ======================================================
   PAYMENT SUCCESS PAGE
====================================================== */

app.get(
  "/payment-success.html",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "..",
        "public",
        "payment-success.html"
      )
    );
  }
);

/* ======================================================
   HOME PAGE
====================================================== */

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "..",
        "public",
        "hex.html"
      )
    );
  }
);

/* ======================================================
   HEALTH CHECK
====================================================== */

app.get(
  "/health",
  async (req, res) => {
    try {
      await pool.query(
        "SELECT 1"
      );

      res.json({
        success: true,

        database:
          "connected",

        r2_configured:
          !!r2,

        service:
          "Earn Unlimited Funds"
      });

    } catch (error) {
      res.status(500).json({
        success: false,

        database:
          "error",

        message:
          error.message
      });
    }
  }
);

/* ======================================================
   404
====================================================== */

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,
      message:
        "Route not found."
    });
  }
);

/* ======================================================
   START SERVER
====================================================== */

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(
      PORT,
      () => {
        console.log(
          `Earn Unlimited Funds server running on port ${PORT}`
        );

        console.log(
          `Webhook URL: ${SITE_URL}/api/selar/webhook`
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
