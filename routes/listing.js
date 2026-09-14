if (process.env.NODE_ENV != "production") {
    require("dotenv").config();
}

const express = require('express');
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isOwner, validateListing } = require("../middleware.js");
const listingController = require("../controllers/listing.js");
const multer = require('multer');
const { storage } = require("../cloudConfig.js")
const upload = multer({ storage });

router.route("/")
    .get(wrapAsync(listingController.index))
    .post(isLoggedIn,
        upload.single("listing[image]"),
        validateListing,
        wrapAsync(listingController.createListing));

router.get("/new", isLoggedIn, wrapAsync(listingController.renderNewForm));

router.get("/:id/edit", isLoggedIn, isOwner,
    wrapAsync(listingController.renderEditForm));

router.route("/:id")
    .put(isLoggedIn,
        isOwner,
        upload.single("listing[image]"),
        validateListing,
        wrapAsync(listingController.updateListing))
    .delete(isLoggedIn, isOwner, wrapAsync(listingController.deleteListing))
    .get(wrapAsync(listingController.showListing));

module.exports = router;