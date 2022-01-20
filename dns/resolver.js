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

const ROOT_NAMESERVERS = [
    "a.root-servers.net",
    "b.root-servers.net",
    "c.root-servers.net",
    "d.root-servers.net",
    "e.root-servers.net",
    "f.root-servers.net",
    "g.root-servers.net",
    "h.root-servers.net",
    "i.root-servers.net",
    "j.root-servers.net",
    "k.root-servers.net",
    "l.root-servers.net",
    "m.root-servers.net"
];

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

    // ignore message if id is unknown
    if(!callbacks) return;

    // ignore message if not a response
    if(!message.flags.isResponse) return;

    // various failure conditions
    if(message.flags.truncated) callbacks.reject(new Error("Response was truncated"));

    callbacks.resolve(message);
    delete callbacks[message.id];

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
        promiseCallbacks[id] = {resolve, reject};
    });

});

// iterative DNS query
const resolve = async (fqdn, type, trace) => { 

    // start from the root nameservers
    let nameservers = ROOT_NAMESERVERS;
    const labels = fqdn.split(".");
    const currentDepth = 1;
    const log = [];

    for(let i = 0; i < 32; i++) {

        trace(`Nameservers: ${nameservers.join(", ")}`);

        // iterate through nameservers in random order
        do {

            // pick nameserver, remove it from the list
            const nameserver = nameservers.splice(Math.floor(Math.random() * nameservers.length), 1)[0];

            try {

                trace(`Querying nameserver ${nameserver}...`);
                const time = Date.now();
                const reply = await queryServer(nameserver, {domain: fqdn, type, class: 1});
                trace(`Received reply (${Date.now() - time}ms)`);

                if(reply.flags.authoritative) {

                    trace(`Reply is authoritative!`);
                    if(reply.responseCode == DNSProtocol.RESPONSE_CODE.NAME_ERROR) {
                        trace(`No domain was found.`);
                        return null;
                    } else {
                        // cname logic
                        return;
                    }

                } else {

                    trace(`Reply is not authoritative, looking for a suitable referral...`);

                    // pick nameservers that are closer to the desired name
                    const nextNameservers = reply.records.filter(record => {
                        if(record.class == 1 && record.type == DNSProtocol.RECORD_TYPE.NS) {

                            const nsParts = record.rdata.split(".");
                            if(nsParts.length <= currentDepth) {
                                trace(`Ignoring NS record for "${record.rdata}" since it's not closer to the final domain`);
                                return false;
                            }
                            
                            // check if our domain is included in this nameserver's zone
                            const matchingParts = nsParts.slice(nsParts.length - currentDepth, nsParts.length);
                            for(let i = 0; i < matchingParts.length; i++) {
                                if(matchingParts[i] != labels[labels.length - currentDepth + i]) {
                                    trace(`Ignoring NS record for unrelated domain "${record.rdata}"`);
                                    return false;
                                }
                            }

                            return true;

                        }
                    }).map(record => record.rdata);

                    if(nextNameservers) {
                        nameservers = nextNameservers;
                        continue;
                    }

                }

            } catch(error) {
                trace(`Error querying server: ${error}`);
                console.error(error);
                continue;
            }

        } while(nameservers.length > 0);

        trace("Didn't receive an authoritative response or referral from any of the nameservers that were contacted");
        return null;

    }

    trace("Max queries limit was reached without receiving an authoritative response");
    return null;

};

resolve("twitter.com.", DNSProtocol.RECORD_TYPE.A, message => {
    console.log(message);
});