const {RECORD_TYPE} = require("../dns/protocol.js");
const resolve = require("../dns/index.js");

const RECORDS = {
    "A": RECORD_TYPE.A,
    "AAAA": RECORD_TYPE.AAAA,
    "CAA": RECORD_TYPE.CAA,
    "CNAME": RECORD_TYPE.CNAME,
    "MX": RECORD_TYPE.MX,
    "NS": RECORD_TYPE.NS,
    "PTR": RECORD_TYPE.PTR,
    "SOA": RECORD_TYPE.SOA,
    "SRV": RECORD_TYPE.SRV,
    "TXT": RECORD_TYPE.TXT
};

module.exports = async (req, res) => {
    
    if(!req.query.hostname || !req.query.record) return res.status(400).json({error: "Missing fields"});
    
    // check if domains have invalid characters
    let hostname = req.query.hostname;
    if(!hostname.match(/^[a-zA-Z0-9.\-]+$/)) return res.status(400).json({error: "Invalid domain"});
    if(hostname[hostname.length - 1] != ".") hostname += "."; // make sure domains are fully qualified

    // check record type
    const type = RECORDS[req.query.record];
    if(!type) return res.status(400).json({error: "Nonexistent or unsupported record type"});

    // make the request
    const logs = [];
    const logger = {
        error: message => logs.push({type: "error", message}),
        warn: message => logs.push({type: "warning", message}),
        log: message => logs.push({type: "info", message})
    };

    const answers = await resolve(hostname, type, logger);
    res.json({logs, answers});

};