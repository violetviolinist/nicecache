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
    SportsArticle.find({}, function(err, doc) {
        if(err){
            throw err;
        }
        redisClient.set(fullUrl, doc.toString());
        res.send(doc);
    });
};

exports.getById = function(req, res) {
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    redisClient.get(fullUrl, function(err, doc){
        if(err){
            throw err;
        }
        if(doc){
            console.log('doc found in redis');
            res.send(doc);
        }else{
            console.log('doc not found in redis');
            SportsArticle.findOne({ title: req.params.title }, function(err, doc){
                if(err){
                    throw err;
                }
                if(doc){
                    redisClient.set(fullUrl, doc.toString(), function(err){
                        if(err){
                            throw err;
                        }
                    });
                res.send(doc);
                }else{
                    res.send('not found');
                }
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
    SportsArticle.findOneAndUpdate({ title: req.body.title }, { $set: req.body }, function(err, doc) {
        if(err){
            throw err;
        }
        redisClient.set(fullUrl, doc.toString());
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