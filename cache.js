// A simple in-memory LRU cache

module.exports = class {

    constructor(maxSize, defaultTTL) {

        // validate inputs
        maxSize = Number(maxSize);
        if(isNaN(maxSize) || maxSize <= 0) {
            throw new Error("Invalid maximum size");
        }

        defaultTTL = Number(defaultTTL);
        if(isNaN(defaultTTL) || defaultTTL <= 0) {
            this.defaultTTL = null;
        }

        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;
        this.cache = new Map();

    }

    // See Map#set()
    set(key, value, ttl) {

        // delete existing cache key to update insertion order
        this.cache.delete(key);

        // set new value
        ttl = Number(ttl);
        if(!this.defaultTTL && isNaN(ttl)) {
            throw new Error("Invalid TTL and no default TTL was provided");
        }

        this.cache.set(key, {
            value,
            maxAge: Date.now() + (ttl || this.defaultTTL) * 1000
        });

        // evict if necessary
        this.maintainSize();
        return this;

    }

    // evict entries if the cache has exceeded the maximum size 
    maintainSize() {
        if(this.cache.size > this.maxSize) {
            this.cache.delete(this.cache.keys().next().value);
        }
    }

    // See Map#get()
    get(key, skipRefresh) {

        // get cache entry
        const entry = this.cache.get(key);

        // make sure it's not stale
        if(entry?.maxAge < Date.now()) {
            this.cache.delete(key);
            return undefined;
        }

        // refresh the cache entry
        if(entry && !skipRefresh) {
            this.cache.delete(key);
            this.cache.set(key, entry);
        }

        return entry?.value;

    }

    // See Map#delete()
    delete(key) {
        return this.cache.delete(key);
    }

    // forcefully remove stale entries
    prune() {
        for(const [key, value] of this.cache) {
            if(value.maxAge < Date.now()) {
                this.cache.delete(key);
            }
        }
    }

};