module.exports = (req, res) => {
    if(typeof req.query.key == "string") {
        
        const icon = req.pingCache.get(req.query.key)?.icon;

        if(icon) {
            res.status(200).setHeader("Content-Type", icon.type).setHeader("Content-Length", icon.data.length).send(icon.data);
        } else {
            res.sendStatus(404);
        }

    }
};