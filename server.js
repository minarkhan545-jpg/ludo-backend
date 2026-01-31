const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Frontend files serve করার জন্য (যদি একই ফোল্ডারে থাকে)

const DB_FILE = path.join(__dirname, 'database.json');

// Database Helper Functions
const readDB = () => {
    const data = fs.readFileSync(DB_FILE);
    return JSON.parse(data);
};

const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- AUTH APIS ---

// POST /api/register
app.post('/api/register', (req, res) => {
    const { name, mobile, email, password } = req.body;
    const db = readDB();

    // Check if user already exists
    if (db.users.find(u => u.mobile === mobile)) {
        return res.json({ success: false, message: 'Mobile number already registered' });
    }

    const newUser = {
        _id: Date.now().toString(),
        name,
        mobile,
        email,
        password,
        balance: 0 // Rule: Default balance 0
    };

    db.users.push(newUser);
    writeDB(db);
    res.json({ success: true, message: 'Registration successful' });
});

// POST /api/login
app.post('/api/login', (req, res) => {
    const { mobile, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.mobile === mobile && u.password === password);

    if (user) {
        return res.json({ success: true, user: { ...user, password: '' } }); // Don't send password
    }
    res.json({ success: false, message: 'Invalid mobile or password' });
});

// --- ADMIN AUTH ---

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const admin = db.admins.find(a => a.username === username && a.password === password);

    if (admin) {
        return res.json({ success: true, message: 'Admin login successful' });
    }
    res.json({ success: false, message: 'Invalid Admin Credentials' });
});

// --- USER DEPOSIT & WITHDRAW APIS ---

// POST /api/user/deposit
app.post('/api/user/deposit', (req, res) => {
    const { mobile, amount, method, transactionId } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.mobile === mobile);

    if (!user) return res.json({ success: false, message: 'User not found' });

    const newDeposit = {
        _id: Date.now().toString(),
        userId: user._id,
        userName: user.name,
        userMobile: user.mobile,
        amount: parseInt(amount),
        method,
        transactionId,
        status: 'pending', // Pending status
        date: new Date().toISOString()
    };

    db.deposits.push(newDeposit);
    writeDB(db);
    res.json({ success: true, message: 'Deposit request submitted. Wait for approval.' });
});

// POST /api/user/withdraw
app.post('/api/user/withdraw', (req, res) => {
    const { mobile, amount, method, paymentNumber } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.mobile === mobile);

    if (userIndex === -1) return res.json({ success: false, message: 'User not found' });

    const withdrawAmount = parseInt(amount);

    // Check Balance
    if (db.users[userIndex].balance < withdrawAmount) {
        return res.json({ success: false, message: 'Insufficient balance' });
    }

    // Deduct balance immediately (will refund if rejected)
    db.users[userIndex].balance -= withdrawAmount;

    const newWithdraw = {
        _id: Date.now().toString(),
        userId: db.users[userIndex]._id,
        userName: db.users[userIndex].name,
        userMobile: db.users[userIndex].mobile,
        amount: withdrawAmount,
        method,
        paymentNumber, // User's payment number
        status: 'pending', // Pending status
        date: new Date().toISOString()
    };

    db.withdraws.push(newWithdraw);
    writeDB(db);
    res.json({ success: true, message: 'Withdraw request submitted. Wait for approval.' });
});

// --- ADMIN MANAGEMENT APIS ---

// GET /api/admin/users
app.get('/api/admin/users', (req, res) => {
    const db = readDB();
    res.json({ success: true, users: db.users });
});

// POST /api/admin/user/balance
app.post('/api/admin/user/balance', (req, res) => {
    const { userId, balance } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u._id === userId);

    if (userIndex !== -1) {
        db.users[userIndex].balance = parseInt(balance);
        writeDB(db);
        res.json({ success: true, message: 'Balance updated' });
    } else {
        res.json({ success: false, message: 'User not found' });
    }
});

