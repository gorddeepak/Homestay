const User = require('../models/user');

module.exports.renderSignupForm = (req, res) => {
    res.render("users/signup.ejs");
};

module.exports.userSignup = async (req, res, next) => {
    try {
        let { username, email, password } = (req.body)
        const newUser = new User({ email, username });
        const registeredUser = await User.register(newUser, password);
        console.log(registeredUser);
        req.login(registeredUser, (err) => {
            if (err) {
                return next(err);
            }
            req.flash("success", "Signed in successfully!");
            res.redirect("/listings");
        })
    } catch (error) {
        req.flash("error", error.message);
        res.redirect(res.locals.redirectUrl);
    }
};

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.userLogin = async (req, res) => {
    req.flash("success", "Login successful!");
    let redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
};

module.exports.userLogout = (req, res) => {
    req.logOut((err) => {
        if (err) {
            next(err);
        };
        req.flash("success", "Logged out successfully!");
        res.redirect("/listings");
    });
};