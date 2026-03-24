const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json([
    {id: 1, name: 'Sales Report', type: 'monthly', generated_at: new Date()},
    {id: 2, name: 'Expense Report', type: 'monthly', generated_at: new Date()}
  ]);
});

router.post('/', (req, res) => {
  res.json({message: 'Report generated successfully'});
});

module.exports = router;
