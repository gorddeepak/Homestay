if (process.env.NODE_ENV != "production") {
    require("dotenv").config();
}

const express = require('express');
const router = express.Router();
const Listing = require("../models/listing.js");
const { ListingSchema, ReviewSchema } = require("../schema.js");
const wrapAsync = require("../utils/wrapAsync.js");
const ExpressError = require("../utils/expressError.js");
const { isLoggedIn, isOwner, validateListing } = require("../middleware.js");
const listingController = require("../controllers/listing.js");
const multer = require('multer');
const { storage } = require("../cloudConfig.js")
const upload = multer({ storage });

router.route("/")
    .get(wrapAsync(listingController.index))
    .post(isLoggedIn,
        validateListing,
        upload.single("listing[image]"),
        wrapAsync(listingController.createListing));

router.get("/new", isLoggedIn, wrapAsync(listingController.renderNewForm));

router.get("/:id/edit", isLoggedIn, isOwner,
    wrapAsync(listingController.renderEditForm));

router.route("/:id")
    .put(isLoggedIn,
        upload.single("listing[image]"),
        validateListing,
        isOwner,
        wrapAsync(listingController.updateListing))
    .delete(isLoggedIn, isOwner, wrapAsync(listingController.deleteListing))
    .get(wrapAsync(listingController.showListing));

module.exports = router;