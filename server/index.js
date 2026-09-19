// ======================================================
// EARN UNLIMITED FUNDS
// SERVER / INDEX.JS
// ======================================================

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

// ======================================================
// BASIC CONFIGURATION
// ======================================================

const app = express();

const PORT =
  process.env.PORT || 10000;

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const publicFolder =
  path.join(__dirname, "..", "public");

const SITE_URL =
  process.env.RENDER_EXTERNAL_URL ||
  "https://earn-unlimited-funds.onrender.com";

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  express.static(publicFolder)
);

// ======================================================
// POSTGRESQL
// ======================================================

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl:
    process.env.DATABASE_URL
      ? {
          rejectUnauthorized: false
        }
      : false
});

// ======================================================
// CLOUDFLARE R2
// ======================================================

let r2Client = null;

if (
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
) {
  r2Client = new S3Client({
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
    "Cloudflare R2 client configured."
  );
} else {
  console.log(
    "WARNING: Cloudflare R2 environment variables are missing."
  );
}

const R2_BUCKET =
  process.env.R2_BUCKET_NAME;

// ======================================================
// PRODUCTS
// ======================================================

const PRODUCTS = {
  "how-to-pass-high-in-exams": {
    id: "how-to-pass-high-in-exams",

    name:
      "How to Pass High in Exams",

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
    id:
      "ai-response-complete-guide",

    name:
      "AI Response Complete Guide",

    description:
      "A practical guide to using AI effectively for better responses, ideas, productivity, communication and everyday tasks.",

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
    id:
      "facebook-automation",

    name:
      "Facebook Automation",

    description:
      "A practical guide to Facebook automation, customer responses, content workflows and business growth.",

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
    id:
      "save-a-billion-from-zero-account",

    name:
      "Save a Billion from Zero Account",

    description:
      "A practical financial guide focused on building saving habits and improving money management from a small starting point.",

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
    id:
      "pregnancy-care",

    name:
      "Pregnancy Care",

    description:
      "A practical pregnancy care guide covering useful information for pregnancy preparation, care and everyday planning.",

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
    id:
      "sell-faster",

    name:
      "Sell Faster",

    description:
      "A practical professional guide designed to help sellers improve their offers, attract customers and make sales more effectively.",

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

// ======================================================
// DATABASE INITIALIZATION
// ======================================================

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,

      reference TEXT UNIQUE NOT NULL,

      email TEXT NOT NULL,

      product_id TEXT NOT NULL,

      amount NUMERIC NOT NULL DEFAULT 0,

      currency TEXT NOT NULL DEFAULT 'NGN',

      status TEXT NOT NULL DEFAULT 'pending',

      created_at BIGINT NOT NULL,

      updated_at BIGINT NOT NULL
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

      used INTEGER NOT NULL DEFAULT 0,

      expires_at BIGINT NOT NULL,

      created_at BIGINT NOT NULL
    )
  `);

  // Make sure payment_reference exists
  await pool.query(`
    ALTER TABLE downloads
    ADD COLUMN IF NOT EXISTS payment_reference TEXT
  `);

  // Make sure useful columns exist
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
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  `);

  await pool.query(`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS created_at BIGINT
  `);

  await pool.query(`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS updated_at BIGINT
  `);

  console.log(
    "PostgreSQL database initialized."
  );
}

// ======================================================
// HELPER: CREATE DOWNLOAD TOKEN
// ======================================================

async function createDownloadToken({
  paymentReference,
  productId,
  email
}) {
  if (!r2Client) {
    throw new Error(
      "Cloudflare R2 is not configured."
    );
  }

  const product =
    PRODUCTS[productId];

  if (!product) {
    throw new Error(
      "Product not found."
    );
  }

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
    ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      tokenHash,

      paymentReference,

      paymentReference,

      productId,

      email,

      0,

      expiresAt,

      now
    ]
  );

  return {
    rawToken,

    downloadUrl:
      `${SITE_URL}/api/download?token=${encodeURIComponent(
        rawToken
      )}`,

    expiresAt
  };
}

// ======================================================
// GET PRODUCTS
// ======================================================

