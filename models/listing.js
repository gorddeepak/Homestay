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
});

ListingSchema.post("findOneAndDelete", async (listing) => {
    if (listing) {
        await Review.deleteMany({ _id: { $in: listing.review } });
    }
});

const Listing = mongoose.model("Listing", ListingSchema)
module.exports = Listing

