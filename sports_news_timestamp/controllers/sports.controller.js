const SportsArticle = require('../models/sports.model');

const NodeCache = require( "node-cache" );
const sportsCache = new NodeCache();

const redis = require('redis');
const redisClient = redis.createClient('redis://SG-globalTimestamp-27117.servers.mongodirector.com:6379');
redisClient.auth('4sdyNCZ7F3eRyJ3Ou73fifraLz9YpyNs', function(err){
    if(err){
        throw err;
    }
    console.log('successfully authenticated with redis cluster');
});

exports.getAll = function (req, res) {
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
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
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    redisClient.get(fullUrl, function(err, redisTime){
        if(err){
            throw err;
        }
        if(redisTime){
            console.log('got redis time: ' + redisTime);
            sportsCache.get(fullUrl, function(err, value){
                if(err){
                    throw err;
                }
                if(value){
                    const localTime = value[1];
                    console.log('got local time: ' + localTime);
                    if(localTime > redisTime){ //if local object is fresh, then return it
                        sportsCache.get(fullUrl, function(err, value){
                            if(!err && value){
                                console.log('found in cache (by id)');
                                res.send(value);
                            }
                        });  
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
                }else{
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
        }else{
            console.log('redisTime not found');
            SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                if(err){
                    throw err;
                }
                redisClient.set(fullUrl, Date.now(), function(err) {
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
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl + req.body.title;
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
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl + req.body.title;
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
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl + req.body.title;
    SportsArticle.findOneAndUpdate({ title: req.body.title }, req.body, function(err) {
        if(err){
            throw err;
        }

        redisClient.set(fullUrl, Date.now());

        res.send('Article updated successfully');
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