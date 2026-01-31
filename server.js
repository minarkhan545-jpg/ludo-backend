const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = 'database.json';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Helper: Read Database
const readDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [],
            admins: [
                { username: "admin", password: "admin123" },
                { username: "Arman270", password: "Arman999" }
            ],
            deposits: [],
            withdraws: [],
            paymentNumbers: {
                bkash: "01710814750",
                nagad: "01710814750",
                rocket: "01710814750"
            }
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
    const data = fs.readFileSync(DB_FILE);
    return JSON.parse(data);
};

// Helper: Write Database
const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- ROUTES ---

// 1. User Register (Default Balance 0)
app.post('/api/register', (req, res) => {
    const { name, mobile, email, password } = req.body;
    const db = readDB();
    
    // Clean mobile number (format: +88 logic)
    const cleaned = ('' + req.body.mobile).replace(/\D/g, '');
    if (cleaned.startsWith('0')) { cleaned = '88' + cleaned; }
    if (cleaned.startsWith('88')) { return cleaned; }
    if (cleaned.length > 0) {
        return '88' + cleaned;
    }
    return cleaned;
});

// Check duplicate mobile
const exists = db.users.find(u => u.mobile === cleaned);
if (exists) {
    return res.json({ success: false, message: "Mobile number already registered" });
}

const newUser = {
    _id: Date.now().toString(),
    name,
    mobile,
    email: email || 'N/A',
    password,
    balance: 0 // Default 0 as per your request
};

db.users.push(newUser);
writeDB(db);

res.json({ success: true, message: "Registration successful" });
});

// 2. User Login
app.post('/api/login', (req, res) => {
    const { mobile, password } = req.body;
    const db = readDB();

    const user = db.users.find(u => u.mobile === mobile && u.password === password);

    if (user) {
        res.json({ success: true, user: user });
    } else {
        res.json({ success: false, message: "Invalid mobile or password" });
    }
});

// 3. Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();

    const admin = db.admins.find(a => a.username === username && a.password === password);

    if (admin) {
        res.json({ success: true, message: "Admin login successful" });
    } else {
        res.json({ success: false, message: "Invalid admin credentials" });
    }
});

// 4. Get All Users (Admin)
app.get('/api/admin/users', (req, res) => {
    const db = readDB();
    res.json({ success: true, users: db.users });
});

// 5. Update User Balance (Admin)
app.post('/api/admin/user/balance', (req, res) => {
    const { userId, balance } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u._id === userId);

    if (userIndex !== -1) {
        db.users[userIndex].balance = parseInt(balance);
        writeDB(db);
        res.json({ success: true, message: "Balance updated" });
    } else {
        res.json({ success: false, message: "User not found" });
    }
});

// 6. Delete User (Admin)
app.post('/api/admin/user/delete', (req, res) => {
    const { userId } = req.body;
    const db = readDB();
    const initialLength = db.users.length;
    db.users = db.users.filter(u => u._id !== userId);

    if (db.users.length < initialLength) {
        writeDB(db);
        res.json({ success: true, message: "User deleted successfully" });
    } else {
        res.json({ success: false, message: "User not found" });
    }
});

/* =========================================
   NEW DEPOSIT/WITHDRAW SYSTEM
   ========================================================= */

// User Request Deposit
app.post('/api/user/deposit', (req, res) => {
    const { method, amount, transactionId, mobile } = req.body; // Frontend should send these fields
    const db = readDB();

    const user = db.users.find(u => u.mobile === mobile); // Find user
    
    if (!user) {
        return res.json({ success: false, message: "User not found" });
    }

    const newDeposit = {
        _id: Date.now().toString() + '_dep_' + Date.now(),
        userId: user._id,
        userName: user.name,
        userMobile: user.mobile,
        amount: parseInt(amount),
        method: method,
        transactionId,
        date: new Date().toLocaleString(),
        status: 'Pending'
    };

    db.deposits.push(newDeposit);
    writeDB(db);

    res.json({ success: true, message: "Deposit request submitted for review" });
});

