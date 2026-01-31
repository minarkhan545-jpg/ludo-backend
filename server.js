const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ludo_db';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// --- SCHEMAS ---

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    mobile: { type: String, required: true, unique: true },
    email: String,
    password: String,
    balance: { type: Number, default: 0 },
    transactions: [{
        type: String,
        amount: Number,
        note: String,
        time: String,
        status: { type: String, default: 'completed' } // pending, completed, rejected
    }],
    aiStats: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        totalGames: { type: Number, default: 0 },
        kills: { type: Number, default: 0 },
        deaths: { type: Number, default: 0 },
        aggressionScore: { type: Number, default: 50 },
        skillLevel: { type: String, default: 'New' }
    }
});

const User = mongoose.model('User', userSchema);

// System Settings Schema (for Merchant Number)
const settingsSchema = new mongoose.Schema({
    merchantNumber: { type: String, default: '01710814750' }
});
// We will keep only one document for settings
const Settings = mongoose.model('Settings', settingsSchema);

// --- HELPER FUNCTIONS ---

// Initialize Settings if not exists
const initializeSettings = async () => {
    const count = await Settings.countDocuments();
    if (count === 0) {
        await new Settings({ merchantNumber: '01710814750' }).save();
        console.log('⚙️ Default Settings Initialized');
    }
};
initializeSettings();

// --- ROUTES ---

// 1. Register
app.post('/api/register', async (req, res) => {
    try {
        const { name, mobile, email, password } = req.body;
        const existingUser = await User.findOne({ mobile });
        if (existingUser) return res.json({ success: false, message: 'Mobile already registered' });

        const newUser = new User({ name, mobile, email, password });
        await newUser.save();
        res.json({ success: true, message: 'Registration Successful' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 2. Login
app.post('/api/login', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        const user = await User.findOne({ mobile, password });
        if (!user) return res.json({ success: false, message: 'Invalid credentials' });

        // Send full user data back to sync frontend
        res.json({ success: true, user: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 3. Get User Profile (Balance & AI Stats)
app.post('/api/user/profile', async (req, res) => {
    try {
        const { mobile } = req.body;
        const user = await User.findOne({ mobile });
        if (!user) return res.json({ success: false, message: 'User not found' });
        res.json({ success: true, user: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 4. Deposit Request
app.post('/api/deposit', async (req, res) => {
    try {
        const { mobile, amount, trxId } = req.body;
        const user = await User.findOne({ mobile });
        if (!user) return res.json({ success: false, message: 'User not found' });

        // Add transaction as "pending" initially (or completed based on your logic)
        // For this demo, we assume admin approves or it's auto for gameplay? 
        // Usually manual check needed. Let's add as 'pending'.
        user.transactions.unshift({
            type: 'DEPOSIT',
            amount: amount,
            note: `TrxID: ${trxId}`,
            time: new Date().toLocaleString(),
            status: 'pending'
        });

        // DO NOT add to balance yet until Admin approves, 
        // BUT for gameplay flow requested, let's assume pending submission.
        // If you want immediate balance: user.balance += amount;
        
        await user.save();
        res.json({ success: true, message: 'Deposit request submitted', balance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 5. Withdraw Request
app.post('/api/withdraw', async (req, res) => {
    try {
        const { mobile, amount } = req.body;
        const user = await User.findOne({ mobile });
        if (!user) return res.json({ success: false, message: 'User not found' });
        
        if (user.balance < amount) return res.json({ success: false, message: 'Insufficient balance' });

        user.balance -= amount;
        user.transactions.unshift({
            type: 'WITHDRAW',
            amount: amount,
            note: 'Pending approval',
            time: new Date().toLocaleString(),
            status: 'pending'
        });
        await user.save();
        res.json({ success: true, message: 'Withdraw request submitted', balance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// 6. Game: Lock Bet
app.post('/api/game/bet', async (req, res) => {
    try {
        const { mobile, amount } = req.body;
        const user = await User.findOne({ mobile });
        if (!user) return res.json({ success: false });
        if (user.balance < amount) return res.json({ success: false });

        user.balance -= amount;
        user.transactions.unshift({
            type: 'BET',
            amount: amount,
            note: 'Match started',
            time: new Date().toLocaleString(),
            status: 'completed'
        });
        await user.save();
        res.json({ success: true, balance: user.balance });
    } catch (err) {
        res.json({ success: false });
    }
});

// 7. Game: Win / Lose
app.post('/api/game/result', async (req, res) => {
    try {
        const { mobile, result, amount } = req.body; // result: 'win' or 'lose'
        const user = await User.findOne({ mobile });
        if (!user) return res.json({ success: false });

        if (result === 'win') {
            const winAmount = amount * 2;
            user.balance += winAmount;
            user.transactions.unshift({
                type: 'WIN',
                amount: winAmount,
                note: 'Match win',
                time: new Date().toLocaleString(),
                status: 'completed'
            });
            // Update AI Stats
            if(user.aiStats) {
                user.aiStats.wins++;
                user.aiStats.totalGames++;
                user.aiStats.skillLevel = updateSkillLevel(user.aiStats);
            }
        } else {
            user.transactions.unshift({
                type: 'LOSE',
                amount: amount,
                note: 'Match lost',
                time: new Date().toLocaleString(),
                status: 'completed'
            });
            if(user.aiStats) {
                user.aiStats.losses++;
                user.aiStats.totalGames++;
                user.aiStats.skillLevel = updateSkillLevel(user.aiStats);
            }
        }
        await user.save();
        res.json({ success: true, balance: user.balance, aiStats: user.aiStats });
    } catch (err) {
        res.json({ success: false });
    }
});

function updateSkillLevel(stats) {
    const total = stats.wins + stats.losses;
    if (total === 0) return 'New';
    const rate = stats.wins / total;
    if (rate >= 0.6) return 'Pro';
    if (rate >= 0.35) return 'Medium';
    return 'New';
}

// --- ADMIN ROUTES ---

// Admin Login (Hardcoded for demo: admin/1234)
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

// Get All Users
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({});
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Update User Balance
app.post('/api/admin/user/balance', async (req, res) => {
    try {
        const { userId, balance } = req.body;
        await User.findByIdAndUpdate(userId, { balance });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false });
    }
});

// Delete User
app.post('/api/admin/user/delete', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.body.userId);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false });
    }
});

// Get System Settings (Merchant Number)
app.get('/api/admin/settings', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        res.json({ success: true, merchantNumber: settings.merchantNumber });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Update System Settings (Merchant Number)
app.post('/api/admin/settings', async (req, res) => {
    try {
        const { merchantNumber } = req.body;
        // Find the first settings doc and update
        await Settings.findOneAndUpdate({}, { merchantNumber });
        res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
