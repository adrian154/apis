const escape = text => text.replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\\/g, "&bsol;");

module.exports = (req, res) => {
    const title = escape(req.query.title) ?? "";
    const description = escape(req.query.desc) ?? "";
    const url = escape(req.query.url) ?? "/static/default-image.png";
    res.setHeader("Content-Type", "text/html").send([
        "<!DOCTYPE html>",
        '<html style="height: 100%;">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, minimum-scale=1.0">',
        `<meta property="og:title" value="${title}">`,
        `<meta property="og:description" value="${description}">`,
        `<meta property="og:image" value="${url}">`,
        '<meta name="twitter:card" content="summary_large_image">',
        `<title>${title}</title>`,
        "</head>",
        '<body style="height: 100%; background-color: #222222; margin: 0;">',
        `<img style="max-width: 100%; max-height: 100%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); object-fit: contain;" src="${url}">`,
        "</body>",
        "</html>"
    ].join("\n"));
};