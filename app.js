require("dotenv").config();
const express = require('express');
const app = express();
// Hosts like Render terminate HTTPS at a proxy and forward plain HTTP.
// Without this, Express reports req.secure === false and express-session
// silently refuses to set the secure session cookie in production.
app.set("trust proxy", 1);
const mongoose = require('mongoose');
const DB_URL = process.env.ATLAS_DB_URL;
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/expressError.js");
const listingsRoute = require("./routes/listing.js");
const reviewRoute = require("./routes/review.js");
const userRoute = require("./routes/user.js");
const aiRoute = require("./routes/ai.js");
const listingController = require("./controllers/listing.js");
const session = require('express-session');
const MongoStore = require("connect-mongo").default || require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");


const store = MongoStore.create({
    mongoUrl: DB_URL,
    crypto: {
        secret: process.env.SECRET,
    },
    touchAfter: 24*3600,

});

store.on("error", (err) => {
    console.log("ERROR in MONGO SESSION STORE", err);
});

const sessionOptions = {
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    },
};

async function connectToDatabase() {
    await mongoose.connect(DB_URL);
}

function start() {
    return connectToDatabase().then(() => {
        console.log("connected to db");
        const port = process.env.PORT || 8080;
        return app.listen(port, () => {
            console.log(`server is listening on port ${port}`);
        });
    })
        .catch((err) => {
            console.log(err)
        });
}

if (require.main === module) {
    start();
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

// declared before session/passport so pings stay cheap and report app health,
// not whether the database is reachable
app.get("/health", (req, res) => {
    res.json({ ok: true });
});

app.use(session(sessionOptions));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    res.locals.currentPath = req.path;
    next();
});

// home page serves the listings index; /listings keeps working as an alias
app.get("/", listingController.index);

app.use("/listings", listingsRoute);
app.use("/listings/ai", aiRoute);
app.use("/listings/:listingId/review", reviewRoute);
app.use("/", userRoute);

app.all("*path", (req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});

app.use((err, req, res, next) => {
    let { statusCode = 500, message = "something went wrong :( " } = err;
    // AI routes are called with fetch, so they expect JSON not an HTML page
    if (req.path.startsWith("/listings/ai")) {
        return res.status(statusCode).json({ error: message });
    }
    res.status(statusCode).render("error.ejs", { message });
});

module.exports = {
    app,
    connectToDatabase,
    start,
    sessionStore: store,
};

