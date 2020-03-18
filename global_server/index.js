let redis = require('redis');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');


// setting up express server
const PORT = 5000;
const app = express();
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.listen(PORT, () => {
    console.log('Server is up and running on port number ' + PORT);
});


// setting up mongo
const mongoDB = 'mongodb://127.0.0.1/sports_news';
mongoose.connect(mongoDB, { useNewUrlParser: true , useUnifiedTopology: true });
const db = mongoose.connection;

db.on('error', function() {
    console.log('error connecting to mongo');
});



//setting up redis client
let client = redis.createClient({
    host: '127.0.0.1' ,
    port:6379
});
client.on('connect', function () {
    console.log('Redis client connected');
});
client.on('error', function (err) {
    console.log('Something went wrong ' + err);
});



app.get('/test', (req, res) => {
    res.send("success");
});

module.exports.redisClient = client;