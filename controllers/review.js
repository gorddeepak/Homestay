const Review = require("../models/review.js");
const Listing = require("../models/listing.js");

module.exports.postReview = async (req, res, next) => {
    let listing = await Listing.findById(req.params.listingId);
    let newReview = new Review(req.body.review);
    newReview.author = res.locals.currUser._id;
    listing.review.push(newReview);
    await newReview.save();
    await listing.save();
    req.flash("success", "Review was saved successfully!");
    res.redirect(`/listings/${listing._id}`);
};

module.exports.deleteReview = async (req, res, next) => {
    let { listingId, reviewId } = req.params;
    await Listing.findByIdAndUpdate(listingId, { $pull: { review: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review was deleted successfully!");
    res.redirect(`/listings/${listingId}`);
};