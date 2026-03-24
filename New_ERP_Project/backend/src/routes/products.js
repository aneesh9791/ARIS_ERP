const express = require('express');
const { authorizePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authorizePermission('INVENTORY_VIEW'));

router.get('/', (req, res) => {
  res.json([
    {id: 1, name: 'Product 1', price: 100, category: 'electronics'},
    {id: 2, name: 'Product 2', price: 200, category: 'furniture'}
  ]);
});

router.post('/', (req, res) => {
  res.json({message: 'Product created successfully'});
});

module.exports = router;
