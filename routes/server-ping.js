const MC = require("node-mc-api");

// awful cache
const MAX_CACHE_SIZE = 100;
const MAX_CACHE_AGE = 60 * 1000;

const cache = {};
const keys = [];

const cacheValue = (key, value) => {
    value.cacheTime = Date.now();
    cache[key] = value;
    keys.push(key);
    if(keys.length > MAX_CACHE_SIZE) {
        delete cache[keys.shift()];
    }
};

module.exports = async (req, res) => {
    if(typeof req.query.host == "string") {
        
        const host = req.query.host;
        const port = Number(req.query.port) || 25565;
        const key = host + ":" + port;

        if(cache[key] && Date.now() - cache[key].cacheTime < MAX_CACHE_AGE) {
            const value = cache[key];
            res.status(value.error ? 500 : 200).json(value);
        } else {

            try {
                const resp = await MC.pingServer(host, {timeout: 1000, port});
                res.json(resp);
                cacheValue(key, resp);
            } catch(error) {
                const resp = {error: error.message || error};
                res.status(500).json(resp);
                cacheValue(key, resp);
            }

        }

    } else {
        res.sendStatus(400);
    }
};