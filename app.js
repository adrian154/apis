const config = require("./config.json");
const express = require("express");

// create app and set up middlewares
const app = express();

if(config.proxy) {
    app.enable("trust proxy");
}

app.disable("x-powered-by");
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
});

app.use("/static", express.static("./static"));
app.use("/cors-proxy", require("./routes/cors-proxy.js"));

// register various routes
app.get("/", require("./routes/root.js"));
app.get("/ip", require("./routes/ip.js"));
app.get("/headers", require("./routes/headers.js"));
app.get("/embed", require("./routes/embed.js"));
app.get("/mc/ping-server", require("./routes/server-ping.js"));

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