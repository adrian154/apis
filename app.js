const config = require("./config.json");
const express = require("express");
const Cache = require("./cache.js");

// create app and set up middlewares
const app = express();
const pingCache = new Cache(1024, 60);

if(config.proxy) {
    app.enable("trust proxy");
}

app.disable("x-powered-by");
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    req.pingCache = pingCache;
    if(req.method == "OPTIONS") {
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH");
        res.header("Access-Control-Allow-Headers", req.header("Access-Control-Request-Headers"));
        res.sendStatus(204);
        return;
    }
    next();
});

app.use("/", express.static("./static"));
app.use("/cors-proxy", require("./routes/cors-proxy.js"));

// register various routes
app.get("/ip", require("./routes/ip.js"));
app.get("/embed", require("./routes/embed.js"));
app.get("/headers", require("./routes/headers.js"));
app.get("/dns-query", require("./routes/dns-query.js"));
app.get("/mc/ping-server", require("./routes/server-ping.js"));
app.get("/mc/server-icon", require("./routes/server-icon.js"));
app.get("/dns-query-addrs", require("./routes/dns-query-addrs"));

/* SILLY SHIT ----------------------------------------------------------------*/
const os = require("os");

// jukebox
let curSong = null;
app.get("/song", (req, res) => res.json(curSong));
app.post("/song", (req, res) => {
    if(req.query.key !== config.setSongKey) {
        return res.sendStatus(403);
    }
    curSong = {
        artist: req.query.artist,
        title: req.query.title,
        iconUrl: req.query.iconUrl,
        songUrl: req.query.songUrl
    };
    res.sendStatus(200);
});

// uptime
app.get("/uptime", (req, res) => res.json(os.uptime()));

/* HANADRAIN SHIT ------------------------------------------------------------*/

const Database = require("better-sqlite3");
const db = new Database("hanadrain.db");

db.exec(`CREATE TABLE IF NOT EXISTS drawings (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    data TEXT NOT NULL,
    ip TEXT NOT NULL
)`);

const insertDrawingStmt = db.prepare("INSERT INTO drawings (x, y, data, ip) VALUES (?, ?, ?, ?)");
const selectAllStmt = db.prepare("SELECT x, y, data FROM drawings");

app.post("/hanadrain/corkboard", (req, res) => {
    const x = Number(req.body.x) || 0,
          y = Number(req.body.y) || 0,
          data = String(req.body.data);
    if(data.length > 300_000 || !data.match(/^data:image\/png;base64,[a-zA-Z0-9\+\/=]+$/)) {
        res.sendStatus(400);
        return;
    }
    insertDrawingStmt.run(x, y, data, req.ip);
    res.sendStatus(200);
});

app.get("/hanadrain/corkboard", (req, res) => {
    res.status(200).json(selectAllStmt.all());
});

/* ---------------------------------------------------------------------------*/

// error handler routes
app.use((req, res, next) => {
    res.sendStatus(404);
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send("Uh oh, something really bad happened.");
});

app.listen(config.port, () => {
    console.log("Started listening on port " + config.port);
});