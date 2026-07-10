const Listing = require("../models/listing.js");
const maptilerClient = require("@maptiler/client");
maptilerClient.config.apiKey = process.env.MAPTILER_API_KEY;

module.exports.index = async (req, res) => {
    const allListings = await Listing.find({}).populate("review");
    res.render("listings/index.ejs", { allListings });
};

module.exports.renderNewForm = async (req, res) => {
    res.render("listings/new.ejs");
};

module.exports.renderEditForm = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "The requested listing does not exist!");
        return res.redirect("/listings");
    }
    let originalImageUrl = listing.image.url;
    originalImageUrl = originalImageUrl.replace("/upload", "/upload/h_200,w_300");
    res.render("listings/edit.ejs", { listing, originalImageUrl });
};

module.exports.updateListing = async (req, res) => {
    let { id } = req.params;
    let updatedListing = { ...req.body.listing };
    if (req.file) {
        updatedListing.image = { url: req.file.path, filename: req.file.filename };
    };
    const existing = await Listing.findById(id);
    if (existing.location !== updatedListing.location) {
        const result = await maptilerClient.geocoding.forward(updatedListing.location);
        updatedListing.geometry = result.features[0].geometry;
    };
    await Listing.findByIdAndUpdate(id, updatedListing);
    req.flash("success", "Listing was updated successfully!");
    res.redirect(`/listings/${id}`);
};

module.exports.deleteListing = async (req, res) => {
    let { id } = req.params;
    // res.send(req.body.listing)
    const deletedLisitng = await Listing.findByIdAndDelete(id);
    console.log(deletedLisitng);
    req.flash("success", "Listing was deleted successfully!");
    res.redirect("/listings");
};

module.exports.showListing = async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id).populate({ path: "review", populate: { path: "author" } }).populate("owner");
    if (!listing) {
        req.flash("error", "The requested listing does not exist!");
        return res.redirect("/listings");
    }
    res.render("listings/show.ejs", { listing, mapToken: process.env.MAPTILER_API_KEY });
};

module.exports.createListing = async (req, res, next) => {
    const newListing = new Listing(req.body.listing);
    const url = req.file.path;
    const filename = req.file.filename;
    const result = await maptilerClient.geocoding.forward(newListing.location);
    newListing.geometry = result.features[0].geometry;
    newListing.owner = req.user._id;
    newListing.image = { url, filename };
    console.log(newListing);
    await newListing.save();
    req.flash("success", "Listing was saved successfully!");
    res.redirect("/listings");
};