app.get(
  "/api/products",
  (req, res) => {
    res.json({
      success: true,

      products:
        Object.values(PRODUCTS).map(
          (product) => ({
            id:
              product.id,

            name:
              product.name,

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

// ======================================================
// GET SINGLE PRODUCT
// ======================================================

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

      product: {
        id:
          product.id,

        name:
          product.name,

        description:
          product.description,

        priceNaira:
          product.priceNaira,

        amountKobo:
          product.amountKobo,

        selarUrl:
          product.selarUrl
      }
    });
  }
);

// ======================================================
// CREATE PAYMENT
// ======================================================

app.post(
  "/api/pay",
  async (req, res) => {
    try {
      const {
        email,
        productId
      } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,

          message:
            "Email is required."
        });
      }

      if (!productId) {
        return res.status(400).json({
          success: false,

          message:
            "Product ID is required."
        });
      }

      const product =
        PRODUCTS[productId];

      if (!product) {
        return res.status(404).json({
          success: false,

          message:
            "Product not found."
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const reference =
        `EUF-${Date.now()}-${crypto
          .randomBytes(5)
          .toString("hex")}`;

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
        ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          reference,

          normalizedEmail,

          productId,

          product.priceNaira,

          "NGN",

          "pending",

          now,

          now
        ]
      );

      console.log(
        "Payment record created:",
        reference
      );

      res.json({
        success: true,

        reference,

        product_id:
          productId,

        product_name:
          product.name,

        amount:
          product.priceNaira,

        currency:
          "NGN",

        selar_url:
          product.selarUrl
      });

    } catch (error) {
      console.error(
        "PAYMENT ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to create payment."
      });
    }
  }
);

// ======================================================
// SELAR WEBHOOK
// SELAR → ZAPIER → THIS ROUTE
// ======================================================

