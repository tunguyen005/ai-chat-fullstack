const express = require('express');
const router = express.Router();
const { exportDocx, exportTxt } = require('../controllers/exportController.js');

// POST /api/export/file  — main export, handles all types
router.post('/file', exportFile);

// POST /api/export/docx  — backward compat
router.post('/docx', exportDocx);

module.exports = router;

