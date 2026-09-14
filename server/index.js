import express from "express";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

const publicFolder = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicFolder));

/* ================================
   CLOUDFLARE R2 SETTINGS
================================ */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const R2_PRODUCT_KEY =
  process.env.R2_PRODUCT_KEY || "how-to-pass-high-in-exams.pdf";

const DOWNLOAD_SIGNING_SECRET =
  process.env.DOWNLOAD_SIGNING_SECRET;

/* ================================
   R2 CLIENT
================================ */

let r2Client = null;

if (
  R2_ACCOUNT_ID &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY
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

/* ================================
   CREATE DOWNLOAD TOKEN
================================ */

function createDownloadToken(reference) {
  if (!DOWNLOAD_SIGNING_SECRET) {
    throw new Error(
      "DOWNLOAD_SIGNING_SECRET is not configured."
    );
  }

  const expiresAt =
    Date.now() + 15 * 60 * 1000;

  const payload =
    `${reference}.${expiresAt}`;

  const signature =
    crypto
      .createHmac(
        "sha256",
        DOWNLOAD_SIGNING_SECRET
      )
      .update(payload)
      .digest("hex");

  return `${reference}.${expiresAt}.${signature}`;
}

/* ================================
   VERIFY DOWNLOAD TOKEN
================================ */

function verifyDownloadToken(token) {
  try {
    if (
      !token ||
      !DOWNLOAD_SIGNING_SECRET
    ) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [
      reference,
      expiresAt,
      signature
    ] = parts;

    if (
      !reference ||
      !expiresAt ||
      !signature
    ) {
      return null;
    }

    if (
      Date.now() > Number(expiresAt)
    ) {
      return null;
    }

    const payload =
      `${reference}.${expiresAt}`;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          DOWNLOAD_SIGNING_SECRET
        )
        .update(payload)
        .digest("hex");

    if (
      signature.length !==
      expectedSignature.length
    ) {
      return null;
    }

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null;
    }

    return reference;

  } catch (error) {
    console.error(
      "Download token verification error:",
      error
    );

    return null;
  }
}

/* ================================
   HOME PAGE
================================ */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      publicFolder,
      "index.html"
    )
  );
});

/* ================================
   INITIALIZE PAYSTACK PAYMENT
================================ */

app.post("/api/pay", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message:
          "Email address is required."
      });
    }

    const secretKey =
      process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        message:
          "Paystack secret key is not configured."
      });
    }

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${secretKey}`,
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          email,
          amount: 2500000,
          currency: "NGN",
          callback_url:
            "https://earn-unlimited-funds.onrender.com/payment-callback"
        })
      }
    );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.status ||
      !data.data
    ) {
      return res.status(400).json({
        message:
          data.message ||
          "Unable to initialize payment."
      });
    }

    res.json({
      authorization_url:
        data.data.authorization_url,
      reference:
        data.data.reference
    });

  } catch (error) {
    console.error(
      "Paystack initialization error:",
      error
    );

    res.status(500).json({
      message:
        "Payment service is temporarily unavailable."
    });
  }
});

/* ================================
   PAYSTACK CALLBACK
   VERIFY PAYMENT
   CREATE DOWNLOAD ACCESS
================================ */

app.get(
  "/payment-callback",
  async (req, res) => {
    try {
      const reference =
        req.query.reference ||
        req.query.trxref;

      console.log(
        "Paystack callback:",
        req.query
      );

      if (!reference) {
        return res.status(400).send(`
          <h1>Payment reference is missing</h1>
          <p>Please contact support if money was deducted.</p>
        `);
      }

      const secretKey =
        process.env.PAYSTACK_SECRET_KEY;

      if (!secretKey) {
        return res.status(500).send(
          "Payment verification is not configured."
        );
      }

      const response =
        await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
          {
            method: "GET",
            headers: {
              Authorization:
                `Bearer ${secretKey}`,
              "Content-Type":
                "application/json"
            }
          }
        );

      const data =
        await response.json();

      console.log(
        "Paystack verification:",
        data
      );

      if (
        !response.ok ||
        !data.status ||
        !data.data ||
        data.data.status !==
          "success" ||
        Number(data.data.amount) !==
          2500000 ||
        data.data.currency !==
          "NGN"
      ) {
        return res.status(400).send(`
          <h1>Payment could not be verified</h1>
          <p>Please contact support if money was deducted.</p>
        `);
      }

      /*
       * Payment is verified.
       * Create secure 15-minute download access.
       */

      const downloadToken =
        createDownloadToken(
          reference
        );

      res.setHeader(
        "Set-Cookie",
        `download_token=${encodeURIComponent(downloadToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`
      );

      res.redirect(
        "/payment-success.html"
      );

    } catch (error) {
      console.error(
        "Paystack verification error:",
        error
      );

      res.status(500).send(`
        <h1>Payment verification failed</h1>
        <p>Please contact support.</p>
      `);
    }
  }
);

/* ================================
   SECURE R2 DOWNLOAD
================================ */

app.get(
  "/api/download",
  async (req, res) => {
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

      const cookieHeader =
        req.headers.cookie || "";

      const match =
        cookieHeader.match(
          /(?:^|;\s*)download_token=([^;]+)/
        );

      if (!match) {
        return res.status(403).json({
          message:
            "Download access denied. Please complete a verified purchase."
        });
      }

      const token =
        decodeURIComponent(
          match[1]
        );

      const reference =
        verifyDownloadToken(
          token
        );

      if (!reference) {
        return res.status(403).json({
          message:
            "Download access has expired."
        });
      }

      /*
       * Create a temporary R2 signed URL.
       * It expires after 5 minutes.
       */

      const command =
        new GetObjectCommand({
          Bucket:
            R2_BUCKET_NAME,

          Key:
            R2_PRODUCT_KEY,

          ResponseContentDisposition:
            'attachment; filename="How-to-Pass-High-in-Exams.pdf"',

          ResponseContentType:
            "application/pdf"
        });

      const downloadUrl =
        await getSignedUrl(
          r2Client,
          command,
          {
            expiresIn: 300
          }
        );

      /*
       * Redirect to temporary
       * protected R2 URL.
       */

      res.redirect(
        downloadUrl
      );

    } catch (error) {
      console.error(
        "Secure download error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to prepare your download."
      });
    }
  }
);

/* ================================
   HEALTH CHECK
================================ */

app.get(
  "/health",
  (req, res) => {
    res.json({
      status: "OK",
      message:
        "Earn Unlimited Funds server is running"
    });
  }
);

/* ================================
   START SERVER
================================ */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);
