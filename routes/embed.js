const escape = text => text.replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\\/g, "&bsol;");

module.exports = (req, res) => {
    const title = escape(req.query.title ?? "");
    const description = escape(req.query.desc ?? "");
    const url = escape(req.query.url ?? "/images/default-image.png");
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
        '<body style="width: 100%; height: 100%; background-color: #222222; margin: 0; display: flex;">',
        `<img style="margin: auto; max-width: 100%; max-height: 100%;" src="${url}">`,
        "</body>",
        "</html>"
    ].join("\n"));
};