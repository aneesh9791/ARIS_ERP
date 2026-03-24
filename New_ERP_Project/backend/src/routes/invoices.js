const express = require('express');
const { authorizePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authorizePermission('BILLING_VIEW'));

router.get('/', (req, res) => {
  res.json([
    {id: 1, invoice_number: 'INV-001', amount: 1000, status: 'paid'},
    {id: 2, invoice_number: 'INV-002', amount: 1500, status: 'pending'}
  ]);
});

router.post('/', (req, res) => {
  res.json({message: 'Invoice created successfully'});
});

module.exports = router;
