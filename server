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
  res.sendFile(path.join(publicFolder, "hex.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Earn Unlimited Funds server is running"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
