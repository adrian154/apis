// Methods for serializing/deserializing messages found in the DNS protocol
const {BufferBuilder, BufferReader} = require("bufferpants");

// constants
const RESPONSE_CODE = {
    OK: 0,
    BAD_QUERY: 1,
    SERVER_ERROR: 2,
    NAME_ERROR: 3,
    UNSUPPORTED: 4,
    REFUSED: 5
};

const FLAG = {
    RECURSION_AVAILABLE: 0x80,
    RECURSIVE_QUERY: 0x100,
    MESSAGE_TRUNCATED: 0x200,
    AUTHORITATIVE: 0x400,
    RESPONSE: 0x8000
};

const QUERY_TYPE = {
    STANDARD: 0,
    INVERSE: 0x800,
    STATUS: 0x1000
};

const RECORD_TYPE = {
    A: 1,
    AAAA: 28,
    CAA: 257,
    CNAME: 5,
    MX: 15,
    NS: 2,
    PTR: 12,
    SOA: 6,
    SRV: 33,
    TXT: 16
};

class DNSBuilder extends BufferBuilder {

    writeString(string) {
        const buf = Buffer.from(string, "utf-8");
        if(buf.length > 0xff) {
            throw new Error("String length exceeds maximum value that prefix can contain");
        }
        this.writeUInt8(buf.length).writeBuffer(buf);
        return this;
    }

    // WARNING; if you use this function with things other than an FQDN disaster may result
    writeDomainName(domain) {
        domain.split(".").forEach(label => this.writeString(label));
        return this;
    }

}

class DNSReader extends BufferReader {

    constructor(buffer) {
        super(buffer);
        this.positions = [];
    }

    readString() {
        return this.readBuffer(this.readUInt8()).toString("utf-8");
    }

    readDomainName() {

        // collect labels
        const labels = [];
        let label;

        do {

            // if the top 2 bits of the length are set, it's a pointer to another label
            const length = this.readUInt8();
            if(length & 0b11000000) {
                const ptr = length << 8 | this.readUInt8();
                this.jump(ptr & 0x3fff); // extract pointer (bottom 14 bits)
                labels.push(this.readDomainName());
                this.return();
                break;
            } 

            labels.push(label = this.readBuffer(length).toString("utf-8"));

        } while(label.length > 0); // label of length zero (single 0 byte) indicates end of domain name
    
        // output FQDN
        return labels.join(".");

    }

    readIPv4() {
        return [this.readUInt8(), this.readUInt8(), this.readUInt8(), this.readUInt8()].join(".");
    }

    // TODO: compress long runs of zeroes per RFC 2491
    readIPv6() {
        const parts = [];
        for(let i = 0; i < 8; i++) {
            parts.push(this.readUInt16BE());
        }
        return parts.map(part => part.toString(16).padStart(4, '0')).join(":");
    }

    jump(position) {
        this.positions.push(this.position);
        this.seek(position);
    }

    return() {
        this.position = this.positions.pop();
    }

}

const RDATA = {
    read: (reader, type, recordClass) => {
        switch(type) {

            case RECORD_TYPE.MX:
                return {
                    preference: reader.readUInt16BE(),
                    exchange: reader.readDomainName()
                };
            
            // several record types are just a single <character-string> field 
            case RECORD_TYPE.CNAME:
            case RECORD_TYPE.PTR:
            case RECORD_TYPE.NS:
                return reader.readDomainName();

            case RECORD_TYPE.SOA:
                return {
                    mname: reader.readDomainName(),
                    rname: reader.readDomainName(),
                    serial: reader.readUInt32BE(),
                    refresh: reader.readUInt32BE(),
                    retry: reader.readUInt32BE(),
                    expire: reader.readUInt32BE(),
                    minimum: reader.readUInt32BE()
                };

            case RECORD_TYPE.A:
                return {ip: reader.readIPv4()};

            case RECORD_TYPE.TXT:
                const strings = [];
                do {
                    strings.push(reader.readString());
                } while(!reader.end());
                return strings;

            case RECORD_TYPE.AAAA:
                return reader.readIPv6();

            case RECORD_TYPE.CAA:
                return {
                    flags: reader.readUInt8(), // TODO
                    issuer: reader.readString()
                };

            case RECORD_TYPE.SRV:
                return {
                    priority: reader.readUInt16BE(),
                    weight: reader.readUInt16BE(),
                    port: reader.readUInt16BE(),
                    target: reader.readDomainName()
                };

            // unsupported resource record
            default: return null;
        
        }
    }
};

const ResourceRecord = {
    read: reader => {
        const result = {};
        result.domain = reader.readDomainName();
        result.type = reader.readUInt16BE();
        result.class = reader.readUInt16BE();
        result.ttl = reader.readUInt32BE();
        const length = reader.readUInt16BE();
        const end = reader.position + length;
        result.rdata = RDATA.read(reader, result.type, result.class);
        reader.seek(end);
        return result;
    }
};

const Question = {
    write: (builder, question) => builder.writeDomainName(question.domain).writeUInt16BE(question.type).writeUInt16BE(question.class),
    read: reader => ({
        domain: reader.readDomainName(),
        type: reader.readUInt16BE(),
        class: reader.readUInt16BE()
    })
};

const DNSMessage = {
    read: reader => {
    
        const result = {};
        
        // read header
        result.id = reader.readUInt16BE();
        const flags = reader.readUInt16BE();
        result.flags = {
            recursionAvailable: flags & FLAG.RECURSION_AVAILABLE,
            recursiveQuery: flags & FLAG.RECURSIVE_QUERY,
            truncated: flags & FLAG.MESSAGE_TRUNCATED,
            authoritative: flags & FLAG.AUTHORITATIVE,
            isResponse: flags & FLAG.RESPONSE
        };
        result.responseCode = flags & 0b1111;
        result.opcode = (flags >> 11) & 0b1111;
    
        const numQuestions = reader.readUInt16BE();
        const numAnswers = reader.readUInt16BE();
        const numNSRecords = reader.readUInt16BE();
        const numAdditionalRecords = reader.readUInt16BE();

        result.questions = [];
        for(let i = 0; i < numQuestions; i++) {
            result.questions.push(Question.read(reader));
        }

        result.records = [];
        for(let i = 0; i < numAnswers + numNSRecords + numAdditionalRecords; i++) {
            result.records.push(ResourceRecord.read(reader));
        }

        return result;

    },
    write: (builder, message) => {

        // FIXME: this func doesn't enforce the 512-byte message size limit
        builder.writeUInt16BE(message.id);
        builder.writeUInt16BE(
            message.flags?.recursionAvailable && FLAG.RECURSION_AVAILABLE |
            message.flags?.recursiveQuery && FLAG.RECURSIVE_QUERY |
            message.flags?.truncated && FLAG.MESSAGE_TRUNCATED |
            message.flags?.authoritative && FLAG.AUTHORITATIVE |
            message.flags?.isReponse && FLAG.RESPONSE |
            message.opcode << 11 |
            message.responseCode
        );

        // no resource records
        builder.writeUInt16BE(message.questions.length);
        builder.writeUInt16BE(0).writeUInt16BE(0).writeUInt16BE(0);

        // write question
        for(const question of message.questions) {
            Question.write(builder, question);
        }

    }
};

module.exports = {
    DNSMessage,
    DNSReader,
    DNSBuilder,
    FLAG,
    RECORD_TYPE,
    QUERY_TYPE,
    RESPONSE_CODE
};