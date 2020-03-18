//key title value 
//DATA
//status
/* for  queuing of data */
//latestCompleteWriteId
//latestInQueueWriteId
/* for checking freshness of data */
//latestWriteTimeStamp


//key title+":"+queure
//QUEUE
//id of request
//prevwriteId 


//READ OPS
// 1. data not in local cache - send present false . Query the database and give 
// new data and new timestamp

//




let redisClient = require('./index.js').client;
const SportsArticle = require('../models/sports.model');
let redisClient = require('./index.js').redisClient;

const LOCKED =1;
const UNLOCKED = 0;


function getElementFromDataBase(title) {
    SportsArticle.findOne({ title: req.params.title }, function(err, doc){
        if(err){
            throw err;
        }
        return doc;
    });
}


function getById(title, present, requestId, timestamp) {
    redisClient.hgetall(title, function (error, result) {
        if (error) {
            console.log(error);
            throw error;
        }
        //if not present in local cache of the server, has to get from the database
        if(!present) {
            // if unlocked directly return from db
            if(result == null || result.status == UNLOCKED)
                return getElementFromDataBase(title);
            //if locked , add to the queue and wait
            else
                redisClient.rpush(title+':Queue', requestId +":"+result.latestInQueueWriteId);
        }
        // if present in local cahe of server 
        else {
            
            //local cache already has fresh data
            if(result == null) {}

            else if(result.status == UNLOCKED) {
                 // local cache already has fresh data 
                if(result.latestWriteTimestamp && timestamp > result.latestWriteTimestamp){}

                else 
                    return getElementFromDataBase(title);
            }
            else
                redisClient.rpush(title+':Queue', requestId +":"+result.latestInQueueWriteId);
        }
    });
}


function updateByID(title, newData, present, requestId, timestamp) {
    redisClient.hgetall(title, function (error, result) {

        if(result == null || result.status == UNLOCKED) {
            // set status as locked and change latest Inqueuewriteid
            SportsArticle.findOneAndUpdate({ title: title }, newData, function(err) {
                if(err){
                    throw err;
                }
                // set inqueue write id as the result.inqueueWriteId
                redisClient.hmset(title, {status:UNLOCKED, latestCompleteWriteId: requestId,
                                          latestInQueueWriteId: result.latestInQueueWriteId ,
                                          latestWriteTimestamp:Date.now()});
                // return success
            });
        }
        else {
            //change latest inqueueWriteId
            redisClient.rpush(title+':Queue', requestId +":"+requestId);
        }


    });

}



