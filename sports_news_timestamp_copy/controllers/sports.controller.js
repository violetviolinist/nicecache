const LOCKED = 1;
const UNLOCKED = 0;

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
    const host = req.get('host').slice(0, -6);
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
    const host = req.get('host').slice(0, -6);
    const fullUrl = req.protocol + '://' + host + req.originalUrl + req.body.title;
    const requestID = crypto.randomBytes(20).toString('hex');

    redisClient.hgetall(fullUrl, function(err, object){
        console.log('receiver hgetall response');
        if(err){
            throw err;
        }
        if(object){
            new Promise((resolve, reject) => {
                if(object.lock === LOCKED){
                    redisClient.rpush(fullUrl, requestID);
                    const intervalId = setInterval(() => {
                        redisClient.hgetall(flagUrl, function(err, object){
                            if(err){
                                throw err;
                            }
                            if(object.lock === UNLOCKED){
                                // poll front of queue
                                redisClient.lrange(fullUrl, 0, -1, (err, arr) => {
                                    if(err){
                                    throw err;
                                    } 
                                    if(arr[0] === requestID){ // if this request's turn is up, then pop front of queue
                                        redisClient.lpop(fullUrl);
                                        clearInterval(intervalId);
                                        resolve(1);
                                    }
                                });
                            }
                        });
                    }, 500);
                }else{
                    resolve(1);
                }
            }).then((value) => {
                sportsCache.get(fullUrl, function(err, value){
                    if(err){
                        throw err;
                    }
                    console.log('found in local cache');
                    if(value){
                        const localTime = value[1];
                        console.log('got local time: ' + localTime);
                        if(localTime > object.timestamp){ //if local object is fresh, then return it
                            // sportsCache.get(fullUrl, function(err, value){
                            //     if(!err && value){
                            //         console.log('found in cache (by id)');
                            //         res.send(value);
                            //     }
                            // });
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
        }else{
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
    const host = req.get('host').slice(0, -6);
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
    const host = req.get('host').slice(0, -6);
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
    const host = req.get('host').slice(0, -6);
    const fullUrl = req.protocol + '://' + host + req.originalUrl + req.body.title;
    const requestID = crypto.randomBytes(20).toString('hex');

    redisClient.hgetall(fullUrl, function(err, object){
        if(err){
            throw err;
        }
        console.log('received hgetall request');
        new Promise((resolve, reject) => {
            if(!object){
                resolve(1);
            }
            if(object.lock === LOCKED){
                console.log('object is locked');
                redisClient.rpush(fullUrl, requestID);
                const intervalId = setInterval(() => {
                    redisClient.hgetall(flagUrl, function(err, object){
                        if(err){
                            throw err;
                        }
                        if(object.lock === UNLOCKED){
                            redisClient.lrange(fullUrl, 0, -1, (err, arr) => {
                                if(arr[0] === requestID){
                                    redisClient.lpop(fullUrl);
                                    redisClient.hmset(fullUrl, { 'lock': LOCKED });
                                    clearInterval(intervalId);
                                    resolve(1);
                                }
                            });
                        }
                    });
                }, 500);
            }else{
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