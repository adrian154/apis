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