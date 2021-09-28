const dns = require("dns").promises;

module.exports = async (req, res) => {
    
    if(!req.query.hostname || !req.query.record) res.sendStatus(400);

    try {
        res.json(await dns.resolve(req.query.hostname, req.query.record));
    } catch(error) {
        res.json({dnsError: error.code});
    }

};