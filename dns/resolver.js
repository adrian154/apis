// Custom DNS resolver for tracing delegations.
const DNSProtocol = require("./protocol.js");
const dgram = require("dgram");

// constants
const ERROR_NAMES = {
    [DNSProtocol.RESPONSE_CODE.BAD_QUERY]: "Bad Query",
    [DNSProtocol.RESPONSE_CODE.SERVER_ERROR]: "Server Error",
    [DNSProtocol.RESPONSE_CODE.UNSUPPORTED]: "Not Supported",
    [DNSProtocol.RESPONSE_CODE.REFUSED]: "Refused"
};

const promiseCallbacks = {};
let nextQueryID = 0;
const socket = dgram.createSocket("udp4");

const getNewQueryID = () => {
    if(promiseCallbacks[nextQueryID]) {
        throw new Error("Something has gone terribly wrong.");
    }
    const answer = nextQueryID;
    nextQueryID = (nextQueryID + 1) % 65536;
    return answer;
};      

// message handling logc
socket.on("message", data => {
    
    const reader = new DNSProtocol.DNSReader(data);
    const message = DNSProtocol.DNSMessage.read(reader);
    const callbacks = promiseCallbacks[message.id];

    console.log(message);

    // ignore message if id is unknown
    if(!callbacks) return;

    // ignore message if not a response
    if(!message.flags.isResponse) return;

    // various failure conditions
    if(message.flags.truncated) throw new Error("Response was truncated");
    //if(message.flags.authoritative) throw new Error("Answer not authoritative");

    if(message.responseCode == DNSProtocol.RESPONSE_CODE.OK) {
        callbacks.resolve(message.records);
    } else {
        if(message.responseCode == DNSProtocol.RESPONSE_CODE.NAME_ERROR) {
            callbacks.resolve([]);
        } else {
            console.log(message);
            callbacks.reject(ERROR_NAMES[message.responseCode]);
        }
    }

});

const queryServer = (dnsServer, ...questions) => new Promise((resolve, reject) => {
    
    const builder = new DNSProtocol.DNSBuilder();
    const id = getNewQueryID();
    DNSProtocol.DNSMessage.write(builder, {id, questions, opcode: DNSProtocol.QUERY_TYPE.STANDARD});

    const message = builder.build();
    socket.send(message, 0, message.length, 53, dnsServer, (err) => {
        if(err) {
            reject(err);
        }
        console.log(message);
        console.log("sent");
        promiseCallbacks[id] = {resolve, reject};
    });

});

queryServer("192.58.128.30", {
    domain: "qx.dev.",
    type: DNSProtocol.RECORD_TYPE.A,
    class: 1
}).then(console.log);