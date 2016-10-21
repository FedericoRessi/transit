function Feed(conf) {
    this.conf = conf;
    this.cache = {};
}

Feed.prototype.requestStops = function(bounds, receiveStops) {
    log.debug("requestStops:", bounds)
    var self = this;
    this.from('index').select(['path', 'west', 'east', 'south', 'north'])
            .fetch(function(index) {
                self.receiveIndex(index, bounds, receiveStops)
            });
}

Feed.prototype.receiveIndex = function(index, bounds, receiveStops) {
    for ( var i in index.path) {
        if (index.west[i] < bounds.east && index.east[i] > bounds.west
                && index.south[i] < bounds.north
                && index.north[i] > bounds.south) {
            this.requestStopTiles(index.path[i], bounds, receiveStops);
        }
    }
}

Feed.prototype.requestStopTiles = function(path, bounds, receiveStops) {
    log.debug("requestStopTiles:", path, bounds, receiveStops)
    var self = this;
    this.from(path).select(['tree']).fetch(function(tree) {
        self.receiveTree(tree, bounds, receiveStops);
    });
}

Feed.prototype.receiveTree = function(tree, bounds, receiveStops) {
    log.debug('Tree received:', tree)
}

Feed.prototype.from = function(path) {
    return new FeedRequest(this.conf[0].url, this.cache).from(path);
}

// ----------------------------------------------------------------------------

function FeedRequest(url, cache) {
    this.url = url;
    this.cache = cache;
    this.path = null;
    this.requests = {};
    this.responses = {};
    this.receiveFunc = null;
    this.done = true;
}

FeedRequest.prototype.from = function(path) {
    this.path = path;
    return this;
}

FeedRequest.prototype.select = function(names) {
    if (!this.path) {
        throw new Error('Unspecified path.');
    }
    for ( var i in names) {
        var name = names[i];
        var url = this.url + '/' + this.path + '/' + name + '.gz';
        log.debug("Select object '" + name + "' from:", url);
        this.requests[name] = url;
    }

    return this;
}

FeedRequest.prototype.fetch = function(receiveFunc) {
    this.receiveFunc = receiveFunc;
    this.update();
    if (!this.done) {
        for ( var name in this.requests) {
            if (!(name in this.responses)) {
                this.request(name, this.requests[name])
            }
        }
    }
    return this;
}

FeedRequest.prototype.update = function() {
    for ( var name in this.requests) {
        if (!(name in this.responses)) {
            cached = this.cache[this.requests[name]]
            if (cached) {
                this.responses[name] = cached;
            } else {
                this.done = false;
                return;
            }
        }
    }

    log.debug('Invoke callback function:', this.receiveFunc)
    this.done = true;
    this.receiveFunc(this.responses);
}

FeedRequest.prototype.request = function(name, url) {
    log.debug("Fetch '" + name + "' from: ", url)
    var self = this;
    var request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = 'arraybuffer';
    request.setRequestHeader('Content-Type', 'application/gzip');
    request.addEventListener('load', function() {
        if (request.status != 200) {
            log.error("Unable to request column:", name, url, request.status);
        } else {
            self.receiveResponse(name, url, new Uint8Array(request.response));
        }
    });
    request.send();
}

FeedRequest.prototype.receiveResponse = function(name, url, response) {
    try {
        log.debug("Received response for '" + name + "'.")
        var packed = pako.inflate(response);
        var decoded = msgpack.decode(packed);
        this.responses[name] = decoded;
        this.cache[url] = decoded;
    } catch (error) {
        log
                .error("Error getting rensponse for '" + name + "':",
                        error.message);
        throw error;
    } finally {
        this.update();
    }
}