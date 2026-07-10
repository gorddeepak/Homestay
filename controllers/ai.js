const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({});
const { google } = require("@ai-sdk/google");
const { streamText, tool, stepCountIs, generateObject } = require("ai");
const { z } = require("zod");
const Listing = require("../models/listing.js");
const Review = require("../models/review.js");


module.exports.generate_description = async (req, res) => {
  const { title, location, category } = req.body;
  const prompt = `Write a warm, editorial-style description for a homestay listing in exactly 2-3 sentences.
Highlight the standout feature implied by the category and location.
Avoid generic phrases like "perfect getaway," "home away from home," or "hidden gem."
Only use the details provided below — do not invent a location, category, or title that are not mentioned.
If a detail is missing, write around it naturally without guessing.


Example 1:
Title: Riverside Cottage
Location: Rishikesh, Uttarakhand
Category: Woodland Hideaway
Description: Wake to birdsong and the hush of the Ganges just steps from your door. This wooden cottage tucks itself into a quiet grove, where mornings move slower and the river sets the pace for everything else.

Example 2:
Title: Skyline Loft
Location: Mumbai, Maharashtra
Category: Urban Oasis
Description: Sixteen floors up, the city hums but never intrudes. Floor-to-ceiling windows frame Mumbai's skyline from a loft designed for people who want the pulse of downtown without sacrificing quiet at night.

Now write one for:
Title: ${title}
Location: ${location}
Category: ${category}
Description:`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.1-flash-lite",
    input: prompt,
    system_instruction: "You are a warm, editorial copywriter for a homestay booking site.",
  });
  res.json({ description: interaction.output_text });
}



const searchListingsTool = tool({
  description: "Search homestay listings by location, country, price range, or category",
  inputSchema: z.object({
    location: z.string().optional().describe("City or region to search in"),
    country: z.string().optional().describe("Country to search in"),
    maxPrice: z.number().optional().describe("Maximum price per night"),
    category: z.string().optional().describe("Listing category"),
  }),
  execute: async ({ location, country, maxPrice, category }) => {
    const query = {};
    if (location) query.location = { $regex: location, $options: "i" };
    if (country) query.country = { $regex: country, $options: "i" };
    if (maxPrice) query.price = { $lte: maxPrice };
    if (category) query.category = category;
    const listings = await Listing.find(query).limit(5);
    return listings.map(l => ({
      title: l.title, location: l.location, country: l.country, price: l.price, category: l.category,
    }));
  },
});

const getListingReviewsTool = tool({
  description: "Get and summarize guest reviews for a specific listing by title",
  inputSchema: z.object({
    listingTitle: z.string().describe("The title of the listing"),
  }),
  execute: async ({ listingTitle }) => {
    const listing = await Listing.findOne({ title: { $regex: listingTitle, $options: "i" } }).populate("review");
    if (!listing) return { error: "Listing not found" };
    return {
      title: listing.title,
      reviews: listing.review.map(r => ({ rating: r.rating, comment: r.comment })),
    };
  },
});

module.exports.chat = async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const result = streamText({
      model: google("gemini-3.1-flash-lite"),
      system: `You are a helpful, warm assistant for Homestay, an accommodation booking platform.
Guidelines:
- Keep responses concise — 2-4 sentences unless listing multiple results.
- When showing search results, list title, location, and price clearly.
- When summarizing reviews, give an honest, balanced summary. Do not repeat every review verbatim.
- If no matching listings or reviews are found, say so plainly rather than guessing.
- Never invent details that weren't returned by a tool.
- dont just simply dump the listing details, present it in conversational way.
- When a user mentions a country using an abbreviation or informal name (e.g. "US", "USA", "America", "UK"), try the full formal name when calling searchListings (e.g. "United States", "United Kingdom"). If a search returns no results, consider trying an alternate common name for that country before telling the user nothing was found.`,
      messages,
      tools: { searchListings: searchListingsTool, getListingReviews: getListingReviewsTool },
      stopWhen: stepCountIs(5),
    });

    result.pipeTextStreamToResponse(res);
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Chat failed, please try again." });
  }
};

const searchFilterSchema = z.object({
  location: z.string().optional().describe("City or region mentioned"),
  country: z.string().optional().describe("Country mentioned"),
  minPrice: z.number().optional().describe("Minimum price per night, if the user says 'more than X', 'above X', 'at least X'"),
  maxPrice: z.number().optional().describe("Maximum price per night, if the user says 'under X', 'cheap', 'less than X', or gives a range's upper bound"),
  category: z.string().optional().describe("Category if implied"),
});

module.exports.searchListingsNL = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    const { object: filters } = await generateObject({
      model: google("gemini-3.1-flash-lite"),
      schema: searchFilterSchema,
      prompt: `Extract search filters from this homestay search query: "${query}"
      - if a user asks for more than a amount then act accordingly and dont return the listings with less price.
- When a user mentions a country using an abbreviation or informal name (e.g. "US", "USA", "America", "UK"), try the full formal name (e.g. "United States", "United Kingdom"). If a search returns no results, consider trying an alternate common name for that country before telling the user nothing was found.`,
    });

    const dbQuery = {};
    if (filters.location) dbQuery.location = { $regex: filters.location, $options: "i" };
    if (filters.country) dbQuery.country = { $regex: filters.country, $options: "i" };
    if (filters.category) dbQuery.category = { $regex: filters.category, $options: "i" };

    if (filters.minPrice || filters.maxPrice) {
      dbQuery.price = {};
      if (filters.minPrice) dbQuery.price.$gte = filters.minPrice;
      if (filters.maxPrice) dbQuery.price.$lte = filters.maxPrice;
    }

    const listings = await Listing.find(dbQuery).limit(20);
    res.render("includes/listing.ejs", { listings, layout: false }); // layout:false if using express-ejs-layouts
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
};