// POST /api/admin/user/delete
app.post('/api/admin/user/delete', (req, res) => {
    const { userId } = req.body;
    const db = readDB();
    db.users = db.users.filter(u => u._id !== userId);
    writeDB(db);
    res.json({ success: true, message: 'User deleted' });
});

// --- ADMIN FINANCE (DEPOSIT/WITHDRAW) ---

// GET /api/admin/deposits
app.get('/api/admin/deposits', (req, res) => {
    const db = readDB();
    // Return newest first
    const sortedDeposits = db.deposits.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, deposits: sortedDeposits });
});

// POST /api/admin/deposit/action
app.post('/api/admin/deposit/action', (req, res) => {
    const { depositId, action } = req.body; // action: 'approve' | 'reject'
    const db = readDB();
    
    const depositIndex = db.deposits.findIndex(d => d._id === depositId);
    if (depositIndex === -1) return res.json({ success: false, message: 'Deposit not found' });

    const deposit = db.deposits[depositIndex];

    if (deposit.status !== 'pending') {
        return res.json({ success: false, message: 'Already processed' });
    }

    if (action === 'approve') {
        const userIndex = db.users.findIndex(u => u._id === deposit.userId);
        if (userIndex !== -1) {
            db.users[userIndex].balance += deposit.amount;
            deposit.status = 'approved';
            writeDB(db);
            return res.json({ success: true, message: 'Deposit Approved & Balance Added' });
        }
    } else if (action === 'reject') {
        deposit.status = 'rejected';
        writeDB(db);
        return res.json({ success: true, message: 'Deposit Rejected' });
    }

    res.json({ success: false, message: 'Invalid action' });
});

// GET /api/admin/withdraws
app.get('/api/admin/withdraws', (req, res) => {
    const db = readDB();
    // Return newest first
    const sortedWithdraws = db.withdraws.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, withdraws: sortedWithdraws });
});

// POST /api/admin/withdraw/action
app.post('/api/admin/withdraw/action', (req, res) => {
    const { withdrawId, action } = req.body; // action: 'approve' | 'reject'
    const db = readDB();

    const withdrawIndex = db.withdraws.findIndex(w => w._id === withdrawId);
    if (withdrawIndex === -1) return res.json({ success: false, message: 'Withdraw not found' });

    const withdraw = db.withdraws[withdrawIndex];

    if (withdraw.status !== 'pending') {
        return res.json({ success: false, message: 'Already processed' });
    }

    if (action === 'approve') {
        withdraw.status = 'approved';
        writeDB(db);
        return res.json({ success: true, message: 'Withdraw Approved' });
    } else if (action === 'reject') {
        // Auto Refund Logic
        const userIndex = db.users.findIndex(u => u._id === withdraw.userId);
        if (userIndex !== -1) {
            db.users[userIndex].balance += withdraw.amount; // Refund
            withdraw.status = 'rejected';
            writeDB(db);
            return res.json({ success: true, message: 'Withdraw Rejected & Amount Refunded' });
        }
    }

    res.json({ success: false, message: 'Invalid action' });
});

// --- ADMIN SETTINGS (PAYMENT NUMBERS) ---

// GET /api/admin/settings (Optional helper for frontend to load numbers)
app.get('/api/admin/settings', (req, res) => {
    const db = readDB();
    res.json({ success: true, paymentNumbers: db.paymentNumbers });
});

// POST /api/admin/settings/numbers
app.post('/api/admin/settings/numbers', (req, res) => {
    const { bkash, nagad, rocket } = req.body;
    const db = readDB();

    if (bkash) db.paymentNumbers.bkash = bkash;
    if (nagad) db.paymentNumbers.nagad = nagad;
    if (rocket) db.paymentNumbers.rocket = rocket;

    writeDB(db);
    res.json({ success: true, message: 'Payment numbers updated', paymentNumbers: db.paymentNumbers });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
