const MC = require("node-mc-api");
const config = require("../config.json");

module.exports = async (req, res) => {
    if(typeof req.query.host == "string") {
        
        const host = req.query.host;
        const port = Number(req.query.port) || 25565;
        const key = host + ":" + port;

        const value = req.pingCache.get(key);
        if(value) {
            return res.status(200).json(value.ping);
        }

        try {
            
            const ping = await MC.pingServer(host, {timeout: 1000, port});
            
            let icon;
            if(ping.favicon) {
                const parsed = ping.favicon.match(/data:([\w\/]+);base64,([a-zA-Z0-9\+\/=]+)/);
                if(parsed) {
                    ping.faviconURL = config.urlBase + `/mc/server-icon?key=${encodeURIComponent(key)}`;
                    icon = {
                        type: parsed[1],
                        data: Buffer.from(parsed[2], "base64")
                    };
                }
            }

            req.pingCache.set(key, {ping, icon});
            res.json(ping);

        } catch(error) {
            res.status(500).json({error: error.message});
        }

    } else {
        res.sendStatus(400);
    }
};