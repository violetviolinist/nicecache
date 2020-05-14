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

// const redisClient = redis.createClient(6379);

const redisClient = redis.createClient('redis://SG-beproject2020-33787.servers.mongodirector.com:6379');
redisClient.auth('T1uuPcxVGED0j5eImVDkSo0a3WE8NPYj', function(err){
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
        if(err){
            res.status(500).send('Redis initial fetch failed');
        }
        // data object has an entry in the global cache
        if(object && typeof object.latestCompletedWriteRequestId !== 'undefined'){
            if(isNaN(object.readCount)){
                redisClient.hmset(fullUrl, {
                    'readCount': 1,
                }); 
            } else{
                const newReadCount = Number(object.readCount) + 1;
                redisClient.hmset(fullUrl, {
                    'readCount': newReadCount,
                });
                console.log('READ: readCount updated to ' + newReadCount);
            }
            console.log('READ: received hgetall response\nREAD: Object lock status: ' + object.lock);
            new Promise((resolve, reject) => {
                if(object.lock === LOCKED){
                    const currentLatestWriteRequestId = object.latestWriteRequestId;
                    console.log('READ: currentLatestWriteRequestId fetched from redis and set as: ' + currentLatestWriteRequestId);
                    // start polling
                    console.log('READ: before starting polling');
                    const intervalId = setInterval(() => {
                        redisClient.hgetall(fullUrl, function(err, object){
                            if(err){
                                res.status(500).send('Redis fetch failed while polling');
                            }
                            // console.log('currentLatestWriteID: ' + currentLatestWriteRequestId);
                            // console.log('object.latestCompletedWriteID: ' + object.latestCompletedWriteRequestId);
                            if(currentLatestWriteRequestId === object.latestCompletedWriteRequestId){
                                console.log('READ: currentLatestWriteRequestId and latestCompletedWriteRequestIds match, ending polling');
                                // redisClient.hdel(listKey, 'requestId');
                                clearInterval(intervalId);
                                resolve(object);
                            }
                        });
                    }, 500);
                }else{ // if object was found unlocked, then resolve it
                    resolve(object);
                }
            }).then((object) => { // polling over; execute the read request as usual
                sportsCache.get(fullUrl, function(err, value){
                    if(err){
                        res.status(500).send('READ: After polling: Node cache fetch failed');
                    }
                    if(value){
                        console.log('READ: object found in local cache');
                        const localTime = value[1];
                        // console.log('got local time: ' + localTime);
                        if(localTime > object.latestWriteTimestamp){ //if local object is fresh, then return it
                            console.log("READ: local value is fresh (timestamps match)");
                            const newCompletedReadCount = Number(object.completedReadCount) + 1;
                            redisClient.hmset(fullUrl, {
                                'completedReadCount': newCompletedReadCount,
                            });
                            console.log('READ: completedReadCount updated to ' + newCompletedReadCount);
                            res.send(value);
                        }else{ // otherwise, get from DB, set local cache and return
                            console.log('READ: local value is stale (timestamps do not match)');
                            SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                                if(err){
                                    res.status(500).send('After polling: fetch from DB failed');
                                }
                                sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                                    if(err){
                                        res.status(500).send('After polling: setting local cache failed');
                                    }
                                });
                                const newCompletedReadCount = Number(object.completedReadCount) + 1;
                                redisClient.hmset(fullUrl, {
                                    'completedReadCount': newCompletedReadCount,
                                });
                                console.log('READ: completedReadCount updated to ' + newCompletedReadCount);
                                res.send(doc);
                            });
                        }
                    }else{  // if data not present in local cache
                        console.log('READ: object not found in local cache');
                        SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                            if(err){
                                res.status(500).send('After polling: fetch from DB failed');
                            }
                            sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                                if(err){
                                    res.status(500).send('READ: After polling: setting local cache failed');
                                }
                            });
                            redisClient.hgetall(fullUrl, (err, obj) => {
                                const newCompletedReadCount = Number(obj.completedReadCount) + 1;
                                redisClient.hmset(fullUrl, {
                                    'completedReadCount': newCompletedReadCount,
                                });
                                console.log('READ: completedReadCount updated to ' + newCompletedReadCount);
                            });
                            res.send(doc);
                        });
                    }
                });
            });
        }else{ // object not found in global cache; perform read as usual
            console.log('READ: no entry found in global cache');
            SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                if(err){
                    res.status(500).send('no redis entry found: DB fetch failed');
                }
                console.log('READ: making entry to redis with initial values');
                redisClient.hmset(fullUrl, {  
                    'latestWriteTimestamp': Date.now(), 
                    'lock': UNLOCKED,
                    'latestWriteRequestId': 'nil',
                    'latestCompletedWriteRequestId': 'nil',
                    'readCount': 0,
                    'completedReadCount': 0,
                }, function(err) {
                    if(err){
                        res.status(500).send('no redis entry found: redis set after DB fetch failed');
                    }
                    sportsCache.set(fullUrl, [doc, Date.now()], function(err){
                        if(err){
                            res.status(500).send('no redis entry found: node cache set after DB fetch failed');
                        }
                        console.log('READ: inserted object into NodeCache');
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
            res.status(500).send('UPDATE: redis initial fetch failed');
        }
        console.log('WRITE: received hgetall response');
        new Promise((resolve, reject) => {
            if(!object){
                console.log('WRITE: no Redis entry for the object found');
                resolve(1);
            }
            console.log('WRITE: Redis entry for the object found');
            const previousReads = object.readCount;
            console.log('WRITE: previousReads value saved: ' + previousReads);
            redisClient.hmset(fullUrl, {
                'readCount': 0,
                'latestWriteRequestId': requestID,
            });
            console.log('WRITE: readCount value set to 0');
            console.log('WRITE: latestWriteRequetsId at timestamp server set as this request\'s Id: ' + requestID);
            redisClient.rpush(listKey, requestID);
            console.log('WRITE: current requestId pushed to queue');
            console.log('WRITE: Starting poll procedure...');
            const intervalId = setInterval(() => {
                redisClient.hgetall(fullUrl, function(err, obj){
                    if(err){
                        // element on right end may not be the current request's ID (Find a solution)
                        redisClient.rpop(listKey);
                        redisClient.hmset(fullUrl, { 'WRITE: latestWriteRequestId': oldLatestWriteRequestId });
                        res.status(500).send('UPDATE: redit fetch while polling failed');
                    }
                    if(obj.lock === UNLOCKED){
                        redisClient.lrange(listKey, 0, -1, (err, arr) => {
                            // console.log('queue left end: ' + arr[0] + '\nrequestID: ' + requestID);
                            // console.log('previousReads: ' + previousReads + '\ncompletedReadCount: ' + obj.completedReadCount);
                            if(arr[0] === requestID && previousReads === obj.completedReadCount){
                                console.log('WRITE: object found unlocked, previousReads: ' + previousReads + ' obj.completedReads: ' + obj.completedReadCount);
                                redisClient.lpop(listKey);
                                clearInterval(intervalId);
                                resolve(1);
                            }
                        });
                    }
                });
            }, 500);
        }).then((value) => {
            redisClient.hmset(fullUrl, { 'lock': LOCKED });
            console.log('WRITE: object is locked before writing');
            SportsArticle.findOneAndUpdate({ title: req.body.title }, req.body, function(err) {
                if(err){
                    redisClient.hmset(fullUrl, { 'lock': UNLOCKED });
                    res.status(500).send('UPDATE: DB write failed');
                }
                console.log('WRITE: after actual update');
                redisClient.hmset(fullUrl, { 
                'latestWriteTimestamp': Date.now(), 
                'lock': UNLOCKED,
                'latestCompletedWriteRequestId': requestID,
                'completedReadCount': 0,
            });
                console.log('WRITE: object is unlocked after update, completedReadCount set to 0');
                console.log('WRITE: latestCompletedWriteRequestId set as this request\'s Id: ' + requestID);
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