app.post(
  "/api/selar/webhook",
  async (req, res) => {
    try {
      console.log(
        "=========================================="
      );

      console.log(
        "SELAR WEBHOOK PROCESSING"
      );

      console.log(
        "=========================================="
      );

      console.log(
        "Body:",
        JSON.stringify(
          req.body,
          null,
          2
        )
      );

      const data =
        req.body || {};

      const buyerEmail =
        String(
          data.buyer_email || ""
        )
          .trim()
          .toLowerCase();

      const productName =
        String(
          data.product_names || ""
        ).trim();

      const productCode =
        String(
          data.product_codes || ""
        ).trim();

      const amountReceived =
        Number(
          data.amount || 0
        );

      const currency =
        String(
          data.currency || "NGN"
        )
          .trim()
          .toUpperCase();

      const receiptUrl =
        String(
          data.receipt_url || ""
        ).trim();

      if (!buyerEmail) {
        return res.status(400).json({
          success: false,

          message:
            "buyer_email is required."
        });
      }

      if (!productName) {
        return res.status(400).json({
          success: false,

          message:
            "product_names is required."
        });
      }

      // ==================================================
      // TEST MODE
      // Selar sends "Tst" for the one test purchase.
      // This is ONLY for the existing test.
      // ==================================================

      let productId = null;

      if (
        productName.toLowerCase() ===
        "tst"
      ) {
        productId =
          "how-to-pass-high-in-exams";

        console.log(
          "TEST MODE: Tst mapped to How to Pass High in Exams."
        );
      } else {

        // ==================================================
        // REAL SELAR PRODUCT NAME MATCHING
        // ==================================================

        const productEntry =
          Object.values(PRODUCTS)
            .find(
              (product) =>
                product.name
                  .trim()
                  .toLowerCase() ===
                productName
                  .trim()
                  .toLowerCase()
            );

        if (productEntry) {
          productId =
            productEntry.id;
        }
      }

      if (!productId) {
        console.log(
          "UNKNOWN SELAR PRODUCT:"
        );

        console.log(
          "Product name:",
          productName
        );

        console.log(
          "Product code:",
          productCode
        );

        return res.status(400).json({
          success: false,

          message:
            "Unknown Selar product.",

          product_name:
            productName,

          product_code:
            productCode
        });
      }

      const product =
        PRODUCTS[productId];

      // ==================================================
      // FIND EXISTING PENDING PAYMENT
      // ==================================================

      const pendingPayment =
        await pool.query(
          `
          SELECT
            id,
            reference,
            email,
            product_id,
            amount,
            currency,
            status
          FROM payments
          WHERE LOWER(email) = $1
            AND product_id = $2
            AND status = 'pending'
          ORDER BY id DESC
          LIMIT 1
          `,
          [
            buyerEmail,
            productId
          ]
        );

      let paymentReference;

      if (
        pendingPayment.rows.length > 0
      ) {
        paymentReference =
          pendingPayment
            .rows[0]
            .reference;

        await pool.query(
          `
          UPDATE payments
          SET
            status = 'paid',
            updated_at = $1,
            amount = $2,
            currency = $3
          WHERE reference = $4
          `,
          [
            Date.now(),

            amountReceived ||
              product.priceNaira,

            currency,

            paymentReference
          ]
        );

        console.log(
          "Existing payment marked PAID:",
          paymentReference
        );

      } else {

        // ==================================================
        // FALLBACK PAYMENT
        // ==================================================

        paymentReference =
          `SELAR-${Date.now()}-${crypto
            .randomBytes(5)
            .toString("hex")}`;

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
          ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            paymentReference,

            buyerEmail,

            productId,

            amountReceived ||
              product.priceNaira,

            currency,

            "paid",

            now,

            now
          ]
        );

        console.log(
          "New Selar payment created and marked PAID:",
          paymentReference
        );
      }

      // ==================================================
      // CHECK FOR EXISTING DOWNLOAD
      // ==================================================

      const existingDownload =
        await pool.query(
          `
          SELECT
            id,
            expires_at
          FROM downloads
          WHERE payment_reference = $1
            AND product_id = $2
            AND used = 0
            AND expires_at > $3
          ORDER BY id DESC
          LIMIT 1
          `,
          [
            paymentReference,

            productId,

            Date.now()
          ]
        );

      if (
        existingDownload.rows.length > 0
      ) {
        console.log(
          "Existing active download found for:",
          paymentReference
        );

        return res.status(200).json({
          success: true,

          message:
            "Payment already processed.",

          reference:
            paymentReference,

          product_id:
            productId,

          product_name:
            product.name,

          receipt_url:
            receiptUrl
        });
      }

      // ==================================================
      // CREATE SECURE DOWNLOAD
      // ==================================================

      const download =
        await createDownloadToken({
          paymentReference,

          productId,

          email:
            buyerEmail
        });

      console.log(
        "=========================================="
      );

      console.log(
        "PAYMENT PROCESSED SUCCESSFULLY"
      );

      console.log(
        "=========================================="
      );

      console.log(
        "Reference:",
        paymentReference
      );

      console.log(
        "Product:",
        product.name
      );

      console.log(
        "Buyer:",
        buyerEmail
      );

      console.log(
        "R2 file:",
        product.r2Key
      );

      console.log(
        "Download created: YES"
      );

      console.log(
        "Download expires:",
        new Date(
          download.expiresAt
        ).toISOString()
      );

      return res.status(200).json({
        success: true,

        message:
          "Selar payment processed successfully.",

        reference:
          paymentReference,

        product_id:
          productId,

        product_name:
          product.name,

        buyer_email:
          buyerEmail,

        download_url:
          download.downloadUrl,

        expires_at:
          download.expiresAt,

        receipt_url:
          receiptUrl
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

// ======================================================
// PAYMENT STATUS
// ======================================================

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
            status,
            created_at,
            updated_at
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
            "Payment not found."
        });
      }

      const payment =
        result.rows[0];

      const product =
        PRODUCTS[
          payment.product_id
        ];

      // ==================================================
      // IF PAID, FIND ACTIVE DOWNLOAD
      // ==================================================

      let downloadUrl = null;
      let expiresAt = null;

      if (
        payment.status === "paid"
      ) {
        const downloadResult =
          await pool.query(
            `
            SELECT
              id,
              token_hash,
              expires_at
            FROM downloads
            WHERE payment_reference = $1
              AND product_id = $2
              AND used = 0
              AND expires_at > $3
            ORDER BY id DESC
            LIMIT 1
            `,
            [
              payment.reference,

              payment.product_id,

              Date.now()
            ]
          );

        if (
          downloadResult.rows.length > 0
        ) {
          // We cannot recreate the original
          // raw token from its hash.
          // The webhook response already contains
          // the original secure URL.
          expiresAt =
            downloadResult.rows[0]
              .expires_at;
        }
      }

      return res.json({
        success: true,

        payment: {
          reference:
            payment.reference,

          email:
            payment.email,

          product_id:
            payment.product_id,

          product_name:
            product
              ? product.name
              : null,

          amount:
            payment.amount,

          currency:
            payment.currency,

          status:
            payment.status,

          download_url:
            downloadUrl,

          expires_at:
            expiresAt
        }
      });

    } catch (error) {

      console.error(
        "PURCHASE STATUS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to check purchase status."
      });
    }
  }
);

