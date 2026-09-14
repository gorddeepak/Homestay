const Joi = require('joi');

// single source of truth, used by Joi validation and the Mongoose model
const CATEGORIES = [
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
];

module.exports.CATEGORIES = CATEGORIES;

module.exports.ListingSchema = Joi.object({
    listing: Joi.object({
        title: Joi.string().required(),
        description: Joi.string().required(),
        image: Joi.string().allow("", null),
        price: Joi.number().integer().required(),
        location: Joi.string().required(),
        country: Joi.string().required(),
        category: Joi.string().valid(...CATEGORIES).required(),
    }).required(),
});

module.exports.ReviewSchema = Joi.object({
    review: Joi.object({
        rating: Joi.number().integer().min(1).max(5).required(),
        comment: Joi.string().required(),
        createdAt: Joi.date(),
    }).required(),
});