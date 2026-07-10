# Homestay 🏡

Homestay is a full-stack accommodation booking platform inspired by Airbnb. It lets users list, discover and review unique homes to stay in. The project demonstrates auth, CRUD, file uploads, geolocation, and practical AI integrations: an AI listing description generator, a conversational chatbot, and natural-language search (powered by Google Gemini via the Vercel AI SDK).

## ✨ Features

- Listings: create, edit, delete stays with images, price, category and location
- Image uploads: Cloudinary + Multer
- Interactive maps: MapLibre GL JS + MapTiler geocoding
- Authentication: Passport (`passport-local-mongoose`)
- Reviews & ratings: star ratings and comments per listing
- Category filtering: quick filters for beach, mountain, city, etc.
- AI description generator: drafts 2–3 sentence listing copy from title/location/category
- AI chatbot: floating assistant that can search listings, summarize reviews, and answer questions
- AI natural-language search: extract structured filters from free-text queries and return matching listings

## 🛠️ Tech Stack

- Backend: Node.js, Express
- Templating: EJS (`ejs-mate`)
- Styling: Bootstrap 5 + custom CSS
- Database: MongoDB, Mongoose
- Auth: Passport + `passport-local-mongoose`
- Image storage: Cloudinary (configured in `cloudConfig.js`)
- Maps & geocoding: MapLibre GL JS + MapTiler
- AI: Google Gemini via `@google/genai`, `@ai-sdk/google` and the `ai` SDK
- Validation: Joi / Zod (used in AI tools)

## 📚 Table of contents

- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Seeding the Database](#seeding-the-database)
- [Project Structure](#project-structure)
- [AI Integration Notes](#ai-integration-notes)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- Node.js (v16+ recommended)
- MongoDB running locally or a MongoDB Atlas URI
- Accounts: Cloudinary, MapTiler, Google AI (Gemini) if you want AI features

### Install

```bash
git clone https://github.com/<your-username>/homestay.git
cd "Airbnb"
npm install
```

If you encounter peer dependency errors with `multer-storage-cloudinary`, try:

```bash
npm install --legacy-peer-deps
```

### Run

Create a `.env` (see next section) then:

```bash
# development with auto-reload
npx nodemon app.js

# or run once
node app.js
```

Visit http://localhost:8080

## Environment Variables

Create a `.env` file at the project root and set the following values (example):

```env
# Local DB (or use ATLAS/hosted URI)
MONGO_URL=mongodb://127.0.0.1:27017/homestay
# or ATLAS_DB_URL=your-atlas-connection-string

# Session secret
SECRET=your-session-secret

# Cloudinary
CLOUD_NAME=your-cloud-name
CLOUD_API_KEY=your-cloud-api-key
CLOUD_API_SECRET=your-cloud-api-secret

# MapTiler
MAPTILER_API_KEY=your-maptile-api-key

# Gemini / Google GenAI
GEMINI_API_KEY=your-gemini-key
# (controllers may also read GOOGLE_GENERATIVE_AI_API_KEY)

# Port (optional)
PORT=8080
```

Make sure `.env` and `node_modules/` are in `.gitignore`.

## Seeding the Database

The project includes a seeder script that populates sample users, listings and reviews.

```bash
node init/index.js
```

The seeder clears Reviews → Listings → Users then inserts sample data.

## Project Structure

```
homestay/
├── init/              # Database seeding scripts and sample data
├── models/            # Mongoose schemas (Listing, Review, User)
├── routes/            # Express route handlers
├── controllers/       # Route logic, including AI controller
├── views/             # EJS templates
├── public/            # CSS, client JS (chat widget, maps)
├── utils/             # Helpers (wrapAsync, ExpressError, etc.)
├── cloudConfig.js     # Cloudinary + multer storage config
├── app.js             # App entry point
└── .env.example       # Example env variables (not committed)
```

## AI Integration Notes

AI features are implemented directly with the Gemini API via the Vercel AI SDK and `@google/genai`:

- **Description generator** (`POST /listings/ai/generate_description`): prompts Gemini to produce a 2–3 sentence editorial description from title/location/category.
- **Chatbot** (`POST /listings/ai/chat`): streaming assistant built with `streamText` and `pipeTextStreamToResponse`, uses tool-calling (`tool()` + Zod schemas) for safe DB-backed lookups.
- **Natural-language search** (`POST /listings/ai/search`): uses `generateObject` to extract structured filters from free text, then queries MongoDB and returns rendered listing partials.

See `controllers/ai.js` and `routes/ai.js` for implementation details and sample inputs.

## Troubleshooting

- Editor shows red underlines in EJS: VS Code may not understand EJS tags in `<script>` blocks — these are editor diagnostics only.
- Image upload failures: confirm Cloudinary env vars are set.
- Map/geocoding failures: verify `MAPTILER_API_KEY`.
- AI errors: provide valid Gemini API key and confirm environment variables.

## Recommended package.json scripts

Add these for convenience:

```json
"scripts": {
  "start": "node app.js",
  "dev": "nodemon app.js"
}
```

## Next steps I can do for you

- Add the `start`/`dev` scripts to `package.json` (I will do this now if you want).
- Create a `.env.example` file (I will add it now).
- Remove hardcoded DB strings in `app.js`/`init/index.js` and read from `process.env.MONGO_URL` (optional).

---

If you'd like, I will now add the `start`/`dev` scripts and create `.env.example`. 
