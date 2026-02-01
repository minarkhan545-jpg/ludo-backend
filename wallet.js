// wallet.js

class Wallet {
    constructor() {
        // ইন-মেমরি স্টোরেজ (সার্ভার রিস্টার্ট হলে ডাটা মুছে যাবে)
        this.users = {}; 
        this.requests = []; // Deposit/Withdraw requests
    }

    // ইউজার খোঁজা
    getUser(mobile) {
        return this.users[mobile];
    }

    // নতুন ইউজার তৈরি করা
    createUser(user) {
        // আগে ইউজার আছে কিনা চেক
        if (this.users[user.mobile]) return this.users[user.mobile];

        this.users[user.mobile] = {
            ...user,
            balance: 0,
            role: 'user',
            status: 'active',
            createdAt: new Date().toISOString()
        };
        return this.users[user.mobile];
    }

    // ব্যালেন্স আপডেট করা
    updateBalance(mobile, amount) {
        if (!this.users[mobile]) return false;
        this.users[mobile].balance += parseInt(amount);
        return this.users[mobile].balance;
    }

    // রিকোয়েস্ট যুক্ত করা (Deposit/Withdraw)
    addRequest(type, data) {
        const req = {
            id: Date.now(),
            type, // 'deposit' or 'withdraw'
            ...data,
            status: 'pending',
            date: new Date().toLocaleString()
        };
        this.requests.push(req);
        return req;
    }

    // পেন্ডিং রিকোয়েস্ট দেখা
    getPendingRequests() {
        return this.requests.filter(r => r.status === 'pending');
    }

    // রিকোয়েস্ট প্রসেস করা (Admin Approval/Reject)
    processRequest(id, status) { // status: 'approved', 'rejected'
        const reqIndex = this.requests.findIndex(r => r.id === id);
        if (reqIndex === -1) return null;
        
        const req = this.requests[reqIndex];
        req.status = status;

        // যদি Deposit Approved হয়
        if (status === 'approved' && req.type === 'deposit') {
            this.updateBalance(req.userMobile, parseInt(req.amount));
        }
        
        // Withdraw এর জন্য লজিক আগে থেকেই বালান্স কমানো হয়ে থাকবে রিকোয়েস্ট আসার আগে

        return req;
    }
}

module.exports = new Wallet();
