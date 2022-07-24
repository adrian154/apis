// On the list of worst DNS servers ever written, this probably ranks pretty high.
const DNS = require("./protocol.js");
const Cache = require("../cache.js");
const dgram = require("dgram");

const queries = new Cache(1024, 60);
const server = dgram.createSocket("udp4");

server.on("message", (data, rinfo) => {
 
    console.log(rinfo);

    const reader = new DNS.DNSReader(data);
    const message = DNS.DNSMessage.read(reader);

    const response = new DNS.DNSBuilder();
    response.writeUInt16BE(message.id);
    response.writeUInt16BE(DNS.FLAG.AUTHORITATIVE | DNS.FLAG.RESPONSE);

    // filter the A queries
    const answers = message.questions.filter(question => question.type == DNS.RECORD_TYPE.A).map(question => question.domain);

    response.writeUInt16BE(message.questions.length) // # questions
            .writeUInt16BE(answers.length) // # answers
            .writeUInt16BE(0).writeUInt16BE(); // no NS/additional records

    for(const question of message.questions) {
        DNS.Question.write(response, question);
    }

    for(const name of answers) {
        
        // write response record
        response.writeDomainName(name);
        response.writeUInt16BE(DNS.RECORD_TYPE.A);
        response.writeUInt16BE(1); // class 1 (IN)
        response.writeUInt32BE(0); // 0 TTL
        response.writeUInt16BE(4);
        response.writeUInt8(142).writeUInt8(93).writeUInt8(26).writeUInt8(121);

        // remember the query
        const list = queries.get(name) || [];
        list.push(rinfo.address);
        queries.set(name, list);

    }

    const buf = response.build();
    server.send(buf, 0, buf.length, rinfo.port, rinfo.address);

});

server.on("listening", () => {
    console.log("DNS server listening");
});

server.bind(53);

module.exports = {queries};