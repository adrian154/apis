// Get addresses that have made a query to the integrated DNS server
// useful for exfil or detecting user resolvers

const {queries} = require("../dns/server.js");

module.exports = (req, res) => res.json(queries.get(req.query.name || []));