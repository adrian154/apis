const config = require("../config.json");
const fetch = require("node-fetch");

const FILTERED_REQUEST_HEADERS = [
    "host", // host header will always be apis.bithole.dev
    "x-proxy-url", // no need to expose this
    "x-forwarded-for" 
];

const FILTERED_RESPONSE_HEADERS = [
    "content-encoding", // let fetch handle this
    "content-length", // (ditto)
    "access-control-allow-origin", // block CORS headers for obvious reasons
    "access-control-allow-methods",
    "access-control-allow-headers"
];

module.exports = (req, res, next) => {

    const url = req.query.url || req.header("X-Proxy-URL");
    if(!url) {
        return res.sendStatus(400);
    }

    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH");
    res.header("Access-Control-Allow-Headers", req.header("Access-Control-Request-Headers"));

    // preflights
    if(req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    const chunks = [];
    req.on("data", chunk => {
        chunks.push(chunk);
    });

    req.on("close", async () => {
        
        const data = chunks.length > 0 ? (typeof chunks[0] === "string" ? chunks.join("") : Buffer.concat(chunks)) : undefined;
        
        try {

            const resp = await fetch(url, {
                method: req.method,
                headers: Object.fromEntries(Object.entries(req.headers).filter(pair => !FILTERED_REQUEST_HEADERS.includes(pair[0].toLowerCase()))),
                body: data,
            });
            
            const headers = [...resp.headers.entries()].filter(entry => !FILTERED_RESPONSE_HEADERS.includes(entry[0].toLowerCase()));
            res.status(resp.status).set(Object.fromEntries(headers));

            // attach header overrides later
            for(const key in req.query) {
                if(key !== "url") {
                    res.header(key, req.query[key]);
                }
            }

            resp.body.pipe(res);

        } catch(error) {
            return res.sendStatus(500);
        }

    });

};