require("dotenv").config();
const express = require('express');
const app = express();
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

store.on("error",()=>{
    console.log("ERROR in MONGO SESSION STORE", err);
})

const sessionOptions = {
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};

async function main() {
    await mongoose.connect(DB_URL)
}


main().then(() => {
    console.log("connected to db");
    app.listen(8080, () => {
        console.log("server is listening on port 8080");
    });
})
    .catch((err) => {
        console.log(err)
    });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));
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

app.get("/", (req, res) => {
    res.send("Hi, I am root")
});

app.use("/listings", listingsRoute);
app.use("/listings/ai", aiRoute);
app.use("/listings/:listingId/review", reviewRoute);
app.use("/", userRoute);

app.all("*path", (req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});

app.use((err, req, res, next) => {
    let { statusCode = 500, message = "something went wrong :( " } = err;
    res.status(statusCode).render("error.ejs", { message });
});

