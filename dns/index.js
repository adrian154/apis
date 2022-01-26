const DNS = require("./protocol.js");
const dgram = require("dgram");
const net = require("net");

// each DNS request is associated with a unique 16-bit request ID
let nextQueryID = 0;
const getNextQueryID = () => {

    // check if a callback exists, to avoid conflating responses
    if(queryCallbacks.has(nextQueryID)) {
        throw new Error("Internal error, couldn't generate a unique query ID");
    }

    // increment and return
    const answer = nextQueryID;
    nextQueryID = (nextQueryID + 1) % 65536;
    return answer;

};

// map IDs to callbacks
const queryCallbacks = new Map();

// create UDP socket to receive messages over
const UDPsocket = dgram.createSocket("udp4");

// message handling logic
UDPsocket.on("message", data => {

    // deserialize message
    const reader = new DNS.DNSReader(data);
    const message = DNS.DNSMessage.read(reader);
    
    // try to resolve the matching callback
    const callbacks = queryCallbacks.get(message.id);
    if(callbacks && message.flags.isResponse) {
        callbacks.resolve(message);
        queryCallbacks.delete(message.id);
    }

});

const queryServerUDP = (server, message, id) => new Promise((resolve, reject) => {

    // set callback
    queryCallbacks.set(id, {resolve, reject});
    UDPsocket.send(message, 0, message.length, 53, server, err => {
        if(err) {
            queryCallbacks.delete(id)
            reject(err);
        }
    });


    // fail after set timeout
    setTimeout(() => {
        queryCallbacks.delete(id);
        reject(new Error("Timed out"));
    }, 3000);

});

const queryServerTCP = (server, message) => new Promise((resolve, reject) => {

    const socket = net.createConnection({host: server, port: 53}, () => {

        // when using TCP, messages are prefixed with the length 
        const lengthHeader = Buffer.alloc(2);
        lengthHeader.writeUInt16BE(message.length);
        socket.write(lengthHeader);
        socket.write(message);
        socket.on("drain", () => socket.end());

        // accumulate data as it comes in
        let length = null;
        let buf = Buffer.alloc(0);
        socket.on("data", data => {
            
            // add new data to current buffer
            buf = Buffer.concat([buf, data]);

            // grab length prefix
            if(length == null && buf.length > 2) {
                length = buf.readUInt16BE();
                buf = buf.slice(2, buf.length);
            }

            // if enough data has been received, decode it
            if(buf.length >= length) {
                const reader = new DNS.DNSReader(buf);
                resolve(DNS.DNSMessage.read(reader));
            }

        });

        // handle error conditions
        socket.on("timeout", () => socket.destroy());
        socket.on("close", () => reject("Socket closed before enough data could be received"));

    });

});

const queryServer = async (server, domain, type, options) => {

    // serialize message
    const id = getNextQueryID();
    const builder = new DNS.DNSBuilder();
    DNS.DNSMessage.write(builder, {
        id,
        questions: [{domain, type, class: 1}],
        flags: {recursiveQuery: options?.recursive},
        opcode: DNS.QUERY_TYPE.STANDARD
    });
    const message = builder.build();

    // query the server, handle truncation
    const response = await queryServerUDP(server, message, id);
    if(response.flags.truncated) {
        try {
            const fullResponse = await queryServerTCP(server, message);
            if(fullResponse.flags.truncated) {
                throw new Error("The server sent a truncated response when queried over both UDP and TCP.");
            }
            fullResponse.comment = "The server sent a truncated response when queried over UDP, so it was automatically re-queried via TCP.";
            return fullResponse;
        } catch(err) {
            throw new Error("The server sent a truncated response when queried over UDP, and couldn't be queried via TCP.");
        }
    }

    return response;

};

module.exports = queryServer;