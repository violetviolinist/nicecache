const express = require('express');
const router = express.Router();

const sports_controller = require('../controllers/sports.controller');


router.get('/', sports_controller.getAll);
router.get('/flushCache', sports_controller.flushCache);
router.get('/flushRedis', sports_controller.flushRedis);
router.get('/:title', sports_controller.getById);
router.put('/', sports_controller.article_update);
router.post('/', sports_controller.article_create);
router.delete('/', sports_controller.article_delete);

module.exports = router;