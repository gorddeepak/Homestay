/**
 * Test-only provider doubles.
 *
 * This module must be required before `app.js` so that controllers capture the
 * replacements instead of the real SDK functions. Nothing here performs network
 * I/O or reads real provider credentials.
 */

const ai = require("ai");
const genai = require("@google/genai");
const maptilerClient = require("@maptiler/client");
const { storage } = require("../../cloudConfig");
const aiModulePath = require.resolve("ai");
const genaiModulePath = require.resolve("@google/genai");

const state = {
  description: {
    text: "A quiet, test-only stay near the water.",
    calls: [],
    error: null,
  },
  chat: {
    chunks: ["Hello ", "from the test double."],
    calls: [],
    error: null,
    writes: 0,
  },
  search: {
    filters: {},
    calls: [],
    error: null,
  },
  geocode: {
    result: {
      features: [
        {
          geometry: { type: "Point", coordinates: [72.8777, 19.076] },
        },
      ],
    },
    calls: [],
    error: null,
  },
  upload: {
    calls: [],
    path: "https://example.test/uploads/phase0-upload.jpg",
    filename: "phase0-upload",
  },
};

function reset() {
  state.description.text = "A quiet, test-only stay near the water.";
  state.description.calls = [];
  state.description.error = null;
  state.chat.chunks = ["Hello ", "from the test double."];
  state.chat.calls = [];
  state.chat.error = null;
  state.chat.writes = 0;
  state.search.filters = {};
  state.search.calls = [];
  state.search.error = null;
  state.geocode.result = {
    features: [
      {
        geometry: { type: "Point", coordinates: [72.8777, 19.076] },
      },
    ],
  };
  state.geocode.calls = [];
  state.geocode.error = null;
  state.upload.calls = [];
  state.upload.path = "https://example.test/uploads/phase0-upload.jpg";
  state.upload.filename = "phase0-upload";
}

class FakeGoogleGenAI {
  constructor(options) {
    this.options = options;
    this.interactions = {
      create: async (request) => {
        state.description.calls.push(request);
        if (state.description.error) throw state.description.error;
        return { output_text: state.description.text };
      },
    };
  }
}

function fakeStreamText(options) {
  state.chat.calls.push(options);
  if (state.chat.error) throw state.chat.error;
  if (!Array.isArray(options.messages) || options.messages.length === 0) {
    const error = new Error("Invalid prompt: messages must not be empty");
    error.name = "AI_InvalidPromptError";
    throw error;
  }

  return {
    pipeTextStreamToResponse(res) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");

      let index = 0;
      const writeNext = () => {
        if (index >= state.chat.chunks.length) {
          res.end();
          return;
        }
        res.write(state.chat.chunks[index]);
        state.chat.writes += 1;
        index += 1;
        setTimeout(writeNext, 15);
      };

      writeNext();
    },
  };
}

async function fakeGenerateObject(options) {
  state.search.calls.push(options);
  if (state.search.error) throw state.search.error;
  return { object: state.search.filters };
}

async function fakeGeocodeForward(location) {
  state.geocode.calls.push(location);
  if (state.geocode.error) throw state.geocode.error;
  return state.geocode.result;
}

function install() {
  // `ai` is a non-extensible proxy, so assignment is ignored. Replace the
  // CommonJS module export before the controllers are loaded instead.
  const fakeAi = Object.create(ai);
  fakeAi.streamText = fakeStreamText;
  fakeAi.generateObject = fakeGenerateObject;
  require.cache[aiModulePath].exports = fakeAi;

  const fakeGenai = Object.create(genai);
  fakeGenai.GoogleGenAI = FakeGoogleGenAI;
  require.cache[genaiModulePath].exports = fakeGenai;

  maptilerClient.geocoding.forward = fakeGeocodeForward;

  storage._handleFile = (req, file, callback) => {
    state.upload.calls.push({
      originalname: file.originalname,
      mimetype: file.mimetype,
    });
    // Consume the stream so busboy can finish without any Cloudinary I/O.
    file.stream.resume();
    callback(null, {
      path: state.upload.path,
      filename: state.upload.filename,
      size: file.size,
    });
  };
}

module.exports = {
  install,
  reset,
  state,
};
