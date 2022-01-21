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
    delete promiseCallbacks[message.id];

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

    setTimeout(() => {
        reject(new Error("Request timed out"));
        delete promiseCallbacks[id];
    }, 3000);

});

const filterRecords = (records, domain, type) => records.filter(record => record.domain == domain && record.type == type && record.class == 1);
const checkZone = (fqdnLabels, zone) => {
    const zoneParts = zone.split(".");
    const matchingParts = fqdnLabels.slice(fqdnLabels.length - zoneParts.length, fqdnLabels.length);
    for(let i = 0; i < matchingParts.length; i++) {
        if(matchingParts[i] != zoneParts[i]) {
            return false;
        }
    }
    return true;
};

// iterative DNS query
// may recurse for CNAMEs, but loops are automatically detected
const resolve = async (fqdn, type, logger, existingCNAMEs) => { 

    // start from the root nameservers
    let nameservers = ROOT_NAMESERVERS.slice(0);
    const labels = fqdn.split(".");
    
    // prevent circular silliness
    if(!existingCNAMEs) {
        existingCNAMEs = [fqdn];
    }

    logger.log(`Beginning resolution of domain "${fqdn}"`);
    for(let query = 0; query < 32; query++) {

        // iterate through nameservers in random order
        do {

            // pick nameserver, remove it from the list
            logger.log(`Nameservers:\n${nameservers.map(ns => `- ${ns}`).join("\n")}`);
            const nameserver = nameservers.splice(Math.floor(Math.random() * nameservers.length), 1)[0];

            let reply;
            try {
                const time = Date.now();
                logger.log(`\nQuerying ${nameserver}`);
                reply = await queryServer(nameserver, {domain: fqdn, type, class: 1});
                logger.log(`Received ${reply.flags.authoritative ? "authoritative" : "non-authoritative"} reply in ${Date.now() - time}ms`);
            } catch(error) {
                logger.error(`Failed to query the server: ${error.message}`);
                continue;
            }

            // handle server failures
            if(reply.responseCode != DNSProtocol.RESPONSE_CODE.OK && reply.responseCode != DNSProtocol.RESPONSE_CODE.NAME_ERROR) {
                logger.error(`The server responded with an error: ${ERROR_NAMES[reply.responseCode] || "unknown"} (${reply.responseCode})`);
                continue;
            }

            if(reply.flags.authoritative) {

                if(reply.responseCode == DNSProtocol.RESPONSE_CODE.NAME_ERROR) {
                    logger.warn("The domain doesn't exist.");
                    return [];
                }

                let cname;
                while(true) {
                    
                    // check if there's a record exactly matching the query
                    const answers = filterRecords(reply.records, cname || fqdn, type);
                    if(answers.length > 0) {
                        logger.log(`Found ${answers.length} record(s) that answer the query.`);
                        return answers;
                    }

                    // if we've been redirected, a second DNS query may be necessary
                    if(cname) {
                        logger.warn(`No answers for CNAME "${cname}" were received in the initial request, performing another lookup...\n`);
                        return resolve(cname, type, logger, existingCNAMEs);
                    }

                    // check if the server sent a CNAME record instead
                    logger.log(`No records of the requested type matching "${fqdn}" were received, checking for CNAMEs...`);
                    const cnames = reply.records.filter(record => record.type == DNSProtocol.RECORD_TYPE.CNAME && record.domain == fqdn && record.class == 1);
                    if(cnames.length > 0) {
                        
                        // make sure there's only one cname
                        if(cnames.length > 1) {
                            logger.error(`Fatal: Multiple CNAMEs for the same domain.`);
                            return;
                        }

                        const record = cnames[0];
                        logger.log(`Found CNAME for "${cname || fqdn}" -> "${record.rdata}"`);
                        cname = record.rdata;

                        // don't pursue circular CNAME chains
                        if(existingCNAMEs.includes(cname)) {
                            logger.error(`Fatal: CNAME chain detected (${existingCNAMEs.join(" -> ")} -> ${cname})`);
                            return;
                        }

                        existingCNAMEs.push(cname);

                    } else {
                        logger.warn(`No records of the requested type exist for this domain.`);
                        return [];
                    }

                }

            } else {

                logger.log("Checking for a suitable referral...");

                // FIXME: this code doesn't check for horizontal or even backwards references 
                const nsRecords = reply.records.filter(record => {
                    if(record.class == 1 && record.type == DNSProtocol.RECORD_TYPE.NS) {
                        if(checkZone(labels, record.domain)) {
                            return true;
                        }
                        logger.warn(`Ignoring NS record for unrelated zone "${record.domain}"`);
                    }
                });

                if(nsRecords) {
                    logger.log(`Got ${nsRecords.length} nameserver(s) for zone "${nsRecords[0].domain}"`);
                    nameservers = nsRecords.map(record => record.rdata);
                    break;
                }

                logger.warn("No suitable referral was found.");

            }
            
        } while(nameservers.length > 0);

        if(nameservers.length == 0) {
            logger.error("Fatal: Didn't receive an authoritative response or referral from any of the nameservers that were contacted");
            return;
        }

    }
    
    logger.error("Fatal: Max queries limit was reached without receiving an authoritative response");
    return;

};

module.exports = resolve;