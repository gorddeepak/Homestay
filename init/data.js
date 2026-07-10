// ─── Review pool ────────────────────────────────────────────────────────────
// Each listing picks 3–4 reviews from this shared pool.
// author refs are filled in by init.js after users are created.

const reviewPool = [
  { rating: 5, comment: "Absolutely stunning place! Every detail was perfect. Would book again in a heartbeat." },
  { rating: 5, comment: "One of the best stays of my life. The host was incredibly welcoming and the location was unbeatable." },
  { rating: 5, comment: "Exceeded every expectation. The photos genuinely don't do it justice." },
  { rating: 4, comment: "Really lovely spot. Minor issue with the WiFi but the host sorted it out quickly." },
  { rating: 4, comment: "Great location, clean and well-equipped. Would definitely recommend to friends." },
  { rating: 4, comment: "Very comfortable and exactly as described. A peaceful getaway from the city." },
  { rating: 5, comment: "Woke up to the most incredible view every morning. Pure magic." },
  { rating: 3, comment: "Nice place overall, but the check-in instructions were a bit confusing. Once inside, it was great." },
  { rating: 5, comment: "Perfect for a romantic trip. Cozy, private, and beautifully decorated." },
  { rating: 4, comment: "Solid stay. The kitchen was well-stocked and the beds were super comfortable." },
  { rating: 5, comment: "We loved every second. The surrounding area had so much to explore." },
  { rating: 3, comment: "Good value for the price. A few things could use updating but nothing that ruined the trip." },
  { rating: 5, comment: "Honestly felt like home. Will be back next year for sure." },
  { rating: 4, comment: "The highlight of our whole trip. Beautiful property and great amenities." },
  { rating: 5, comment: "Breathtaking scenery and a super comfortable interior. 10/10." },
  { rating: 4, comment: "Really charming place. Quiet neighborhood and easy access to local restaurants." },
  { rating: 5, comment: "Host went above and beyond. Left a welcome basket and local tips — loved the personal touch." },
  { rating: 3, comment: "Decent stay. The listing photos were a tad optimistic but it was still enjoyable." },
  { rating: 5, comment: "We've stayed at a lot of places but this one stands out. Truly special." },
  { rating: 4, comment: "Clean, spacious, and well-located. The sunsets from the balcony were unforgettable." },
  { rating: 5, comment: "The staff treated us like family. Homemade breakfast every morning was the best part." },
  { rating: 4, comment: "Great for a family trip — plenty of space and the kids loved the garden." },
  { rating: 5, comment: "Incredible value for what you get. Already planning our next visit." },
  { rating: 2, comment: "Location was great but the property needs some maintenance — plumbing was noisy all night." },
  { rating: 5, comment: "Insanely peaceful. No noise, no distractions, just birdsong and fresh air." },
  { rating: 4, comment: "Loved the local touches in the decor. Felt authentic, not like a generic rental." },
  { rating: 5, comment: "The host arranged a local guide for us — made the whole trip so much richer." },
  { rating: 3, comment: "Fine for a short stay. Wouldn't call it luxurious but it was clean and safe." },
  { rating: 5, comment: "Hands down the most photogenic place we've ever stayed. Instagram gold." },
  { rating: 4, comment: "Quiet, comfortable, and the host was quick to respond to every message." },
  { rating: 5, comment: "This place completely changed how I think about a 'homestay.' It felt like visiting relatives." },
  { rating: 4, comment: "Beautiful architecture and a genuinely warm welcome. Only wish we'd booked more nights." },
  { rating: 5, comment: "The rooftop view alone is worth the price. Add in the hospitality and it's unbeatable." },
  { rating: 3, comment: "Good base for exploring the area, though the room itself was smaller than expected." },
  { rating: 5, comment: "Every meal the host cooked for us was better than the last. Incredible hospitality." },
  { rating: 4, comment: "Spotless, stylish, and surprisingly quiet given how central it is." },
  { rating: 5, comment: "Drifting past the paddy fields at sunset was unforgettable — the crew cooked better than most restaurants." },
  { rating: 5, comment: "The rooftop overlooking the palace was worth every rupee. Felt like staying in a piece of history." },
  { rating: 4, comment: "Loved waking up to temple bells and the smell of chai from the courtyard below." },
  { rating: 4, comment: "Cool mountain air, mist over the tea gardens, and the warmest family running the place." },
  { rating: 5, comment: "The old haveli's carved doorways and hand-painted walls made this stay feel like a museum you could sleep in." },
  { rating: 5, comment: "Watching the dunes turn gold at sunset from our own terrace was worth the whole trip." },
  { rating: 4, comment: "The desert camp dinner under the stars was the best night of our trip." },
  { rating: 5, comment: "Skiing right up to the door every morning — didn't want to leave." },
  { rating: 4, comment: "The lake view from bed was unbeatable, and the boatman gave a great tour." },
  { rating: 5, comment: "Waking up in the clouds above the tea estate was worth every penny." },
];

