const multer = require('multer');
const upload = multer();
const express = require('express');
const bodyParser = require('body-parser');

/*  Route for sports articles  */
const sports = require('./routes/sports.route');

/*  MongoDB stuff  */
const mongoose = require('mongoose');
// let dev_db_url = 'mongodb+srv://jay:jaydahisar@forcaching-l6v6u.mongodb.net/test?retryWrites=true&w=majority';  // atlas
let dev_db_url = 'mongodb://admin:0KDZYHie4r4JDmxq@SG-CachingMongo-27125.servers.mongodirector.com:50323,SG-CachingMongo-27126.servers.mongodirector.com:50323,SG-CachingMongo-27127.servers.mongodirector.com:50323/admin?replicaSet=RS-CachingMongo-0&ssl=true'; // scalingo
let mongoDB = dev_db_url;
mongoose.connect(mongoDB);
mongoose.Promise = global.Promise;
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

/*  Constants  */
const PORT = 1235;

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use(upload.array('images')); 
app.use(express.static('public'));

app.use('/sports_redis', sports);

app.listen(PORT, () => {
    console.log('Server is up and running on port numner ' + PORT);
});