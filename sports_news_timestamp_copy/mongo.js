const MongoClient = require('mongodb').MongoClient;
 
const MONGO_URL = 'mongodb://localhost:27017';
 
const DB_NAME = 'sports_news';
 
// module.exports = new Promise((resolve, reject) => {
//     MongoClient.connect(MONGO_URL, function(err, client) {
//         console.log("Connected successfully to server");
//         const db = client.db(DB_NAME);
//         resolve(client);  
//       });
// });

MongoClient.connect(MONGO_URL, function(err, client) {
  console.log("Connected successfully to server");
  const db = client.db(DB_NAME);
  module.exports = client;  
});

    // mongo.then((client) => {
    //     const sport_collection = client.db(DB_NAME).collection('sports_articles');

    //     sport_collection.insertOne({
    //         date: new Date(),
    //         title: "Federer won tennis",
    //         text: "Federer won tennis in 500 words"
    //     });

    //     client.close();
    // });

    const sport_collection = mongo_client.db(DB_NAME).collection('sports_articles');
        sport_collection.insertOne({
        date: new Date(),
        title: "Federer won tennis",
        text: "Federer won tennis in 500 words"
    });