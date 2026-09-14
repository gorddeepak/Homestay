const Listing = require("./models/listing");
const Review = require("./models/review");
const { ListingSchema, ReviewSchema } = require("./schema.js");
const ExpressError = require("./utils/expressError.js");

module.exports.isLoggedIn = (req, res, next) => {
    req.session.saveRedirectUrl = req.originalUrl;
    if (!req.isAuthenticated()) {
        req.flash("error", "You must be Logged In!");
        return res.redirect("/login");
    }
    next();
};

module.exports.saveRedirectUrl = (req, res, next) => {
    if (req.session.saveRedirectUrl) {
        res.locals.redirectUrl = req.session.saveRedirectUrl;
    }
    next();
};

module.exports.isOwner = async (req, res, next) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "The requested listing does not exist!");
        return res.redirect("/listings");
    }
    if (!listing.owner.equals(req.user._id)) {
        req.flash("error", "you are not the owner");
        return res.redirect("/listings");
    }
    next();
};

module.exports.validateListing = (req, res, next) => {
    let { error } = ListingSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

module.exports.validateReview = (req, res, next) => {
    let { error } = ReviewSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

module.exports.isAuthor = async (req, res, next) => {
    let { listingId, reviewId } = req.params;
    const review = await Review.findById(reviewId);
    if (!review) {
        req.flash("error", "The requested review does not exist!");
        return res.redirect(`/listings/${listingId}`);
    }
    if (!review.author.equals(req.user._id)) {
        req.flash("error", "you are not the Author");
        return res.redirect(`/listings/${listingId}`);
    }
    next();
};