// ======================================================
// SECURE DOWNLOAD
// ======================================================

app.get(
  "/api/download",
  async (req, res) => {
    try {
      const rawToken =
        String(
          req.query.token || ""
        ).trim();

      if (!rawToken) {
        return res.status(400).json({
          success: false,

          message:
            "Download token is required."
        });
      }

      const tokenHash =
        crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");

      const result =
        await pool.query(
          `
          SELECT
            id,
            payment_reference,
            product_id,
            email,
            used,
            expires_at
          FROM downloads
          WHERE token_hash = $1
          LIMIT 1
          `,
          [tokenHash]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,

          message:
            "Invalid download link."
        });
      }

      const download =
        result.rows[0];

      if (
        Number(download.used) === 1
      ) {
        return res.status(403).json({
          success: false,

          message:
            "This download link has already been used."
        });
      }

      if (
        Date.now() >
        Number(download.expires_at)
      ) {
        return res.status(403).json({
          success: false,

          message:
            "This download link has expired."
        });
      }

      const product =
        PRODUCTS[
          download.product_id
        ];

      if (!product) {
        return res.status(404).json({
          success: false,

          message:
            "Product associated with this download was not found."
        });
      }

      if (!r2Client) {
        return res.status(500).json({
          success: false,

          message:
            "Cloudflare R2 is not configured."
        });
      }

      console.log(
        "Starting R2 download:",
        product.r2Key
      );

      const command =
        new GetObjectCommand({
          Bucket:
            R2_BUCKET,

          Key:
            product.r2Key
        });

      const r2Response =
        await r2Client.send(
          command
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
          r2Response.ContentLength
        );
      }

      if (
        !r2Response.Body
      ) {
        return res.status(500).json({
          success: false,

          message:
            "File could not be retrieved from R2."
        });
      }

      // Mark the token as used
      // only after the R2 file is successfully obtained.
      await pool.query(
        `
        UPDATE downloads
        SET used = 1
        WHERE id = $1
        `,
        [download.id]
      );

      r2Response.Body.pipe(res);

    } catch (error) {

      console.error(
        "DOWNLOAD ERROR:",
        error
      );

      if (
        error.name ===
        "NoSuchKey"
      ) {
        return res.status(404).json({
          success: false,

          message:
            "The product file was not found in Cloudflare R2."
        });
      }

      return res.status(500).json({
        success: false,

        message:
          "Download failed."
      });
    }
  }
);

// ======================================================
// TEMPORARY PRODUCT TESTING
//
// USE THIS TO TEST EACH PRODUCT WITHOUT ANOTHER
// SELAR TEST PURCHASE.
//
// REMOVE THIS ROUTE AFTER ALL PRODUCTS ARE VERIFIED.
// ======================================================

app.get(
  "/api/test-product/:productId",
  async (req, res) => {
    try {
      const productId =
        String(
          req.params.productId || ""
        ).trim();

      const product =
        PRODUCTS[productId];

      if (!product) {
        return res.status(404).json({
          success: false,

          message:
            "Product not found.",

          available_products:
            Object.keys(PRODUCTS)
        });
      }

      if (!r2Client) {
        return res.status(500).json({
          success: false,

          message:
            "Cloudflare R2 is not configured."
        });
      }

      const paymentReference =
        `TEST-${Date.now()}-${crypto
          .randomBytes(5)
          .toString("hex")}`;

      const now =
        Date.now();

      // ==================================================
      // CREATE TEST PA
