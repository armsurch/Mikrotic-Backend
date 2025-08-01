const express = require('express');
const { getPlans } = require('../controllers/planController');
const { verifyPayment } = require('../controllers/paymentController');

const router = express.Router();

router.get('/plans', getPlans);
router.get('/verify-payment', verifyPayment);

module.exports = router;