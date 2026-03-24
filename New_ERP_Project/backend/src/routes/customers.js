const express = require('express');
const { authorizePermission } = require('../middleware/auth');
const router = express.Router();
router.use(authorizePermission('PATIENT_VIEW'));

router.get('/', (req, res) => {
  res.json([
    {id: 1, name: 'Customer 1', email: 'customer1@example.com', phone: '123-456-7890'},
    {id: 2, name: 'Customer 2', email: 'customer2@example.com', phone: '123-456-7891'}
  ]);
});

router.post('/', (req, res) => {
  res.json({message: 'Customer created successfully'});
});

module.exports = router;
