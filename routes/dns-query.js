const queryServer = require("../dns/index.js");

module.exports = async (req, res) => {

    if(!req.query.nameserver || !req.query.hostname || !req.query.type) return res.status(400).json({error: "Missing fields"});
    
    // check if domains have invalid characters
    let hostname = String(req.query.hostname).trim();
    if(!hostname.match(/^[a-zA-Z0-9\.\-]+$/)) return res.status(400).json({error: "Invalid domain"});
    if(hostname[hostname.length - 1] != ".") hostname += "."; // make sure domains are fully qualified
    const type = Number(req.query.type);

    try {
        const response = await queryServer(req.query.nameserver, hostname, type, req.query.recursive);
        res.json(response);
    } catch(error) {
        res.status(500).json({error: error.message});
    }

};