// User Request Withdraw
app.post('/api/user/withdraw', (req, res) => {
    const { amount, method, paymentNumber, mobile } = req.body;
    const db = readDB();
    
    const user = db.users.find(u => u.mobile === mobile); // Identify user
    
    if (!user) {
        return res.json({ success: false, message: "User not found" });
    }
    
    // Check Balance
    if (parseInt(user.balance) < parseInt(amount)) {
        return res.json({ success: false, message: "Insufficient balance" });
    }

    // Deduct balance
    user.balance -= parseInt(amount);
    
    const newWithdraw = {
        _id: Date.now().toString() + '_with_' + Date.now(),
        userId: user._id,
        userName: user.name,
        userMobile: user.mobile,
        amount: parseInt(amount),
        method: method,
        paymentNumber: paymentNumber,
        status: 'Pending'
    };
    
    db.withdraws.push(newWithdraw);
    // Save user balance update
    // Find index
    const userIndex = db.users.findIndex(u => u.mobile === req.body.mobile);
    db.users[userIndex].balance = user.balance; // Update db.users array
    writeDB(db);

    res.json({ success: true, message: "Withdraw request submitted. Pending approval." });
});

// Admin Get Deposits
app.get('/api/admin/deposits', (req, res) => {
    const db = readDB();
    res.json({ success: true, deposits: db.deposits });
});

// Admin Get Withdraws
app.get('/api/admin/withdraws', (req, res) => {
    const db = readDB();
    res.json({ success: true, withdraws: db.withdraws });
});

// Admin Deposit Action (Approve / Reject)
app.post('/api/admin/deposit/action', (req, res) => {
    const { id, action } = req.body; // id is deposit ID (_id)
    const db = readDB();

    // Find Deposit
    const depositIndex = db.deposits.findIndex(d => d._id === id);
    if (depositIndex === -1) {
        return res.json({ success: false, message: "Transaction not found" });
    }
    const deposit = db.deposits[depositIndex];

    if (action === 'approve') {
        deposit.status = 'Approved';
        
        // Update User Balance
        const userIndex = db.users.findIndex(u => u._id === deposit.userId);
        if (userIndex !== -1) {
            db.users[userIndex].balance += parseInt(deposit.amount);
        }
        writeDB(db);
        res.json({ success: true, message: "Deposit Approved. Balance added." });

    } else if (action === 'reject') {
        deposit.status = 'Rejected';
        writeDB(db);
        res.json({ success: true, message: "Deposit Rejected." });
    }
});

// Admin Withdraw Action (Approve / Reject / Refund)
app.post('/api/admin/withdraw/action', (req, res) => {
    const { id, action } = req.body;
    const db = readDB();

    const withdrawIndex = db.withdraws.findIndex(w => w._id === id);
    if (withdrawIndex === -1) {
        return res.json({ success: false, message: "Withdraw request not found" });
    }
    const withdraw = db.withdraws[withdrawIndex];
    const userIndex = db.users.findIndex(u => u._id === withdraw.userId);

    if (action === 'approve') {
        withdraw.status = 'Approved'; // Withdraw success
        // User balance already deducted when requested, so nothing extra needed
        writeDB(db);
        res.json({ success: true, message: "Withdraw Approved successfully." });

    } else if (action === 'reject') {
        // Auto Refund
        if (userIndex !== -1) {
            db.users[userIndex].balance += parseInt(withdraw.amount);
            withdraw.status = 'Refunded';
        }
        writeDB(db);
        res.json({ success: true, message: "Withdraw rejected. Balance refunded." });
    }
});

// Admin Get Payment Numbers
app.get('/api/admin/payment-numbers', (req, res) => {
    const db = readDB();
    res.json({ success: true, paymentNumbers: db.paymentNumbers });
});

// Admin Update Payment Number
app.post('/api/admin/payment-number/update', (req, res) => {
    const { type, number } = req.body;
    const db = readDB();

    if (db.paymentNumbers[type]) {
        db.paymentNumbers[type] = number;
        writeDB(db);
        res.json({ success: true, message: `${type} number updated to ${number}` });
    } else {
        res.json({ success: false, message: "Invalid Type" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
