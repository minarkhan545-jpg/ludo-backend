import express from "express";
import cors from "cors";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = "./database.json";

app.use(cors());
app.use(express.json());

const loadDB = () => JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const saveDB = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

/* ======================
   ADMIN LOGIN
====================== */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();

  const admin = db.admins?.find(
    a => a.username === username && a.password === password
  );

  if (!admin) return res.status(401).json({ error: "Invalid admin" });
  res.json({ success: true });
});

/* ======================
   GET ALL USERS
====================== */
app.get("/api/admin/users", (req, res) => {
  const db = loadDB();
  res.json(db.users);
});

/* ======================
   BAN / UNBAN USER
====================== */
app.post("/api/admin/user/status", (req, res) => {
  const { uid, status } = req.body;
  const db = loadDB();

  const user = db.users.find(u => u.id === uid);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.status = status; // active | banned
  saveDB(db);
  res.json({ success: true });
});

/* ======================
   DELETE USER
====================== */
app.post("/api/admin/user/delete", (req, res) => {
  const { uid } = req.body;
  const db = loadDB();

  db.users = db.users.filter(u => u.id !== uid);
  delete db.wallets[uid];

  saveDB(db);
  res.json({ success: true });
});

/* ======================
   ADMIN DEPOSIT / WITHDRAW
====================== */
app.post("/api/admin/wallet/update", (req, res) => {
  const { uid, amount, type } = req.body;
  const db = loadDB();
  const wallet = db.wallets[uid];

  if (!wallet) return res.status(404).json({ error: "Wallet not found" });

  if (type === "DEBIT" && wallet.balance < amount)
    return res.status(400).json({ error: "Insufficient balance" });

  wallet.balance += type === "CREDIT" ? amount : -amount;
  wallet.transactions.unshift({
    type,
    amount,
    note: "Admin action",
    time: new Date().toLocaleString()
  });

  saveDB(db);
  res.json({ balance: wallet.balance });
});

app.listen(PORT, () =>
  console.log("Admin Backend running on port " + PORT)
);
