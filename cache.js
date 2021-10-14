// quick and dirty cache
// because my conscience would never allow me to use a module for something this trivial
// the cache layer is really a gesture of good courtesy anyway

module.exports = class {

    constructor(maxAge, maxSize) {
        this.maxAge = maxAge;
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    put(key, value) {
        
        // shh, don't tell anyone
        value.__cacheTimestamp = Date.now();

        // get rid of duplicates
        if(this.cache.has(key)) {
            this.cache.delete(key);
        }

        this.cache.set(key, value);

        // say goodnight :)
        if(this.cache.size == this.maxSize) {
            this.cache.delete(this.cache.keys().next().value);
        }

    }

    get(key) {

        const item = this.cache.get(key);
        if(item) {

            // evict entries that are too old
            if(Date.now() - item.__cacheTimestamp > this.maxAge) {
                this.cache.delete(key);
            } else {

                // refresh order
                this.cache.delete(key);
                this.cache.set(key, item);
                return item;

            }

        }

    }

};