// ─── Listings ────────────────────────────────────────────────────────────────
// reviewIndices: picks from reviewPool above (0-based). Use 3–4 per listing.
// Categories kept consistent with the app's filter set:
// Rural Charm, Urban Oasis, Mountain Escape, Woodland Hideaway, Coastal Haven,
// Lakefront Retreat, Snowy Peaks, Desert Sanctuary, Hill Station, Heritage Homestay, Houseboat.

const sampleListings = [
  // ── Curated Selection ──────────────────────────────────────────────────

  {
    title: "Ivy-Draped Villa Overlooking the Chianti Hills",
    description:
      "A beautifully restored 18th-century villa surrounded by vineyards and olive groves. Sip local wine on the terrace as the sun sets over the Tuscan hills.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1543731068-7e0f5beff43a?auto=format&fit=crop&w=1200&q=80",
    },
    price: 25000,
    location: "Florence",
    country: "Italy",
    geometry: { type: "Point", coordinates: [11.2558, 43.7696] },
    category: "Rural Charm",
    reviewIndices: [0, 3, 12, 25],
  },
  {
    title: "Sunlit Loft Steps from Times Square",
    description:
      "A stylish, exposed-brick loft in the heart of Manhattan with floor-to-ceiling windows. Wake up and be anywhere in the city within minutes.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
    },
    price: 14000,
    location: "New York City",
    country: "United States",
    geometry: { type: "Point", coordinates: [-74.006, 40.7128] },
    category: "Urban Oasis",
    reviewIndices: [5, 9, 15, 33],
  },
  {
    title: "Private-Pool Villa in the Dubai Desert",
    description:
      "A modern oasis surrounded by golden dunes, with a private pool, outdoor majlis, and evening views made for stargazing.",
    image: {
      filename: "listingimage",
      url: "/images/dubai.png",
    },
    price: 50000,
    location: "Dubai",
    country: "United Arab Emirates",
    geometry: { type: "Point", coordinates: [55.2708, 25.2048] },
    category: "Desert Sanctuary",
    reviewIndices: [0, 4, 12, 28],
  },
  {
    title: "A Private Island All to Yourselves",
    description:
      "No neighbors, no noise — just white sand, turquoise water, and a fully staffed villa. Includes a private boat transfer and daily snorkeling excursions.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?auto=format&fit=crop&w=1200&q=80",
    },
    price: 100000,
    location: "Fiji",
    country: "Fiji",
    geometry: { type: "Point", coordinates: [178.065, -17.7134] },
    category: "Coastal Haven",
    reviewIndices: [4, 12, 28],
  },
  {
    title: "Minimalist Designer Apartment in Shibuya",
    description:
      "A sleek, compact apartment moments from Shibuya Crossing. Smart storage, a Japanese soaking tub, and skyline views make this the perfect city base.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1200&q=80",
    },
    price: 18000,
    location: "Tokyo",
    country: "Japan",
    geometry: { type: "Point", coordinates: [139.6917, 35.6895] },
    category: "Urban Oasis",
    reviewIndices: [1, 16, 32],
  },
  {
    title: "Restored Haveli in the Pink City",
    description:
      "A lovingly restored 19th-century haveli near Hawa Mahal, with hand-painted frescoes, a shaded courtyard, and rooftop dinners under the stars.",
    image: {
      filename: "listingimage",
      url: "/images/haveli-jaipur.png",
    },
    price: 7500,
    location: "Jaipur",
    country: "India",
    geometry: { type: "Point", coordinates: [75.7873, 26.9124] },
    category: "Heritage Homestay",
    reviewIndices: [16, 36, 39, 20],
  },
  {
    title: "Suspended Treehouse in a Pacific Northwest Forest",
    description:
      "Sleep among the canopy in this handcrafted treehouse with a spiral staircase, skylight, and wraparound deck overlooking a fern-filled ravine.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80",
    },
    price: 8500,
    location: "Portland",
    country: "United States",
    geometry: { type: "Point", coordinates: [-122.6765, 45.5231] },
    category: "Woodland Hideaway",
    reviewIndices: [8, 18, 24],
  },
  {
    title: "Floating Houseboat on the Alleppey Backwaters",
    description:
      "Drift past coconut groves and paddy fields aboard a traditional Kerala houseboat, complete with a private chef cooking fresh catch on board.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80",
    },
    price: 9000,
    location: "Alleppey",
    country: "India",
    geometry: { type: "Point", coordinates: [76.3388, 9.4981] },
    category: "Houseboat",
    reviewIndices: [35, 20, 34, 10],
  },
  {
    title: "Turquoise-Water Condo Steps from Cancun Beach",
    description:
      "Floor-to-ceiling ocean views and direct beach access. Infinity pool, private balcony, and five-minute walk to the best seafood in town.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=80",
    },
    price: 16000,
    location: "Cancun",
    country: "Mexico",
    geometry: { type: "Point", coordinates: [-86.8475, 21.1619] },
    category: "Coastal Haven",
    reviewIndices: [4, 13, 19, 29],
  },
  {
    title: "Lakeside Haveli Suite Facing the City Palace",
    description:
      "A jharokha-balcony suite in a heritage haveli directly across from Udaipur's City Palace, with unobstructed views over Lake Pichola.",
    image: {
      filename: "listingimage",
      url: "/images/udaipur.png",
    },
    price: 12000,
    location: "Udaipur",
    country: "India",
    geometry: { type: "Point", coordinates: [73.7125, 24.5854] },
    category: "Heritage Homestay",
    reviewIndices: [36, 16, 32, 26],
  },
  {
    title: "Timber A-Frame Cabin Above Aspen Ridge",
    description:
      "Tucked into a pine forest with panoramic Rocky Mountain views. Wraparound deck, wood-burning stove, and a hot tub perfect for stargazing.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1518602164578-cd0074062767?auto=format&fit=crop&w=1200&q=80",
    },
    price: 11000,
    location: "Aspen",
    country: "United States",
    geometry: { type: "Point", coordinates: [-106.8175, 39.1911] },
    category: "Mountain Escape",
    reviewIndices: [6, 10, 14, 31],
  },
  {
    title: "Fisherman's Cabin on the Shores of Lake Tahoe",
    description:
      "A cozy, wood-paneled cabin with a private dock. Kayak at sunrise, fish off the pier, and roast marshmallows by the fire pit at night.",
    image: {
      filename: "listingimage",
      url: "/images/tahoe-lake-listing.png",
    },
    price: 9500,
    location: "Lake Tahoe",
    country: "United States",
    geometry: { type: "Point", coordinates: [-120.0433, 39.0968] },
    category: "Lakefront Retreat",
    reviewIndices: [2, 7, 23],
  },
  {
    title: "Colonial Bungalow in the Munnar Tea Estates",
    description:
      "A creaky-floored planter's bungalow surrounded by rolling tea gardens, with a wraparound veranda and mist rolling in every morning.",
    image: {
      filename: "listingimage",
      url: "/images/munnar-bunglow.png",
    },
    price: 6500,
    location: "Munnar",
    country: "India",
    geometry: { type: "Point", coordinates: [77.0595, 10.0889] },
    category: "Hill Station",
    reviewIndices: [38, 24, 31, 45],
  },
  {
    title: "Glass-Walled Penthouse Above Downtown LA",
    description:
      "Floor-to-ceiling glass, a private rooftop plunge pool, and 360-degree skyline views. The ultimate base for a glamorous city escape.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
    },
    price: 35000,
    location: "Los Angeles",
    country: "United States",
    geometry: { type: "Point", coordinates: [-118.2437, 34.0522] },
    category: "Urban Oasis",
    reviewIndices: [0, 6, 11, 32],
  },
  {
    title: "Timber Chalet on the Verbier Piste",
    description:
      "Ski straight from the front door of this hand-built alpine chalet. Sauna, fireplace lounge, and a private chef available on request.",
    image: {
      filename: "listingimage",
      url: "/images/verbier-sw.png",
    },
    price: 30000,
    location: "Verbier",
    country: "Switzerland",
    geometry: { type: "Point", coordinates: [7.2266, 46.0965] },
    category: "Snowy Peaks",
    reviewIndices: [1, 14, 30, 42],
  },
  {
    title: "Riverside Cottage Below the Rishikesh Ashrams",
    description:
      "A simple, sunlit cottage on the banks of the Ganges, footsteps from the Lakshman Jhula. Morning yoga on the terrace, river rafting nearby.",
    image: {
      filename: "listingimage",
      url: "/images/rushikesh-cottage.png",
    },
    price: 4500,
    location: "Rishikesh",
    country: "India",
    geometry: { type: "Point", coordinates: [78.2676, 30.0869] },
    category: "Lakefront Retreat",
    reviewIndices: [24, 8, 27, 17],
  },
  {
    title: "Canvas Safari Lodge on the Serengeti Plains",
    description:
      "Fall asleep to the sound of the savanna in this luxury tented lodge. Guided game drives put you in the middle of the Great Migration.",
    image: {
      filename: "listingimage",
      url: "/images/senegete plains.png",
    },
    price: 40000,
    location: "Serengeti National Park",
    country: "Tanzania",
    geometry: { type: "Point", coordinates: [34.8333, -2.3333] },
    category: "Rural Charm",
    reviewIndices: [2, 16, 18, 26],
  },
  {
    title: "Whitewashed Portuguese Villa in North Goa",
    description:
      "A breezy villa with azulejo tiles and a private plunge pool, five minutes from Anjuna's beach shacks and Wednesday flea market.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1587922546307-776227941871?auto=format&fit=crop&w=1200&q=80",
    },
    price: 8500,
    location: "Anjuna, Goa",
    country: "India",
    geometry: { type: "Point", coordinates: [73.7404, 15.5741] },
    category: "Coastal Haven",
    reviewIndices: [9, 19, 25, 29],
  },
  {
    title: "17th-Century Canal House on the Prinsengracht",
    description:
      "Original beamed ceilings, a spiral staircase, and floor-to-ceiling windows over the canal. A true slice of Amsterdam's Golden Age.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?auto=format&fit=crop&w=1200&q=80",
    },
    price: 20000,
    location: "Amsterdam",
    country: "Netherlands",
    geometry: { type: "Point", coordinates: [4.9041, 52.3676] },
    category: "Urban Oasis",
    reviewIndices: [3, 9, 15, 34],
  },
  {
    title: "Heritage Homestay Inside a Living Havelis Lane",
    description:
      "Stay with a local family in a centuries-old haveli in the Blue City, with home-cooked Marwari thalis and views over Jodhpur's rooftops.",
    image: {
      filename: "listingimage",
      url: "/images/jodhpur-heritage.png",
    },
    price: 5500,
    location: "Jodhpur",
    country: "India",
    geometry: { type: "Point", coordinates: [73.0243, 26.2389] },
    category: "Heritage Homestay",
    reviewIndices: [16, 20, 37, 34],
  },
  {
    title: "Cliffside Cottage Above Palolem Beach",
    description:
      "A palm-thatched cottage on a quiet headland overlooking Palolem's crescent bay. Fall asleep to the sound of the waves below.",
    image: {
      filename: "listingimage",
      url: "/images/palolem-goa.png",
    },
    price: 6000,
    location: "Palolem, Goa",
    country: "India",
    geometry: { type: "Point", coordinates: [74.0231, 15.0100] },
    category: "Coastal Haven",
    reviewIndices: [4, 13, 19, 29],
  },
  {
    title: "Thatched-Roof Cottage in the Cotswolds",
    description:
      "A postcard-perfect stone cottage with roses climbing the walls, a wood-burning fireplace, and a garden made for afternoon tea.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80",
    },
    price: 12000,
    location: "Cotswolds",
    country: "United Kingdom",
    geometry: { type: "Point", coordinates: [-1.7832, 51.8336] },
    category: "Rural Charm",
    reviewIndices: [5, 8, 17, 27],
  },
  {
    title: "Elegant Brownstone Steps from Boston Common",
    description:
      "A meticulously restored 1880s brownstone with original moldings and a private garden patio, blocks from Boston's best museums.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    },
    price: 17000,
    location: "Boston",
    country: "United States",
    geometry: { type: "Point", coordinates: [-71.0589, 42.3601] },
    category: "Urban Oasis",
    reviewIndices: [7, 13, 33],
  },
  {
    title: "Deodar-Wood Cottage in the Manali Hills",
    description:
      "A pine-forest cottage with a wood stove and mountain-facing balcony, a short walk from the Beas River and apple orchards.",
    image: {
      filename: "listingimage",
      url: "/images/manali.png",
    },
    price: 5000,
    location: "Manali",
    country: "India",
    geometry: { type: "Point", coordinates: [77.1892, 32.2432] },
    category: "Hill Station",
    reviewIndices: [6, 14, 22, 31],
  },
  {
    title: "Private-Pool Bungalow on Bali's Southern Coast",
    description:
      "An open-air bungalow with a plunge pool, thatched roof, and daily housekeeping. A five-minute stroll to the beach and Uluwatu's best cafes.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80",
    },
    price: 13000,
    location: "Bali",
    country: "Indonesia",
    geometry: { type: "Point", coordinates: [115.1889, -8.4095] },
    category: "Coastal Haven",
    reviewIndices: [0, 10, 19, 25],
  },
  {
    title: "Stone Homestay Beneath the Ladakh Peaks",
    description:
      "A traditional mud-and-stone Ladakhi home run by a local family, with butter tea by the stove and views of snow-capped passes.",
    image: {
      filename: "listingimage",
      url: "/images/ladakh.png",
    },
    price: 4000,
    location: "Leh",
    country: "India",
    geometry: { type: "Point", coordinates: [77.5771, 34.1526] },
    category: "Mountain Escape",
    reviewIndices: [20, 26, 31, 24],
  },
  {
    title: "Log Cabin with Rockies Views in Banff",
    description:
      "A cozy timber cabin with a stone fireplace and floor-to-ceiling windows framing the Canadian Rockies. Steps from hiking and hot springs.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1200&q=80",
    },
    price: 10500,
    location: "Banff",
    country: "Canada",
    geometry: { type: "Point", coordinates: [-115.5721, 51.1784] },
    category: "Mountain Escape",
    reviewIndices: [6, 14, 22],
  },
  {
    title: "Riverfront Ghat House in Old Varanasi",
    description:
      "A restored ghat-front home with a rooftop looking straight over the Ganges at Assi Ghat — ideal for sunrise boat rides and evening aarti.",
    image: {
      filename: "listingimage",
      url: "/images/varanasi.png",
    },
    price: 5500,
    location: "Varanasi",
    country: "India",
    geometry: { type: "Point", coordinates: [83.0047, 25.3176] },
    category: "Heritage Homestay",
    reviewIndices: [16, 20, 26, 8],
  },
  {
    title: "Pastel Art Deco Suite in South Beach",
    description:
      "A perfectly preserved 1930s Art Deco apartment with terrazzo floors and a private balcony, two blocks from the Miami sand.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
    },
    price: 11500,
    location: "Miami",
    country: "United States",
    geometry: { type: "Point", coordinates: [-80.1918, 25.7617] },
    category: "Urban Oasis",
    reviewIndices: [1, 11, 15, 32],
  },
  {
    title: "Colonial Cottage in the Coorg Coffee Hills",
    description:
      "A plantation cottage surrounded by coffee bushes and pepper vines, with a firepit deck and estate walks led by the resident host.",
    image: {
      filename: "listingimage",
      url: "/images/coorg.png",
    },
    price: 6500,
    location: "Coorg",
    country: "India",
    geometry: { type: "Point", coordinates: [75.8069, 12.3375] },
    category: "Hill Station",
    reviewIndices: [38, 24, 22, 16],
  },
  {
    title: "Infinity-Pool Villa Above Phuket's Cliffs",
    description:
      "A cliffside villa with a private infinity pool that seems to spill into the Andaman Sea. Sunset cocktails included every evening.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=1200&q=80",
    },
    price: 21000,
    location: "Phuket",
    country: "Thailand",
    geometry: { type: "Point", coordinates: [98.3381, 7.8804] },
    category: "Coastal Haven",
    reviewIndices: [2, 16, 26],
  },
  {
    title: "Turreted Castle in the Scottish Highlands",
    description:
      "Sleep in a genuine stone castle complete with turrets, a great hall, and roaring fireplaces. Surrounded by heather-covered glens.",
    image: {
      filename: "listingimage",
      url: "/images/highlands.png",
    },
    price: 45000,
    location: "Scottish Highlands",
    country: "United Kingdom",
    geometry: { type: "Point", coordinates: [-4.2026, 57.307] },
    category: "Rural Charm",
    reviewIndices: [3, 8, 18, 27],
  },
  {
    title: "Art-Filled Bungalow in South Mumbai",
    description:
      "A restored Art Deco bungalow near Marine Drive, filled with local art and vintage furniture, minutes from Mumbai's best street food.",
    image: {
      filename: "listingimage",
      url: "/images/mumbai-bunglow.png",
    },
    price: 11000,
    location: "Mumbai",
    country: "India",
    geometry: { type: "Point", coordinates: [72.8777, 19.0760] },
    category: "Urban Oasis",
    reviewIndices: [1, 11, 15, 32],
  },

  {
    title: "Palm-Fringed Beach Villa in Varkala",
    description:
      "A laterite-stone villa perched on Varkala's red cliffs, with a private path down to the beach and Ayurvedic spa treatments on request.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?auto=format&fit=crop&w=1200&q=80",
    },
    price: 7000,
    location: "Varkala",
    country: "India",
    geometry: { type: "Point", coordinates: [76.7163, 8.7379] },
    category: "Coastal Haven",
    reviewIndices: [9, 19, 29, 13],
  },
  {
    title: "Hand-Hewn Log Cabin in Big Sky Country",
    description:
      "A rustic, hand-built log cabin on 40 acres of Montana wilderness. Elk sightings from the porch and star-filled skies at night.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1518623489648-a173ef7824f3?auto=format&fit=crop&w=1200&q=80",
    },
    price: 9000,
    location: "Montana",
    country: "United States",
    geometry: { type: "Point", coordinates: [-110.3626, 46.8797] },
    category: "Mountain Escape",
    reviewIndices: [5, 17, 22],
  },
  {
    title: "Garden Bungalow in Pondicherry's French Quarter",
    description:
      "A mustard-yellow colonial bungalow with a private courtyard garden, in the cobbled lanes of Pondicherry's White Town.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80",
    },
    price: 6500,
    location: "Pondicherry",
    country: "India",
    geometry: { type: "Point", coordinates: [79.8083, 11.9416] },
    category: "Heritage Homestay",
    reviewIndices: [16, 26, 37, 8],
  },
  {
    title: "Whitewashed Villa Overlooking the Aegean",
    description:
      "A classic Cycladic villa with a private plunge pool and uninterrupted views of the Aegean Sea. Minutes from Mykonos Town's best tavernas.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=80",
    },
    price: 26000,
    location: "Mykonos",
    country: "Greece",
    geometry: { type: "Point", coordinates: [25.3289, 37.4467] },
    category: "Coastal Haven",
    reviewIndices: [6, 9, 19, 29],
  },
  {
    title: "Desert Camp Beneath the Jaisalmer Dunes",
    description:
      "Sleep in a hand-embroidered luxury tent at the edge of the Thar Desert, with camel treks at dawn and folk music around the campfire at night.",
    image: {
      filename: "listingimage",
      url: "/images/jaisalmair.png",
    },
    price: 6000,
    location: "Jaisalmer",
    country: "India",
    geometry: { type: "Point", coordinates: [70.9083, 26.9157] },
    category: "Desert Sanctuary",
    reviewIndices: [40, 41, 20, 32],
  },
  {
    title: "Off-Grid Eco Treehouse in the Rainforest",
    description:
      "A solar-powered treehouse built from reclaimed wood, wrapped by rainforest canopy. Fall asleep to howler monkeys and wake to birdsong.",
    image: {
      filename: "listingimage",
      url: "/images/treehouse-rainforest.png",
    },
    price: 7000,
    location: "Monteverde",
    country: "Costa Rica",
    geometry: { type: "Point", coordinates: [-84.8250, 10.3010] },
    category: "Woodland Hideaway",
    reviewIndices: [7, 10, 24],
  },
  {
    title: "Historic Garden Cottage in Old Charleston",
    description:
      "A pastel single-house cottage with wraparound porches and a private walled garden, tucked in the heart of Charleston's historic district.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&w=1200&q=80",
    },
    price: 13500,
    location: "Charleston",
    country: "United States",
    geometry: { type: "Point", coordinates: [-79.9311, 32.7765] },
    category: "Rural Charm",
    reviewIndices: [1, 13, 15, 31],
  },
  {
    title: "Snowbound Wooden Lodge in Gulmarg",
    description:
      "A timber lodge at the base of the Gondola, with a wood-fired hearth, quilted beds, and fresh powder snow just outside the door.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1518623489648-a173ef7824f3?auto=format&fit=crop&w=1200&q=80",
    },
    price: 8000,
    location: "Gulmarg",
    country: "India",
    geometry: { type: "Point", coordinates: [74.3805, 34.0484] },
    category: "Snowy Peaks",
    reviewIndices: [42, 6, 14, 31],
  },
  {
    title: "Screened-Porch Cabin in the White Mountains",
    description:
      "A classic New England lake cabin with a screened porch, canoe included, and a stone fireplace for chilly mountain evenings.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1476041800959-2f6bb412c8ce?auto=format&fit=crop&w=1200&q=80",
    },
    price: 10000,
    location: "New Hampshire",
    country: "United States",
    geometry: { type: "Point", coordinates: [-71.5724, 43.1939] },
    category: "Lakefront Retreat",
    reviewIndices: [2, 11, 23],
  },
  {
    title: "Lakeview Cottage Above Naini Lake",
    description:
      "A colonial-era cottage on the ridge above Nainital's boat-dotted lake, with a private balcony made for morning tea and mountain views.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=1200&q=80",
    },
    price: 5500,
    location: "Nainital",
    country: "India",
    geometry: { type: "Point", coordinates: [79.4630, 29.3919] },
    category: "Lakefront Retreat",
    reviewIndices: [43, 3, 20, 27],
  },
  {
    title: "Overwater Villa on a Maldivian Atoll",
    description:
      "Step off your private deck straight into the Indian Ocean. Glass floor panels, an outdoor rain shower, and coral reefs right below.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?auto=format&fit=crop&w=1200&q=80",
    },
    price: 60000,
    location: "Maldives",
    country: "Maldives",
    geometry: { type: "Point", coordinates: [73.5093, 4.1755] },
    category: "Coastal Haven",
    reviewIndices: [0, 4, 18, 28],
  },
  {
    title: "Rainforest Homestay in the Wayanad Hills",
    description:
      "A family-run wooden homestay tucked into spice-scented forest, with guided treks to waterfalls and elephant corridors nearby.",
    image: {
      filename: "listingimage",
      url: "/images/wayanand.png",
    },
    price: 4500,
    location: "Wayanad",
    country: "India",
    geometry: { type: "Point", coordinates: [76.1320, 11.6854] },
    category: "Woodland Hideaway",
    reviewIndices: [24, 10, 8, 38],
  },
  {
    title: "Weathered Beach Cottage on the Malibu Bluffs",
    description:
      "A relaxed, sun-bleached cottage perched above the Pacific with a wraparound deck built for sunset watching.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1499696010180-025ef6e1a8f9?auto=format&fit=crop&w=1200&q=80",
    },
    price: 15000,
    location: "Malibu",
    country: "United States",
    geometry: { type: "Point", coordinates: [-118.7798, 34.0259] },
    category: "Coastal Haven",
    reviewIndices: [3, 16, 25],
  },
  {
    title: "Restored Colonial Haveli in New Delhi",
    description:
      "A stately colonial-era home near Lutyens' Delhi, with high ceilings, antique furnishings, and a private courtyard shaded by neem trees.",
    image: {
      filename: "listingimage",
      url: "/images/delhi-haveli.png",
    },
    price: 9500,
    location: "New Delhi",
    country: "India",
    geometry: { type: "Point", coordinates: [77.2090, 28.6139] },
    category: "Urban Oasis",
    reviewIndices: [1, 11, 15, 32],
  },
  {
    title: "Ski-In Chalet in the Heart of Aspen",
    description:
      "A luxury alpine chalet with a private hot tub, floor-to-ceiling windows, and direct access to Aspen Mountain's lifts.",
    image: {
      filename: "listingimage",
      url: "/images/aspen-snow.png",
    },
    price: 40000,
    location: "Aspen",
    country: "United States",
    geometry: { type: "Point", coordinates: [-106.8175, 39.1911] },
    category: "Snowy Peaks",
    reviewIndices: [6, 14, 17, 30],
  },
  {
    title: "Hidden Surf House on Costa Rica's Pacific Coast",
    description:
      "A breezy, open-plan beach house steps from a world-class surf break. Boards, hammocks, and an outdoor kitchen included.",
    image: {
      filename: "listingimage",
      url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80",
    },
    price: 14000,
    location: "Santa Teresa",
    country: "Costa Rica",
    geometry: { type: "Point", coordinates: [-85.1667, 9.6500] },
    category: "Coastal Haven",
    reviewIndices: [5, 9, 19, 29],
  },
];

module.exports = { data: sampleListings, reviewPool };