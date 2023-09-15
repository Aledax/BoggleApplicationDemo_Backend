// BOGGLE STUFF

// Letter categories
const allLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
const rareLetters = ["I", "U", "Y", "W", "K", "V", "X", "Z", "J", "Q"];

// Letter frequencies
const vowelFrequencies = {"E": 11.1607, "A": 8.4966, "I": 7.5448, "O": 7.1635, "U": 3.6308}
const consonantFrequencies = {"R": 7.5809, "T": 6.9509, "N": 6.6544, "S": 5.7351, "L": 5.4893,
                "C": 4.5388, "D": 3.3844, "P": 3.1671, "M": 3.0129, "H": 3.0034,
                "G": 2.4705, "B": 2.0720, "F": 1.8121, "Y": 1.7779, "W": 1.2899,
                "K": 1.1016, "V": 1.0074, "X": 0.2902, "Z": 0.2722, "J": 0.1965,
                "Q": 0.1962};

// Letter frequency sums
let vowelFreqSum = 0;
let consonantFreqSum = 0;
for (const letter in vowelFrequencies) { vowelFreqSum += vowelFrequencies[letter]; }
for (const letter in consonantFrequencies) { consonantFreqSum += consonantFrequencies[letter]; }

// Letter generation
const generateLetter = (isVowel) => {
    let val = Math.random() * (isVowel ? vowelFreqSum : consonantFreqSum);
    for (const letter in (isVowel ? vowelFrequencies : consonantFrequencies)) {
        if (val <= (isVowel ? vowelFrequencies : consonantFrequencies)[letter]) return letter;
        val -= (isVowel ? vowelFrequencies : consonantFrequencies)[letter];
    }
    console.log("Error in generating letter");
    return undefined
}

// Board generation
const generateBoard = () => {

    // Setup (board array, vowel positions, and letter counts)
    let board = [];
    let vowelColumns = [0, 1, 2].sort(() => (Math.random() > 0.5) ? 1 : -1);
    let letterCounts = Object.fromEntries(allLetters.map(k => [k, 0]));
    let hasRareConsonant = false;
    let hasDouble = false;

    // Filling spaces
    for (let r = 0; r < 3; r++) {
        let row = [];
        for (let c = 0; c < 3; c++) {
            do {
                var letter = generateLetter(c == vowelColumns[r]);
            } while (letterCounts[letter] == 2 || (letterCounts[letter] == 1 && hasDouble) || (rareLetters.includes(letter) && hasRareConsonant));
            letterCounts[letter]++;
            if (rareLetters.includes(letter)) hasRareConsonant = true;
            if (letterCounts[letter] == 2) hasDouble = true;
            row.push(letter);
        }
        board.push(row);
    }

    console.log(board);
    return board;
}

// SERVER STUFF

// Import and create the express interface
var express = require("express");
var app = express();

// Get MongoDB object
const {MongoClient} = require("mongodb")
const mongoURI = "mongodb://localhost:27017"
const mongoClient = new MongoClient(mongoURI)

// For getting server IP address
const IP = require('ip');

// For daily updates
const schedule = require('node-schedule');

// Tell all callbacks to use JSON formatting
app.use(express.json());

// Callbacks for Button 3 (Server Info)
app.get("/info/ip", (req, res) => {
    res.send(JSON.stringify({"message": IP.address()}));
});

app.get("/info/time", (req, res) => {
    const date = new Date();
    res.send(JSON.stringify({"message": date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds()}));
});

app.get("/info/name", (req, res) => {
    res.send(JSON.stringify({"message": "Alex Day"}));
});

// Callbacks for Button 4 (Boggle)

const getDate = () => {
    let date = new Date();
    return date.getFullYear().toString() + '-' +
        String(date.getMonth()).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

app.get("/boggle/board", async (req, res) => {
    // Get the current board and send it
    const board = await mongoClient.db("boggle").collection("board").findOne({"key": "board"});
    res.send(JSON.stringify({"type": "board", "board": board["value"], "date": getDate()}));
});

app.post("/boggle/score", async (req, res) => {
    // Add the score to the scores database, and update histogram
    await mongoClient.db("boggle").collection("scores").insertOne(req.body);
    await mongoClient.db("boggle").collection("histogram").updateOne(
        { "range": Math.floor(req.body["score"] / 10) * 10 },
        { $inc: { "count": 1 } },
        { upsert: true });

    // Get the percentile and send it back
    var numAbove = 0;
    var numScores = 0;
    await mongoClient.db("boggle").collection("scores").find().forEach(score => {
        if (score["score"] > req.body["score"]) numAbove += 1;
        numScores += 1;
    });
    if (numAbove != 0) {
        res.send(JSON.stringify({"type": "percentile", "percentile": Math.round(numAbove / numScores * 100)}));
    } else {
        res.send(JSON.stringify({"type": "win"}));
    }
})

// Automatically create new boards

const updateBoardJob = schedule.scheduleJob('0 * * * *', async () => {
    await uploadBoard();
});

const uploadBoard = async () => {
    let board = generateBoard();
    let boardCSV = board.map(row => row.toString()).join("\n");
    
    await mongoClient.db("boggle").collection("board").replaceOne(
        { "key": "board" },
        { "key": "board", "value": boardCSV },
        { upsert: true });
    await mongoClient.db("boggle").collection("scores").deleteMany();
    await mongoClient.db("boggle").collection("histogram").deleteMany();

    console.log("Uploaded new board!");
}

async function run() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to the database");

        uploadBoard();

        var server = app.listen(8081, (req, res) => {
            var host = server.address().address;
            var port = server.address().port;
            console.log(IP.address());
            console.log("Server successfully running at http://%s:%s", host, port);
        });
    } catch (err) {
        console.log(err);
        await mongoClient.close();
    }
}

run();