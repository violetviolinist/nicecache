const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let SportsArticleSchema = new Schema({
    date: {type: Date, required: true},
    title: {type: String, required: true},
    text: {type: String, required: true},
    tags: [String],
    images: [String]
});


module.exports = mongoose.model('SportsArticle', SportsArticleSchema);