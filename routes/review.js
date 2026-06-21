const express = require('express');
const router = express.Router({ mergeParams: true });
const ExpressError = require("../utils/expressError.js");
const { ListingSchema, ReviewSchema } = require("../schema.js");
const Review = require("../models/review.js");
const Listing = require("../models/listing.js");
const wrapAsync = require("../utils/wrapAsync.js");
const { validateReview, isLoggedIn, isAuthor } = require("../middleware.js");
const reviewController = require("../controllers/review.js");

router.post("/",
    validateReview, isLoggedIn,
    wrapAsync(reviewController.postReview));

router.delete("/:reviewId", isLoggedIn, isAuthor, wrapAsync(reviewController.deleteReview));

module.exports = router;