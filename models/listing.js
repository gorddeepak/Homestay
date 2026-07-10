const mongoose = require("mongoose")
const Review = require("./review")
const Schema = mongoose.Schema

const ListingSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    image: {
        url: String,
        filename: String
    },
    price: Number,
    location: String,
    country: String,
    geometry: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    // models/listing.js - Add category field
    category: {
        type: String,
        required: true,
        enum: [
            'Mountain Escape',
            'Lakefront Retreat',
            'Snowy Peaks',
            'Coastal Haven',
            'Woodland Hideaway',
            'Desert Sanctuary',
            'Rural Charm',
            'Urban Oasis',
            'Hill Station',
            'Heritage Homestay',
            'Houseboat'
        ]
    },
    review: [
        {
            type: Schema.Types.ObjectId,
            ref: "Review"
        }
    ],
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User"
    }
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Average rating across this listing's reviews.
// Returns null if there are no reviews, or if "review" wasn't populated
// (so callers can safely check `if (listing.averageRating)` either way).
ListingSchema.virtual("averageRating").get(function () {
    if (!this.review || this.review.length === 0) return null;
    if (this.review[0].rating === undefined) return null; // not populated
    const total = this.review.reduce((sum, r) => sum + r.rating, 0);
    return (total / this.review.length).toFixed(1);
});

ListingSchema.post("findOneAndDelete", async (listing) => {
    if (listing) {
        await Review.deleteMany({ _id: { $in: listing.review } });
    }
});

const Listing = mongoose.model("Listing", ListingSchema)
module.exports = Listing