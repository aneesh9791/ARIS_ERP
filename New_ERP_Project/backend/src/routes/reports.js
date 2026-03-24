const express = require('express');
const { authorizePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authorizePermission('REPORTS_VIEW'));

// GET reports endpoint
router.get('/', (req, res) => {
  res.json([
    {id: 1, name: 'Sales Report', type: 'monthly', generated_at: new Date()},
    {id: 2, name: 'Expense Report', type: 'monthly', generated_at: new Date()}
  ]);
});

// POST reports endpoint
router.post('/', (req, res) => {
  res.json({message: 'Report generated successfully'});
});

module.exports = router;
