const multer = require('multer');
const upload = multer();
const express = require('express');
const bodyParser = require('body-parser');

/*  Route for sports articles  */
const sports = require('./routes/sports.route');

/*  MongoDB stuff  */
const mongoose = require('mongoose');
// let dev_db_url = 'mongodb+srv://jay:jaydahisar@forcaching-l6v6u.mongodb.net/test?retryWrites=true&w=majority';
let dev_db_url = 'mongodb://admin:8sKoxXn1lpM8pboa@SG-nicecache-30609.servers.mongodirector.com:27017/admin';
let mongoDB = dev_db_url;
mongoose.connect(mongoDB);
mongoose.Promise = global.Promise;
let db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

/*  Constants  */
const PORT = 1235;

const app = express();

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use(upload.array('images')); 
app.use(express.static('public'));

app.use('/sports_redis', sports);

app.listen(PORT, () => {
    console.log('Server is up and running on port numner ' + PORT);
});