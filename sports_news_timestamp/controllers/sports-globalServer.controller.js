// Contants for locked and unlocked flag on the global queue
const LOCKED = '1';
const UNLOCKED = '0';

const SportsArticle = require('../models/sports.model');
var crypto = require("crypto");

const NodeCache = require( "node-cache" );
const sportsCache = new NodeCache();

const redis = require('redis');
const redisClient = redis.createClient('redis://SG-Timestamp-30607.servers.mongodirector.com:6379');
redisClient.auth('aYUYHprX0OqMlu6tjdKgWeVehAluLdku', function(err){
    if(err){
        throw err;
    }
    console.log('successfully authenticated with redis cluster');
});

exports.getAll = function (req, res) {
    const host = req.get('host').slice(0, -5);
    // key - full url  
    // value - arr of value(doc) & date
    // response send only value
    const fullUrl = req.protocol + '://' + host + req.originalUrl + req.body.title;
    sportsCache.get(fullUrl, function(err, value){
        if(!err && value){
            console.log('found in cache');
            res.send(value);
        }else{
            SportsArticle.find({}, function(err, doc) {
                if(err){
                    throw err;
                }
                sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                    if(err){
                        throw err;
                    }
                });
                res.send(doc);
            });
        }
    });
};

exports.getById = function(req, res) {
    const host = req.get('host').slice(0, -5);
    // key for object storage map (local cache)
    const fullUrl = req.protocol + '://' + host + req.originalUrl;
    // key for waiting queue (list)
    const listKey = fullUrl + ':LIST';
    console.log('\nGET Request:');
    const requestID = crypto.randomBytes(20).toString('hex');

    redisClient.hgetall(fullUrl, function(err, object){
        console.log('received hgetall response\nObject lock status: ' + object.lock);
        if(err){
            throw err;
        }
        if(object){
            new Promise((resolve, reject) => {
                if(object.lock === LOCKED){
                    console.log('object is locked');
                    redisClient.rpush(listKey, requestID);
                    // start polling
                    const intervalId = setInterval(() => {
                        redisClient.hgetall(fullUrl, function(err, object){
                            if(err){
                                throw err;
                            }
                            if(object.lock === UNLOCKED){
                                // poll front of queue
                                redisClient.lrange(listKey, 0, -1, (err, arr) => {
                                    if(err){
                                    throw err;
                                    }
                                    console.log('arr[0]:' + arr[0] + '\n' + 'requestId: ' + requestID + '\n');
                                    if(arr[0] === requestID){ // if this request's turn is up, then pop front of queue
                                        redisClient.lpop(listKey);
                                        clearInterval(intervalId);
                                        redisClient.hgetall(fullUrl, (err, obj) => {
                                            if(err){
                                                throw err;
                                            }
                                            resolve(obj);
                                        })
                                    }
                                });
                            }
                        });
                    }, 500);
                }else{ // if object was found unlocked, then resolve it
                    resolve(object);
                }
            }).then((object) => { // polling over; execute the read request as usual
                sportsCache.get(fullUrl, function(err, value){
                    if(err){
                        throw err;
                    }
                    if(value){
                        console.log('found in local cache');
                        const localTime = value[1];
                        console.log('got local time: ' + localTime);
                        if(localTime > object.timestamp){ //if local object is fresh, then return it
                            res.send(value);
                        }else{ // otherwise, get from DB, set local cache and return
                            SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                                if(err){
                                    throw err;
                                }
                                sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                                    if(err){
                                        throw err;
                                    }
                                });
                                res.send(doc);
                            });
                        }
                    }else{  // if data not present in local cache
                        SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                            if(err){
                                throw err;
                            }
                            sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                                if(err){
                                    throw err;
                                }
                            });
                            res.send(doc);
                        });
                    }
                });
            });
        }else{ // object not found in global cache; perform read as usual
            console.log('not found in global cache');
            SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                if(err){
                    throw err;
                }
                console.log('before redis set');
                redisClient.hmset(fullUrl, { 'timestamp': Date.now(), 'lock': UNLOCKED }, function(err) {
                    if(err){
                        throw err;
                    }
                    sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                        if(err){
                            throw err;
                        }
                    });
                });
                res.send(doc);
            });
        }
    });
};

exports.article_create = function (req, res, next) {
    const host = req.get('host').slice(0, -5);
    const fullUrl = req.protocol + '://' + host + req.originalUrl + req.body.title;    
    let article = new SportsArticle(
        {
            date: new Date(),
            title: req.body.title,
            text: req.body.text,
            tags: req.body.tags,
            images: req.files.map((file) => {
                return file.buffer.toString('base64');
            })
        }
    );

    article.save(function (err) {
        if (err) {
            throw err;
        }
        res.send('Article uploaded successfully')
    })
};

exports.article_delete = function (req, res) {
    const host = req.get('host').slice(0, -5);
    const fullUrl = req.protocol + '://' + host + req.originalUrl + req.body.title;    
    SportsArticle.deleteOne({
        title: req.body.title
    }, function (err){
        if(err){
            throw err;
        }
        redisClient.del(fullUrl);
        res.send('Article deleted succesfully');
    });
};

exports.article_update = function (req, res) {
    const host = req.get('host').slice(0, -5);
    const fullUrl = req.protocol + '://' + host + req.originalUrl + req.body.title;
    const listKey = fullUrl + ':LIST';
    console.log('\nPUT Request:');
    const requestID = crypto.randomBytes(20).toString('hex');

    redisClient.hgetall(fullUrl, function(err, object){
        if(err){
            throw err;
        }
        console.log('received hgetall response');
        new Promise((resolve, reject) => {
            if(!object){
                resolve(1);
            }
            if(object.lock === LOCKED){
                console.log('object is locked');
                redisClient.rpush(listKey, requestID);
                const intervalId = setInterval(() => {
                    redisClient.hgetall(fullUrl, function(err, object){
                        if(err){
                            throw err;
                        }
                        if(object.lock === UNLOCKED){
                            redisClient.lrange(listKey, 0, -1, (err, arr) => {
                                if(arr[0] === requestID){
                                    redisClient.lpop(listKey);
                                    redisClient.hmset(fullUrl, { 'lock': LOCKED });
                                    clearInterval(intervalId);
                                    resolve(1);
                                }
                            });
                        }
                    });
                }, 500);
            }else{ // if object found unlocked, proceed with write request as usual
                console.log('object is unlocked');
                resolve(1);
            }
        }).then((value) => {
            console.log('before actual update');
            redisClient.hmset(fullUrl, { 'lock': LOCKED });
            console.log('object is lockec before writing');
            SportsArticle.findOneAndUpdate({ title: req.body.title }, req.body, function(err) {
                if(err){
                    throw err;
                }
                console.log('after actual update');
                redisClient.hmset(fullUrl, { 'timestamp': Date.now(), 'lock': UNLOCKED });
                console.log('object is unlocked after update');
                res.send('Article updated successfully');
            });
        });
    });
};

exports.flushCache = function(req, res) {
    sportsCache.flushAll();
    res.send('success');
}

exports.flushRedis = function(req, res) {
    redisClient.flushall(function(err, success){
        console.log(success);
        res.send('done');
    });
};