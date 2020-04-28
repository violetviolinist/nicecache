// Contants for locked and unlocked flag on the global queue
const LOCKED = '1';
const UNLOCKED = '0';

const SportsArticle = require('../models/sports.model');
// To generate random request IDs
var crypto = require("crypto");

// Local in-process cache library
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
    // slice out port number to allow replicated servers with different port numbers to have same key
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
                    res.status(500).send('Mongo find request failed');
                }
                sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                    if(err){
                        res.status(500).send('Node cache set failed');
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
    const requestID = crypto.randomBytes(20).toString('hex');
    // key for waiting queue (list; unique for every read request) 
    const listKey = fullUrl + ':LIST:' + requestID;
    console.log('\nGET Request:');

    redisClient.hgetall(fullUrl, function(err, object){
        console.log('received hgetall response\nObject lock status: ' + object.lock);
        if(err){
            res.status(500).send('Redis initial fetch failed');
        }
        // data object has an entry in the global cache
        if(object){
            new Promise((resolve, reject) => {
                if(object.lock === LOCKED){
                    console.log('object is locked');
                    // redisClient.rpush(listKey, requestID);
                    // redisClient.hset(listKey, { 'requestId': object.latestWriteRequestId });
                    const currentLatestWriteRequestId = object.latestWriteRequestId;
                    // start polling
                    const intervalId = setInterval(() => {
                        redisClient.hgetall(fullUrl, function(err, object){
                            if(err){
                                res.status(500).send('Redis fetch failed while polling');
                            }
                            // redisClient.hgetall(listKey, function(err, obj){
                            //     if(err){
                            //         res.status(500).send('Redis fetch failed while polling (queue fetch)');
                            //     }
                            if(currentLatestWriteRequestId === object.latestCompletedWriteRequestId){
                                // redisClient.hdel(listKey, 'requestId');
                                clearInterval(intervalId);
                                resolve(object);
                            }
                            // });
                            // if(object.lock === UNLOCKED){
                            //     // poll front of queue
                            //     redisClient.lrange(listKey, 0, -1, (err, arr) => {
                            //         if(err){
                            //         throw err;
                            //         }
                            //         console.log('arr[0]:' + arr[0] + '\n' + 'requestId: ' + requestID + '\n');
                            //         if(arr[0] === requestID){ // if this request's turn is up, then pop front of queue
                            //             redisClient.lpop(listKey);
                            //             clearInterval(intervalId);
                            //             redisClient.hgetall(fullUrl, (err, obj) => {
                            //                 if(err){
                            //                     throw err;
                            //                 }
                            //                 resolve(obj);
                            //             })
                            //         }
                            //     });
                            // }
                        });
                    }, 500);
                }else{ // if object was found unlocked, then resolve it
                    resolve(object);
                }
            }).then((object) => { // polling over; execute the read request as usual
                sportsCache.get(fullUrl, function(err, value){
                    if(err){
                        res.status(500).send('After polling: Node cache fetch failed');
                    }
                    if(value){
                        console.log('found in local cache');
                        const localTime = value[1];
                        console.log('got local time: ' + localTime);
                        if(localTime > object.latestWriteTimestamp){ //if local object is fresh, then return it
                            res.send(value);
                        }else{ // otherwise, get from DB, set local cache and return
                            SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                                if(err){
                                    res.status(500).send('After polling: fetch from DB failed');
                                }
                                sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                                    if(err){
                                        res.status(500).send('After polling: setting local cache failed');
                                    }
                                });
                                res.send(doc);
                            });
                        }
                    }else{  // if data not present in local cache
                        SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                            if(err){
                                res.status(500).send('After polling: fetch from DB failed');
                            }
                            sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                                if(err){
                                    res.status(500).send('After polling: setting local cache failed');
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
                    res.status(500).send('no redis entry found: DB fetch failed');
                }
                console.log('before redis set');
                redisClient.hmset(fullUrl, { 
                    'latestWriteTimestamp': Date.now(), 
                    'lock': UNLOCKED,
                    'latestWriteRequestId': 'nil',
                    'latestCompletedWriteRequestId': 'nil'
                }, function(err) {
                    if(err){
                        res.status(500).send('no redis entry found: redis set after DB fetch failed');
                    }
                    sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                        if(err){
                            res.status(500).send('no redis entry found: node cache set after DB fetch failed');
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
            res.status(500).send('DB creation failed');
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
            res.status(500).send('DB deletion failed');
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
            res.status(500).send('UPDATE: redit initial fetch failed');
        }
        console.log('received hgetall response');
        new Promise((resolve, reject) => {
            if(!object){
                resolve(1);
            }
            if(object.lock === LOCKED){
                console.log('object is locked');
                const oldLatestWriteRequestId = object.latestWriteRequestId;
                redisClient.rpush(listKey, requestID);
                redisClient.hmset(fullUrl, { 'latestWriteRequestId': requestID });
                const intervalId = setInterval(() => {
                    redisClient.hgetall(fullUrl, function(err, object){
                        if(err){
                            // element on right end may not be the current request's ID (Find a solution)
                            redisClient.rpop(listKey);
                            redisClient.hmset(fullUrl, { 'latestWriteRequestId': oldLatestWriteRequestId });
                            res.status(500).send('UPDATE: redit fetch while polling failed');
                        }
                        if(object.lock === UNLOCKED){
                            redisClient.lrange(listKey, 0, -1, (err, arr) => {
                                if(arr[0] === requestID){
                                    redisClient.lpop(listKey);
                                    // redisClient.hmset(fullUrl, { 'lock': LOCKED });
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
                    redisClient.hmset(fullUrl, { 'lock': UNLOCKED });
                    res.status(500).send('UPDATE: DB write failed');
                }
                console.log('after actual update');
                redisClient.hmset(fullUrl, { 
                'latestWriteTimestamp': Date.now(), 
                'lock': UNLOCKED,
                'latestCompletedWriteRequestId': requestID,
            });
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