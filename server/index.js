import express from "express";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import {
  S3Client,
  GetObjectCommand
} from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicFolder = path.join(__dirname, "..", "public");
app.use(express.static(publicFolder));

/*
====================================================
PRODUCTS
====================================================
*/

const PRODUCTS = {
  "how-to-pass-high-in-exams": {
    id: "how-to-pass-high-in-exams",
    name: "How to Pass High in Exams",
    price: 25000,
    amount: 2500000,
    currency: "NGN",
    description:
      "A practical guide designed to help students prepare better, study smarter and improve their examination performance.",
    r2Key: "how-to-pass-high-in-exams.pdf",
    downloadName: "How-to-Pass-High-in-Exams.pdf"
  }

  // ADD MORE PRODUCTS HERE LATER
};

/*
====================================================
POSTGRESQL DATABASE
====================================================
*/

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/*
====================================================
CREATE DATABASE TABLES
====================================================
*/

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      product_id TEXT NOT NULL,
      amount BIGINT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id BIGSERIAL PRIMARY KEY,
      token_hash TEXT UNIQUE NOT NULL,
      reference TEXT NOT NULL,
      product_id TEXT NOT NULL,
      email TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_downloads_token_hash
    ON downloads(token_hash);

    CREATE INDEX IF NOT EXISTS idx_payments_reference
    ON payments(reference);
  `);

  console.log("PostgreSQL database initialized.");
}

/*
====================================================
ENVIRONMENT VARIABLES
====================================================
*/

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  PAYSTACK_SECRET_KEY
} = process.env;

/*
====================================================
CLOUDFLARE R2 CLIENT
====================================================
*/

let r2Client = null;

if (
  R2_ACCOUNT_ID &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_BUCKET_NAME
) {
  r2Client = new S3Client({
    region: "auto",

    endpoint:
      `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
}

/*
====================================================
HELPERS
====================================================
*/

function getProduct(productId) {
  return PRODUCTS[productId] || null;
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function createDownloadToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getCookie(req, cookieName) {
  const cookieHeader = req.headers.cookie || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const parts = cookie.trim().split("=");

    const name = parts.shift();

    if (name === cookieName) {
      return decodeURIComponent(parts.join("="));
    }
  }

  return null;
}

/*
====================================================
HOME
====================================================
*/

app.get("/", (req, res) => {
  res.sendFile(
    path.join(publicFolder, "hex.html")
  );
});

/*
====================================================
PRODUCT API
====================================================
*/

app.get("/api/products", (req, res) => {
  const products = Object.values(PRODUCTS).map(
    (product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      description: product.description
    })
  );

  res.json(products);
});

app.get("/api/products/:id", (req, res) => {
  const product = getProduct(req.params.id);

  if (!product) {
    return res.status(404).json({
      message: "Product not found."
    });
  }

  res.json({
    id: product.id,
    name: product.name,
    price: product.price,
    currency: product.currency,
    description: product.description
  });
});

/*
====================================================
START PAYSTACK PAYMENT
====================================================
*/

app.post("/api/pay", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        message:
          "Paystack secret key is not configured."
      });
    }

    const {
      email,
      productId
    } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message:
          "Please enter a valid email address."
      });
    }

    const product = getProduct(productId);

    if (!product) {
      return res.status(404).json({
        message:
          "Selected product was not found."
      });
    }

    const callbackUrl =
      "https://earn-unlimited-funds.onrender.com/payment-callback";

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${PAYSTACK_SECRET_KEY}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          email,
          amount: product.amount,
          currency: product.currency,
          callback_url: callbackUrl,

          metadata: {
            product_id: product.id,
            product_name: product.name
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      console.error(
        "Paystack initialize error:",
        data
      );

      return res.status(500).json({
        message:
          "Unable to initialize payment."
      });
    }

    const reference =
      data.data.reference;

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
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (reference)
      DO UPDATE SET
        email = EXCLUDED.email,
        product_id = EXCLUDED.product_id,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency
      `,
      [
        reference,
        email,
        product.id,
        product.amount,
        product.currency,
        "pending",
        Date.now()
      ]
    );

    res.json({
      status: true,
      authorization_url:
        data.data.authorization_url,
      reference
    });

  } catch (error) {

    console.error(
      "Payment initialization error:",
      error
    );

    res.status(500).json({
      message:
        "Something went wrong while starting payment."
    });
  }
});

/*
====================================================
PAYSTACK CALLBACK
====================================================
*/

app.get("/payment-callback", async (req, res) => {
  try {

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).send(
        "Paystack is not configured."
      );
    }

    const reference =
      req.query.reference ||
      req.query.trxref;

    if (!reference) {
      return res.status(400).send(
        "Payment reference is missing."
      );
    }

    const paymentResult = await pool.query(
      `
      SELECT *
      FROM payments
      WHERE reference = $1
      `,
      [reference]
    );

    const payment =
      paymentResult.rows[0];

    if (!payment) {
      return res.status(400).send(
        "Payment record was not found."
      );
    }

    /*
    Verify payment directly with Paystack.
    */

    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const verifyData =
      await verifyResponse.json();

    if (
      !verifyResponse.ok ||
      !verifyData.status
    ) {
      return res.status(400).send(
        "Unable to verify payment."
      );
    }

    const transaction =
      verifyData.data;

    /*
    Payment must be successful.
    */

    if (
      transaction.status !==
      "success"
    ) {
      return res.status(400).send(
        "Payment was not successful."
      );
    }

    /*
    Confirm exact amount.
    */

    if (
      Number(transaction.amount) !==
      Number(payment.amount)
    ) {
      return res.status(400).send(
        "Payment amount does not match the product."
      );
    }

    /*
    Confirm currency.
    */

    if (
      String(transaction.currency)
        .toUpperCase() !==
      String(payment.currency)
        .toUpperCase()
    ) {
      return res.status(400).send(
        "Payment currency does not match."
      );
    }

    const product =
      getProduct(payment.product_id);

    if (!product) {
      return res.status(400).send(
        "The purchased product could not be found."
      );
    }

    /*
    Mark payment successful.
    */

    await pool.query(
      `
      UPDATE payments
      SET status = 'success'
      WHERE reference = $1
      `,
      [reference]
    );

    /*
    Create ONE-TIME download token.
    */

    const token =
      createDownloadToken();

    const tokenHash =
      hashToken(token);

    const now = Date.now();

    /*
    Token expires after 15 minutes.
    */

    const expiresAt =
      now + 15 * 60 * 1000;

    await pool.query(
      `
      INSERT INTO downloads
      (
        token_hash,
        reference,
        product_id,
        email,
        used,
        created_at,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tokenHash,
        reference,
        product.id,
        payment.email,
        0,
        now,
        expiresAt
      ]
    );

    /*
    Put token in secure HttpOnly cookie.
    */

    res.cookie(
      "download_token",
      token,
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
        path: "/"
      }
    );

    res.redirect(
      "/payment-success.html"
    );

  } catch (error) {

    console.error(
      "Payment callback error:",
      error
    );

    res.status(500).send(
      "An error occurred while processing your payment."
    );
  }
});

