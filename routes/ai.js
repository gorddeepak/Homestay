
const express = require('express');
const router = express.Router();
const aiController = require("../controllers/ai.js");
const wrapAsync = require("../utils/wrapAsync.js");



router.post("/generate_description", wrapAsync(aiController.generate_description));
router.post("/chat", wrapAsync(aiController.chat));
router.post("/search", wrapAsync(aiController.searchListingsNL));

module.exports = router;