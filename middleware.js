const Listing = require("./models/listing");
const Review = require("./models/review");
const { ListingSchema, ReviewSchema } = require("./schema.js");
const ExpressError = require("./utils/expressError.js");

module.exports.isLoggedIn = (req,res,next)=>{
    req.session.saveRedirectUrl = req.originalUrl;
    if (!req.isAuthenticated()){
        req.flash("error", "You must be Logged In!");
        return res.redirect("/login");
    }
    next();
};

module.exports.saveRedirectUrl = (req,res,next)=>{
    if (req.session.saveRedirectUrl){
        res.locals.redirectUrl = req.session.saveRedirectUrl;
    }
    next();
};

module.exports.isOwner = async(req,res,next)=>{
    let {id} = req.params;
    const listing = await Listing.findById(id);
    if (!res.locals.currUser._id.equals(listing.owner)){
        req.flash("error", "you are not the owner");
        return res.redirect("/listings");
    }
    next();
};

module.exports.validateListing = (req,res,next) => {
    let {error} = ListingSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el)=>error.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};


module.exports.validateReview = (req,res,next) => {
    let {error} = ReviewSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el)=>error.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

module.exports.isAuthor = async(req,res,next)=>{
    let {listingId,reviewId} = req.params;
    const review = await Review.findById(reviewId);
    if (!res.locals.currUser._id.equals(review.author)){
        req.flash("error", "you are not the Author");
        return res.redirect(`/listings/${listingId}`);
    }
    next();
};