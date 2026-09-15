import express from "express";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

To add another product later, add another item here.

Example:

"facebook-automation": {
  id: "facebook-automation",
  name: "Facebook Automation",
  price: 15000,
  amount: 1500000,
  currency: "NGN",
  description: "Learn how to automate your Facebook marketing.",
  r2Key: "facebook-automation.pdf",
  downloadName: "Facebook-Automation.pdf"
}

price = amount customers see in Naira
amount = price in kobo for Paystack
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
DATABASE
====================================================
*/

const dbPath = path.join(__dirname, "store.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    product_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,
    reference TEXT NOT NULL,
    product_id TEXT NOT NULL,
    email TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

/*
====================================================
CLOUDFLARE R2
====================================================
*/

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  DOWNLOAD_SIGNING_SECRET,
  PAYSTACK_SECRET_KEY
} = process.env;

let r2Client = null;

if (
  R2_ACCOUNT_ID &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_BUCKET_NAME
) {
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
}

/*
====================================================
HELPER FUNCTIONS
====================================================
*/

function createDownloadToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getProduct(productId) {
  return PRODUCTS[productId] || null;
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

/*
====================================================
HOME PAGE
====================================================
*/

app.get("/", (req, res) => {
  res.sendFile(path.join(publicFolder, "hex.html"));
});

/*
====================================================
PRODUCT API
====================================================
*/

app.get("/api/products", (req, res) => {
  const products = Object.values(PRODUCTS).map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    currency: product.currency,
    description: product.description
  }));

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
PAYSTACK PAYMENT INITIALIZATION
====================================================
*/

app.post("/api/pay", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        message: "Paystack secret key is not configured."
      });
    }

    const { email, productId } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address."
      });
    }

    const product = getProduct(productId);

    if (!product) {
      return res.status(404).json({
        message: "Selected product was not found."
      });
    }

    const callbackUrl =
      "https://earn-unlimited-funds.onrender.com/payment-callback";

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
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
      console.error("Paystack initialize error:", data);

      return res.status(500).json({
        message: "Unable to initialize payment."
      });
    }

    const reference = data.data.reference;

    db.prepare(`
      INSERT OR REPLACE INTO payments
      (reference, email, product_id, amount, currency, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      reference,
      email,
      product.id,
      product.amount,
      product.currency,
      "pending",
      Date.now()
    );

    res.json({
      status: true,
      authorization_url: data.data.authorization_url,
      reference
    });
  } catch (error) {
    console.error("Payment initialization error:", error);

    res.status(500).json({
      message: "Something went wrong while starting payment."
    });
  }
});

/*
====================================================
PAYSTACK CALLBACK / PAYMENT VERIFICATION
====================================================
*/

app.get("/payment-callback", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).send("Paystack is not configured.");
    }

    const reference = req.query.reference || req.query.trxref;

    if (!reference) {
      return res.status(400).send("Payment reference is missing.");
    }

    const payment = db
      .prepare(
        "SELECT * FROM payments WHERE reference = ?"
      )
      .get(reference);

    if (!payment) {
      return res.status(400).send(
        "Payment record was not found."
      );
    }

    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const verifyData = await verifyResponse.json();

    if (!verifyResponse.ok || !verifyData.status) {
      return res.status(400).send(
        "Unable to verify payment."
      );
    }

    const transaction = verifyData.data;

    if (transaction.status !== "success") {
      return res.status(400).send(
        "Payment was not successful."
      );
    }

    /*
    Make sure the amount paid matches the product price.
    */

    if (transaction.amount !== payment.amount) {
      return res.status(400).send(
        "Payment amount does not match the product."
      );
    }

    if (
      String(transaction.currency).toUpperCase() !==
      String(payment.currency).toUpperCase()
    ) {
      return res.status(400).send(
        "Payment currency does not match."
      );
    }

    const product = getProduct(payment.product_id);

    if (!product) {
      return res.status(400).send(
        "The purchased product could not be found."
      );
    }

    /*
    Mark payment as successful.
    */

    db.prepare(`
      UPDATE payments
      SET status = 'success'
      WHERE reference = ?
    `).run(reference);

    /*
    Create a one-time download token.
    The token expires after 15 minutes.
    */

    const token = createDownloadToken();
    const tokenHash = hashToken(token);

    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000;

    db.prepare(`
      INSERT INTO downloads
      (token_hash, reference, product_id, email, used, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      tokenHash,
      reference,
      product.id,
      payment.email,
      0,
      now,
      expiresAt
    );

    /*
    Store the raw token only in the customer's browser.
    The database stores only the hash.
    */

    res.cookie("download_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/"
    });

    res.redirect("/payment-success.html");
  } catch (error) {
    console.error("Payment callback error:", error);

    res.status(500).send(
      "An error occurred while processing your payment."
    );
  }
});

/*
====================================================
ONE-TIME SECURE DOWNLOAD
====================================================
*/

app.get("/api/download", async (req, res) => {
  try {
    if (!r2Client) {
      return res.status(500).json({
        message: "R2 storage is not configured."
      });
    }

    if (!R2_BUCKET_NAME) {
      return res.status(500).json({
        message: "R2 bucket name is missing."
      });
    }

    const token = req.cookies?.download_token;

    /*
    Express does not read cookies automatically.
    We therefore read the Cookie header manually.
    */

    let downloadToken = null;

    const cookieHeader = req.headers.cookie || "";

    const cookieParts = cookieHeader.split(";");

    for (const part of cookieParts) {
      const [name, ...valueParts] = part.trim().split("=");

      if (name === "download_token") {
        downloadToken = decodeURIComponent(
          valueParts.join("=")
        );
        break;
      }
    }

    if (!downloadToken) {
      return res.status(403).send(
        "Download access denied. Please complete your purchase first."
      );
    }

    const tokenHash = hashToken(downloadToken);

    const download = db
      .prepare(`
        SELECT *
        FROM downloads
        WHERE token_hash = ?
      `)
      .get(tokenHash);

    if (!download) {
      return res.status(403).send(
        "Invalid download access."
      );
    }

    if (Date.now() > download.expires_at) {
      res.clearCookie("download_token", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/"
      });

      return res.status(403).send(
        "Download access has expired."
      );
    }

    if (download.used === 1) {
      return res.status(403).send(
        "This download link has already been used."
      );
    }

    const product = getProduct(download.product_id);

    if (!product) {
      return res.status(404).send(
        "Product not found."
      );
    }

    /*
    Confirm that the R2 object exists by creating
    a signed URL for the exact product key.
    */

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: product.r2Key,
      ResponseContentDisposition:
        `attachment; filename="${product.downloadName}"`,
      ResponseContentType: "application/pdf"
    });

    const signedUrl = await getSignedUrl(
      r2Client,
      command,
      {
        expiresIn: 300
      }
    );

    /*
    ONE-TIME USE:
    Mark the token as used only after the signed URL
    has been successfully created.
    */

    const update = db.prepare(`
      UPDATE downloads
      SET used = 1
      WHERE token_hash = ?
      AND used = 0
    `).run(tokenHash);

    if (update.changes !== 1) {
      return res.status(403).send(
        "This download link has already been used."
      );
    }

    /*
    Remove the browser token.
    */

    res.clearCookie("download_token", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/"
    });

    /*
    Redirect to the temporary R2 signed URL.
    */

    res.redirect(signedUrl);
  } catch (error) {
    console.error("Download error:", error);

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
    message: "Earn Unlimited Funds server is running"
  });
});

/*
====================================================
START SERVER
====================================================
*/

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Earn Unlimited Funds server running on port ${PORT}`
  );
});
