var express = require('express'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    methodOverride = require('method-override'),
    logger = require('morgan'),
    passport = require('passport'),
    expressSession = require('express-session'),
    ZendeskStrategy = require('passport-zendesk').Strategy;
    AWS = require('aws-sdk');
    uuid = require('uuid');
    createError = require('http-errors');
    currentDate = new Date().toISOString().split("T")[0];
    env = process.env.NODE_ENV || 'development';
    https = require('https');
    var zendesk = require('node-zendesk');

//Sets listening port for node.js server    
var port = process.env.PORT || 3000;

// Set AWS SDK region (We use us-west-2) and DynamoDB API version
AWS.config.update({ region: 'us-west-2' });
var dynamodb = new AWS.DynamoDB({ apiVersion: '2012-08-10' });


// Zendesk OAUTH2.0 credentials
var ZENDESK_CLIENT_ID = "dashboard-platform";
var ZENDESK_CLIENT_SECRET = "e8666acee0c1d02a9668ad5a59387a77e41f5126ac4e4138982735bb3d1e7d57";
var ZENDESK_SUBDOMAIN = "gcu";

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this app does not
//   have a database of user records yet, the complete Zendesk profile is serialized
//   and deserialized.
passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

// Use the ZendeskStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Zendesk
//   profile), and invoke a callback with a user object.
passport.use(new ZendeskStrategy({
    subdomain: ZENDESK_SUBDOMAIN,
    clientID: ZENDESK_CLIENT_ID,
    clientSecret: ZENDESK_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/zendesk/callback"
}, function (accessToken, refreshToken, profile, done) {
    createLog(profile._json.user);
    // console.log(profile._json.user);
    return done(null, profile);
}
));

var app = express();

// Initialize view engine
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');
app.use(logger('combined'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(methodOverride());
app.use(expressSession({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/unauthenticated');
}

//Routers
app.get('/', function (req, res) {
    res.render('index', {
        user: req.user
    });
});

app.get('/dashboard', ensureAuthenticated, function (req, res) {
    res.render('dashboard', {
        user: req.user
    });
});

app.get('/profile', ensureAuthenticated, function (req, res) {
    res.render('profile', {
        user: req.user
    });
});

app.get('/unauthenticated', function (req, res) {
    res.render('unauthenticated', {
        user: req.user
    });
});

app.get('/auth/zendesk',
    passport.authenticate('zendesk'), function () {
        // The request will be redirected to Zendesk for authentication, so this
        // function will not be called.
    });

app.get('/auth/zendesk/callback',
    passport.authenticate('zendesk', {
        failureRedirect: '/unauthenticated'
    }), function (req, res) {
        res.redirect('/dashboard');
        var zdUser = req.user._json.user;
        // console.log(req.user._json.user);
        // createLog(zdUser)
        // createLog(req.user.displayName,)
    });

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});

// Create user in dynamo db
function createLog(zdUser) {
    var params = {
        ExpressionAttributeNames: {
            "#AT": "Token",
        },
        ExpressionAttributeValues: {
            ":t": {
                S: zdUser.authenticity_token
            }
        },
        FilterExpression: "#AT = :t",
        ProjectionExpression: "#AT",
        TableName: "zdaccesstokens"
    };
    https.get('https://gcu.zendesk.com/api/v2/custom_roles/{id}.json', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            console.log(JSON.parse(data).explanation);
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });
    dynamodb.scan(params, function (err, data) {
        console.log(data);
        if (err) console.log(err, err.stack); // an error occurred
        else if (data.Count == 0) {
            var params2 = {
                Item: {
                    "token": {
                        "S": zdUser.authenticity_token,
                    },
                    "fullName": {
                        S: zdUser.name
                    }
                },
                TableName: "zdaccesstokens"
            };

            dynamodb.putItem(params2, function (err, data) {
                if (err) {
                    console.log("Error", err);
                } else {
                    console.log("Entry Created", data);
                    console.log(params2);
                }
            });
        }
    });
};

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

//Error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error', {
        user: req.user
    });
});

app.listen(port);
console.log('Listening on port', port);