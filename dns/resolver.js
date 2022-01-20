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
// may recurse for CNAMEs, but loops are automatically detected
const resolve = async (fqdn, type, trace, existingCNAMEs) => { 

    // start from the root nameservers
    const labels = fqdn.split(".");
    let nameservers = ROOT_NAMESERVERS;
    
    // prevent circular silliness
    if(!existingCNAMEs) {
        existingCNAMEs = [fqdn];
    }

    trace(`>>> Beginning resolution of domain "${fqdn}"`);
    for(let i = 0; i < 32; i++) {

        trace(`Nameservers: ${nameservers.join(", ")}`);

        // iterate through nameservers in random order
        do {

            // pick nameserver, remove it from the list
            const nameserver = nameservers.splice(Math.floor(Math.random() * nameservers.length), 1)[0];

            try {

                trace(`Sent query to nameserver ${nameserver}`);
                const time = Date.now();
                const reply = await queryServer(nameserver, {domain: fqdn, type, class: 1});
                trace(`Received reply (${Date.now() - time}ms)`);

                if(reply.flags.authoritative) {

                    trace(`Reply is authoritative!`);
                    if(reply.responseCode == DNSProtocol.RESPONSE_CODE.NAME_ERROR) {
                        trace(`<<< Answer: No domain was found.`);
                        return null;
                    } else {
                        
                        let cname;
                        while(true) {
                            
                            // check if there's a good answer
                            const answers = reply.records.filter(record => record.type == type && record.domain == (cname || fqdn) && record.class == 1);
                            if(answers.length > 0) {
                                trace(`<<< Answer: Received ${answers.length} records`);
                                return answers;
                            }

                            // if we've already been redirected, another request may be necessary
                            if(cname) {
                                trace(`No answers for CNAME "${cname}" were received in the initial request, performing another lookup...`);
                                return resolve(cname, type, trace, existingCNAMEs);
                            }

                            // cname time...
                            trace(`No records of the requested type matching "${fqdn}" were received, checking for CNAMEs...`);
                            const cnames = reply.records.filter(record => record.type == DNSProtocol.RECORD_TYPE.CNAME && record.domain == fqdn && record.class == 1);
                            if(cnames.length > 0) {
                                
                                // check for funny business
                                if(cnames.length > 1) {
                                    trace(`<<< Fatal: Multiple CNAMEs for the same domain.`);
                                    return null;
                                }

                                const record = cnames[0];
                                cname = record.rdata;
                                if(existingCNAMEs.includes(cname)) {
                                    trace(`<<< Fatal: CNAME chain detected (${existingCNAMEs.join(" -> ")} -> ${cname})`);
                                    return null;
                                }

                                existingCNAMEs.push(cname);

                            }

                        }

                        return;
                    
                    }

                } else {

                    trace(`Reply is not authoritative, checking for a suitable referral`);

                    // FIXME: this code doesn't check for horizontal or even backwards references 
                    const nextNameservers = reply.records.filter(record => {
                        if(record.class == 1 && record.type == DNSProtocol.RECORD_TYPE.NS) {
                            
                            // check if our domain is included in this nameserver's zone
                            const parts = record.domain.split(".");
                            const matchingParts = labels.slice(labels.length - parts.length, labels.length);
                            for(let i = 0; i < matchingParts.length; i++) {
                                if(matchingParts[i] != parts[i]) {
                                    trace(`Ignoring NS record for unrelated domain "${record.name}"`);
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

        trace("<<< Fatal: Didn't receive an authoritative response or referral from any of the nameservers that were contacted");
        return null;

    }

    trace("<<< Fatal: Max queries limit was reached without receiving an authoritative response");
    return null;

};

resolve("www.bing.com.", DNSProtocol.RECORD_TYPE.A, message => {
    console.log(message);
}).then(console.log);