/*
====================================================
ONE-TIME DOWNLOAD
====================================================
*/

app.get("/api/download", async (req, res) => {

  try {

    if (!r2Client) {
      return res.status(500).json({
        message:
          "R2 storage is not configured."
      });
    }

    if (!R2_BUCKET_NAME) {
      return res.status(500).json({
        message:
          "R2 bucket name is missing."
      });
    }

    /*
    Get secure token from browser.
    */

    const token =
      getCookie(
        req,
        "download_token"
      );

    if (!token) {
      return res.status(403).send(
        "Download access denied. Please complete your purchase first."
      );
    }

    const tokenHash =
      hashToken(token);

    /*
    Find token in PostgreSQL.
    */

    const downloadResult =
      await pool.query(
        `
        SELECT *
        FROM downloads
        WHERE token_hash = $1
        `,
        [tokenHash]
      );

    const download =
      downloadResult.rows[0];

    if (!download) {
      return res.status(403).send(
        "Invalid download access."
      );
    }

    /*
    Check expiration.
    */

    if (
      Date.now() >
      Number(download.expires_at)
    ) {

      res.clearCookie(
        "download_token",
        {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/"
        }
      );

      return res.status(403).send(
        "Download access has expired."
      );
    }

    /*
    Check whether token was already used.
    */

    if (
      Number(download.used) === 1
    ) {
      return res.status(403).send(
        "This download link has already been used."
      );
    }

    /*
    Find purchased product.
    */

    const product =
      getProduct(
        download.product_id
      );

    if (!product) {
      return res.status(404).send(
        "Product not found."
      );
    }

    /*
    Get PDF directly from R2.

    The browser NEVER receives
    an R2 signed URL.
    */

    const command =
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: product.r2Key
      });

    const r2Response =
      await r2Client.send(command);

    if (!r2Response.Body) {
      return res.status(500).send(
        "The product file could not be retrieved."
      );
    }

    /*
    ONE-TIME LOCK

    Only one request can successfully
    change this token from unused to used.
    */

    const updateResult =
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
      updateResult.rowCount !== 1
    ) {
      return res.status(403).send(
        "This download link has already been used."
      );
    }

    /*
    Remove token from browser.
    */

    res.clearCookie(
      "download_token",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/"
      }
    );

    /*
    Set download headers.
    */

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${product.downloadName}"`
    );

    /*
    Stream PDF directly from R2.
    */

    if (
      typeof r2Response.Body.pipe ===
      "function"
    ) {

      r2Response.Body.pipe(res);

    } else {

      const chunks = [];

      for await (
        const chunk of r2Response.Body
      ) {
        chunks.push(chunk);
      }

      const buffer =
        Buffer.concat(chunks);

      res.end(buffer);
    }

  } catch (error) {

    console.error(
      "Secure download error:",
      error
    );

    if (
      error.name ===
      "NoSuchKey"
    ) {
      return res.status(404).send(
        "The product file was not found in Cloudflare R2."
      );
    }

    res.status(500).send(
      "Unable to prepare the secure download."
    );
  }
});

/*
====================================================
HEALTH CHECK
====================================================
*/

app.get("/health", (req, res) => {

  res.json({
    status: "OK",
    message:
      "Earn Unlimited Funds server is running"
  });

});

/*
====================================================
START SERVER
====================================================
*/

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
      "Failed to initialize PostgreSQL:",
      error
    );

    process.exit(1);
  }
}

startServer();
