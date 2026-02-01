// gameEngine.js

class GameEngine {
    constructor() {
        // লুডো কনস্ট্যান্ট
        this.colors = ['red', 'green', 'yellow', 'blue'];
        this.safeCells = [0, 8, 13, 21, 26, 34, 39, 47]; // গ্লোবাল ইনডেক্স
        this.startIndices = { red: 0, green: 13, yellow: 26, blue: 39 };
        this.homePathLimit = 56; // বোর্ডের শেষ স্থান
    }

    // নতুন রুমের জন্য স্টেট তৈরি করা
    createInitialState(players) {
        const board = {};
        players.forEach(p => {
            board[p.color] = Array.from({length:4}, (_,i)=>({
                id: i, 
                pos: -1, // -1 মানে টোকেন বেসে আছে
                status: 'base',
                justSpawned: false
            }));
        });
        return {
            board: board,
            turnIndex: 0,
            diceValue: 0,
            consecutiveSixes: 0
        };
    }

    // ডাইস রোল করা (সিম্পল ১-৬)
    rollDice() {
        return Math.floor(Math.random() * 6) + 1;
    }

    // পরবর্তী পালা পরিবর্তন করা
    nextTurn(room) {
        const maxIndex = room.players.length - 1;
        let nextIndex = room.state.turnIndex + 1;
        if (nextIndex > maxIndex) nextIndex = 0;
        
        room.state.turnIndex = nextIndex;
        room.state.diceValue = 0;
        room.state.consecutiveSixes = 0;
        return nextIndex;
    }

    // টোকেন মুভ ভ্যালিডেট করা এবং রান করা
    executeMove(room, color, tokenId, diceValue) {
        const token = room.state.board[color].find(t => t.id === tokenId);
        if (!token) return { success: false, message: "Token not found" };

        // লজিক ১: বেস থেকে বোর্ডে বের হওয়া
        if (token.status === 'base') {
            if (diceValue !== 6) return { success: false, message: "Need 6 to open" };
            token.status = 'track';
            token.pos = 0;
            token.justSpawned = true;
            return { success: true, newPos: 0, status: 'track', killed: null };
        }

        // লজিক ২: ট্র্যাকে চলা
        if (token.status === 'track') {
            // ৫৬ স্টেপ অতিক্রম করা যাবে না
            if (token.pos + diceValue > 56) {
                 return { success: false, message: "Move exceeds home limit" };
            }
            
            // এক ধাপে চলার জন্য আমরা এখানে সিম্পল ম্যাথ ব্যবহার করছি
            token.pos += diceValue;

            // জয় চেক করা
            if (token.pos === 56) {
                token.status = 'finished';
                return { success: true, newPos: 56, status: 'finished', killed: null };
            }

            // কিল (Cut) চেক করা
            const globalIdx = (this.startIndices[color] + token.pos) % 52;
            let killedInfo = null;

            // যদি সেফ জোন না হয় এবং নতুন স্পন না হয়
            if (!this.safeCells.includes(globalIdx) && !token.justSpawned) {
                // বিপক্ষ খোঁজা
                for (let otherColor of this.colors) {
                    if (otherColor === color) continue;
                    const enemies = room.state.board[otherColor];
                    enemies.forEach(enemy => {
                        if (enemy.status === 'track') {
                            const enemyGlobal = (this.startIndices[otherColor] + enemy.pos) % 52;
                            if (enemyGlobal === globalIdx) {
                                // কিল!
                                enemy.status = 'base';
                                enemy.pos = -1;
                                killedInfo = { color: otherColor, tokenId: enemy.id };
                            }
                        }
                    });
                }
            }

            token.justSpawned = false;
            return { success: true, newPos: token.pos, status: 'track', killed: killedInfo };
        }

        return { success: false, message: "Invalid move" };
    }

    // সম্পূর্ণ গেম জয় চেক করা
    checkWin(room) {
        const currentColor = room.players[room.state.turnIndex].color;
        const tokens = room.state.board[currentColor];
        // যদি ৪টি টোকেনই হোমে (Finished) পৌঁছে যায়
        return tokens.every(t => t.status === 'finished');
    }
}

module.exports = new GameEngine();
