const bodyParser = require("body-parser");
const config = require("./config.json");
const fetch = require("node-fetch");
const express = require("express");

// create app and set up middlewares
const app = express();

if(config.proxy) {
    app.enable("trust proxy");
}

app.disable("x-powered-by");
app.use(express.json());

app.use((req, res, next) => {

    // log access
    console.log(`${req.ip}: ${req.path}`);    
    
    // attach various headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();

});

app.use("/cors-proxy", (req, res, next) => {
    if(typeof req.query.url == "string") {
        
        const url = new URL(req.query.url);
        const chunks = [];
        req.on("data", chunk => {
            chunks.push(chuk);
        });

        req.on("close", async () => {
            
            const data = chunks.length > 0 ? (typeof chunks[0] === "string" ? chunks.join("") : Buffer.concat(chunks)) : undefined;
            const resp = await fetch(req.query.url, {
                method: req.method,
                headers: {...req.headers, host: url.hostname},
                body: data
            });
            
            // filter out headers like Content-Encoding that throw off the client
            const headers = [...resp.headers.entries()].filter(entry => !["content-encoding"].includes(entry[0].toLowerCase()));

            res.status(resp.status).set(Object.fromEntries(headers));
            resp.body.pipe(res);

        });

    } else {
        res.sendStatus(400);
    }
});

// register various routes
app.get("/", require("./routes/root.js"));
app.get("/mc/ping-server", require("./routes/server-ping.js"));

// error handler routes
app.use((req, res, next) => {
    res.sendStatus(404);
});

app.use((err, req, res, next) => {
    res.status(500).send("Uh oh, something really bad happened.");
});

app.listen(config.port, () => {
    console.log("Started listening on port " + config.port);
});