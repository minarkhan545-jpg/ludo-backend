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

app.post("/api/register", (req, res) => {
  const { name, mobile, email, password } = req.body;
  if (!name || !mobile || !password)
    return res.status(400).json({ error: "Missing fields" });

  const db = loadDB();
  if (db.users.find(u => u.mobile === mobile))
    return res.status(400).json({ error: "Mobile already registered" });

  const user = {
    id: "user_" + Date.now(),
    name,
    mobile,
    email,
    password
  };

  db.users.push(user);
  db.wallets[user.id] = { balance: 0, transactions: [] };
  saveDB(db);

  res.json({ user });
});

app.post("/api/login", (req, res) => {
  const { mobile, password } = req.body;
  const db = loadDB();

  const user = db.users.find(
    u => u.mobile === mobile && u.password === password
  );

  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ user });
});

app.get("/api/wallet/:uid", (req, res) => {
  const db = loadDB();
  const wallet = db.wallets[req.params.uid];
  if (!wallet) return res.status(404).json({ error: "Wallet not found" });
  res.json(wallet);
});

app.post("/api/wallet/update", (req, res) => {
  const { uid, type, amount, note } = req.body;
  const db = loadDB();
  const wallet = db.wallets[uid];
  if (!wallet) return res.status(404).json({ error: "Wallet not found" });

  if (type === "DEBIT" && wallet.balance < amount)
    return res.status(400).json({ error: "Insufficient balance" });

  wallet.balance += type === "CREDIT" ? amount : -amount;
  wallet.transactions.unshift({
    type,
    amount,
    note,
    time: new Date().toLocaleString()
  });

  saveDB(db);
  res.json({ balance: wallet.balance });
});

app.listen(PORT, () =>
  console.log("Backend running on port " + PORT)
);
