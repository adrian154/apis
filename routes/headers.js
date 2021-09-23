module.exports = (req, res) => {
    if(req.query.h) {
        res.send(req.header(req.query.h));
    } else {
        res.json(req.headers);
    }
};