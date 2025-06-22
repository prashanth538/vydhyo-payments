const express = require('express');
const router = express.Router();
const { createPayment } = require('../controllers/paymentsController');

router.post('/createPayment', createPayment);

module.exports = router;