// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
require('dotenv').config();

const wallet = require('./wallet');
const matchmaking = require('./matchmaking');
const gameEngine = require('./gameEngine');

const app = express();
app.use(cors()); // CORS সক্ষম করা
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // সব ডোমেইন অ্যালাউ করবে
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // 1. Authentication
    socket.on('authenticate', (userProfile) => {
        // ফ্রন্টএন্ড থেকে পাওয়া প্রোফাইল চেক করা
        let user = wallet.getUser(userProfile.mobile);
        if (!user) {
            // নতুন ইউজার তৈরি
            user = wallet.createUser(userProfile);
            console.log(`New user created: ${userProfile.mobile}`);
        }
        
        // সকেটে ইউজার আইডি সেভ করা
        socket.data.userId = userProfile.mobile; 
        socket.data.user = user;
    });

    // 2. Matchmaking (Queue Join)
    socket.on('join_queue', ({ betAmount, players, user }) => {
        const player = {
            socketId: socket.id,
            betAmount,
            playerCount: players,
            user
        };

        // ম্যাচ খোঁজার চেষ্টা
        const room = matchmaking.addToQueue(player);

        if (room) {
            console.log(`Match found! Room: ${room.id}`);
            // গেম স্টেট ইনিশিয়ালাইজ করা
            room.state = gameEngine.createInitialState(room.players);
            
            // উভয় প্লেয়ারকে গেম স্টার্ট নোটিফিকেশন পাঠানো
            room.players.forEach(p => {
                io.to(p.socketId).emit('game_start', {
                    roomId: room.id,
                    playerColor: p.color,
                    players: room.players.map(pl => pl.color) // কালার লিস্ট পাঠানো
                });
            });
        } else {
            console.log("Waiting for opponent...");
            // ফ্রন্টএন্ড ৩০ সেকেন্ড অপেক্ট করবে, এরপর লোকাল AI খেলবে
        }
    });

    // 3. Roll Dice
    socket.on('roll_dice', ({ roomId }) => {
        const room = matchmaking.getRoom(roomId);
        if (!room) return;

        const currentTurnColor = room.players[room.state.turnIndex].color;
        
        // যাচাই করা এটি বর্তমান প্লেয়ারের পালা কিনা
        const player = room.players.find(p => p.socketId === socket.id);
        if (player.color !== currentTurnColor) return;

        // ডাইস রোল লজিক
        const roll = gameEngine.rollDice();
        room.state.diceValue = roll;

        // ৩ বার ৬ এর নিয়ম
        if (roll === 6) {
            room.state.consecutiveSixes++;
            if (room.state.consecutiveSixes === 3) {
                // টার্ন পরিবর্তন
                gameEngine.nextTurn(room);
                // সবাইকে জানানো
                io.to(roomId).emit('dice_result', {
                    color: currentTurnColor,
                    value: 6,
                    turnIndex: room.state.turnIndex,
                    consecutiveSixes: 3
                });
                io.to(roomId).emit('turn_change', { turnIndex: room.state.turnIndex });
                return;
            }
        } else {
            room.state.consecutiveSixes = 0;
        }

        // সবাইকে ডাইস রেজাল্ট পাঠানো
        io.to(roomId).emit('dice_result', {
            color: currentTurnColor,
            value: roll,
            turnIndex: room.state.turnIndex,
            consecutiveSixes: room.state.consecutiveSixes
        });
    });

    // 4. Move Token
    socket.on('move_token', ({ roomId, tokenId, diceValue }) => {
        const room = matchmaking.getRoom(roomId);
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        const currentTurnColor = room.players[room.state.turnIndex].color;

        if (player.color !== currentTurnColor) return;

        // মুভ এক্সিকিউট করা
        const result = gameEngine.executeMove(room, player.color, tokenId, diceValue);

        if (result.success) {
            // সবাইকে মুভ পাঠানো
            io.to(roomId).emit('token_moved', {
                color: player.color,
                tokenId: tokenId,
                newPos: result.newPos,
                status: result.status,
                killedInfo: result.killed
            });

            // জয় চেক করা
            if (gameEngine.checkWin(room)) {
                // টাকা হিসাব
                const winner = player.color;
                const totalPot = room.betAmount * room.players.length;
                const winnings = totalPot; // হাউস এজ কমানো হলে এখানে কমাবে

                // ওয়ালেট আপডেট
                room.players.forEach(p => {
                    if (p.color === winner) {
                        wallet.updateBalance(p.user.mobile, winnings);
                        io.to(p.socketId).emit('wallet_update', {
                            balance: wallet.getUser(p.user.mobile).balance,
                            type: 'WIN',
                            amount: winnings
                        });
                        io.to(p.socketId).emit('game_over', {
                            winner: p.color,
                            winnings: winnings,
                            newBalance: wallet.getUser(p.user.mobile).balance
                        });
                    } else {
                        // হারার প্লেয়ার
                        io.to(p.socketId).emit('wallet_update', {
                            balance: wallet.getUser(p.user.mobile).balance,
                            type: 'LOSE',
                            amount: room.betAmount
                        });
                        io.to(p.socketId).emit('game_over', {
                            winner: winner,
                            winnings: 0,
                            newBalance: wallet.getUser(p.user.mobile).balance
                        });
                    }
                });

                // রুম ডিলিট করা
                matchmaking.deleteRoom(roomId);

            } else {
                // অতিরিক্ত পালা চেক (৬ বা কিল পেলে)
                const gotSix = room.state.diceValue === 6;
                const gotKill = result.killed !== null;
                
                if (gotSix || gotKill) {
                    // একই প্লেয়ার আবার চালবে
                    // মেসেজ দিতে পারেন
                } else {
                    // পরবর্তী প্লেয়ারের পালা
                    const nextIdx = gameEngine.nextTurn(room);
                    io.to(roomId).emit('turn_change', { turnIndex: nextIdx });
                }
            }
        }
    });

    // 5. Wallet Requests (Deposit/Withdraw)
    socket.on('request_deposit', ({ amount, method, trxId }) => {
        if(!socket.data.userId) return;
        const req = wallet.addRequest('deposit', {
            userMobile: socket.data.userId,
            amount,
            method,
            trxId
        });
        // ফ্রন্টএন্ডে কনফার্মেশন দিন
        socket.emit('request_ack', { status: 'pending', id: req.id });
    });

    socket.on('request_withdraw', ({ amount, method, number }) => {
        if(!socket.data.userId) return;
        const user = wallet.getUser(socket.data.userId);
        
        if (user.balance < amount) {
            socket.emit('request_ack', { status: 'rejected', message: 'Insufficient balance' });
            return;
        }

        // ব্যালেন্স কমানো
        wallet.updateBalance(socket.data.userId, -amount);
        
        const req = wallet.addRequest('withdraw', {
            userMobile: socket.data.userId,
            amount,
            method,
            number
        });
        
        // ব্যালেন্স আপডেট নোটিফিকেশন পাঠানো
        socket.emit('wallet_update', { balance: user.balance - amount });
        socket.emit('request_ack', { status: 'pending', id: req.id });
    });

    // 6. Disconnect
    socket.on('disconnect', () => {
        console.log("User disconnected:", socket.id);
        // কিউ থেকে সরানো
        matchmaking.removeFromQueue(socket.id);
        // যদি কেউ রুমে ডিসকানেক্ট করে, তাকে হ্যান্ডেল করা (ফিউচার এডভান্সড)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
