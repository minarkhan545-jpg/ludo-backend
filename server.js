const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const DB = "./database.json";

function readDB(){
  return JSON.parse(fs.readFileSync(DB));
}
function writeDB(data){
  fs.writeFileSync(DB, JSON.stringify(data,null,2));
}

/* =====================
   USER REGISTER
===================== */
app.post("/api/register",(req,res)=>{
  const { name, mobile, email, password } = req.body;
  if(!name || !mobile || !password){
    return res.json({ error:"Missing fields" });
  }

  const db = readDB();
  if(db.users.find(u=>u.mobile===mobile)){
    return res.json({ error:"User already exists" });
  }

  const user = {
    id: Date.now().toString(),
    name,
    mobile,
    email: email || "",
    password,
    status:"active",
    balance:0
  };

  db.users.push(user);
  writeDB(db);
  res.json({ success:true });
});

/* =====================
   USER LOGIN
===================== */
app.post("/api/login",(req,res)=>{
  const { mobile, password } = req.body;
  const db = readDB();

  const user = db.users.find(
    u=>u.mobile===mobile && u.password===password
  );

  if(!user) return res.json({ error:"Invalid login" });
  if(user.status==="banned") return res.json({ error:"Banned" });

  res.json({ success:true, user });
});

/* =====================
   ADMIN LOGIN
===================== */
app.post("/api/admin/login",(req,res)=>{
  const { username, password } = req.body;
  const db = readDB();

  const admin = db.admins.find(
    a=>a.username===username && a.password===password
  );

  if(!admin) return res.json({ success:false });
  res.json({ success:true });
});

/* =====================
   ADMIN USERS LIST
===================== */
app.get("/api/admin/users",(req,res)=>{
  const db = readDB();
  res.json(db.users);
});

/* =====================
   BAN / UNBAN
===================== */
app.post("/api/admin/user/status",(req,res)=>{
  const { uid, status } = req.body;
  const db = readDB();

  const user = db.users.find(u=>u.id===uid);
  if(user) user.status = status;

  writeDB(db);
  res.json({ success:true });
});

/* =====================
   DELETE USER
===================== */
app.post("/api/admin/user/delete",(req,res)=>{
  const { uid } = req.body;
  const db = readDB();

  db.users = db.users.filter(u=>u.id!==uid);
  writeDB(db);
  res.json({ success:true });
});

/* ===================== */
app.listen(3000,()=>console.log("Backend running"));
