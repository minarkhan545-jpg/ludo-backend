// matchmaking.js

class Matchmaking {
    constructor() {
        this.queue = []; // { socketId, betAmount, playerCount, user }
        this.rooms = {}; // { roomId: { players: [], state: {} } }
    }

    addToQueue(player) {
        // কিউতে প্লেয়ার যুক্ত করা
        this.queue.push(player);
        
        // ম্যাচ খোঁজার চেষ্টা
        return this.findMatch(player);
    }

    removeFromQueue(socketId) {
        // ডিসকানেক্ট হলে কিউ থেকে সরানো
        this.queue = this.queue.filter(p => p.socketId !== socketId);
    }

    findMatch(player) {
        // একই বেট (Bet) এবং একই প্লেয়ার কাউন্ট খোঁজা
        const matches = this.queue.filter(p => 
            p.socketId !== player.socketId && 
            p.betAmount === player.betAmount && 
            p.playerCount === player.playerCount
        );

        if (matches.length > 0) {
            // একটি অপোনেন্ট পেয়ে গেম তৈরি করা
            const opponent = matches[0];
            return this.createRoom([player, opponent], player.playerCount);
        }

        return null; // ম্যাচ পাওয়া যায়নি
    }

    createRoom(players, playerCount) {
        const roomId = 'room_' + Date.now() + Math.random().toString(36).substr(2, 5);
        
        // কালার অ্যাসাইন করা
        const colors = ['red', 'green', 'yellow', 'blue'];
        const roomPlayers = [];
        
        players.forEach((p, index) => {
            roomPlayers.push({
                socketId: p.socketId,
                user: p.user,
                color: colors[index % 4], // ৪ জন পর্যন্ত লুপ করে কালার দিবে
                isAI: false
            });
        });

        // যদি ২ প্লেয়ার খেলা এবং আরও ২ জন প্লেয়ার লাগলে মানুষ (AI) যুক্ত করা (Optional)
        // সাধারণত রেডিমাচমেকিং এ এটি করা হয় না, কিন্তু আমরা এখানে ২ জনের জন্য রিটার্ন করছি
        if (playerCount === 2) {
             // শুধু ২ প্লেয়ার নিয়ে রুম তৈরি করা হলো
        }

        // কিউ থেকে দুইজনকেই সরানো
        this.removeFromQueue(players[0].socketId);
        this.removeFromQueue(players[1].socketId);

        const room = {
            id: roomId,
            players: roomPlayers,
            betAmount: players[0].betAmount,
            turnIndex: 0,
            status: 'active'
        };

        this.rooms[roomId] = room;
        return room;
    }

    getRoom(roomId) {
        return this.rooms[roomId];
    }

    deleteRoom(roomId) {
        delete this.rooms[roomId];
    }
}

module.exports = new Matchmaking();
