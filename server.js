const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = 'database.json';

// Middleware
app.use(cors()); // Allow all origins for simplicity
app.use(bodyParser.json());

// Helper: Read Database
const readDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        // Initial DB if not exists
        const initialData = {
            users: [],
            admins: [
                { username: "admin", password: "admin123" }, // Default Admin
                { username: "Arman270", password: "Arman999" } // User's Requested Admin
            ]
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

// 1. User Register
app.post('/api/register', (req, res) => {
    const { name, mobile, email, password } = req.body;
    const db = readDB();

    // Validation
    if (!name || !mobile || !password) {
        return res.json({ success: false, message: "Missing required fields" });
    }

    // Check Duplicate
    const exists = db.users.find(u => u.mobile === mobile);
    if (exists) {
        return res.json({ success: false, message: "Mobile number already registered" });
    }

    // Create User
    const newUser = {
        _id: Date.now().toString(),
        name,
        mobile,
        email: email || 'N/A',
        password,
        balance: 5000, // Initial Bonus
        joined: new Date().toISOString()
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
        // Return user data (excluding password if needed, but keeping simple here)
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

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
