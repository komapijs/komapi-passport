# komapi-passport

Disclaimer: There will be breaking changes and outdated documentation during the pre-v1.0.0 cycles.

[![npm](https://img.shields.io/npm/v/komapi-passport.svg)](https://npmjs.org/package/komapi-passport)
[![Travis](https://img.shields.io/travis/komapijs/komapi-passport/master.svg)](https://travis-ci.org/komapijs/komapi-passport)
[![Codecov branch](https://img.shields.io/codecov/c/github/komapijs/komapi-passport/master.svg)](https://codecov.io/gh/komapijs/komapi-passport)
[![npm](https://img.shields.io/npm/l/komapi-passport.svg)](https://github.com/komapijs/komapi-passport/blob/master/LICENSE.md)

Recommended middleware for authentication in [komapi](https://github.com/komapijs/komapi). This is a [Koa](https://github.com/koajs/koa) compatible implementation of [Passport](https://github.com/jaredhanson/passport) and an alternative to [koa-passport](https://github.com/rkusa/koa-passport).
Note that unlike [Passport](https://github.com/jaredhanson/passport), this middleware has `{ session: false }` as default.

Please refer to [Passport](https://github.com/jaredhanson/passport) for more information on how to use passport.

## Usage
- [Installation](#installation)
- [Hello World](#hello-world)
- [Tips](#tips)
- [License](#license)
  
### Installation
Install through npm and require it in your `index.js` file.
```bash
$ npm install --save komapi-passport
```

### Hello World
Try `POST /unprotected` and `POST /protected` using the simple example application below.

```js
// Dependencies
const Komapi = require('komapi');
const passport = require('komapi-passport');
const LocalStrategy = require('passport-local');
const AnonymousStrategy = require('passport-anonymous');
const bcrypt = require('bcrypt');

// Init
const app = new Komapi();
passport.mutateApp(app); // This is optional. See the tips (1) for description
const user = {
    id: 1,
    username: 'jeffj',
    name: 'Jeff Jagger',
    passwordHash: '$2a$06$5f2353rB/Jgb0s8vRKteluCJR2WY1E97.0htzB6RW.O1LJa.BQamu' // mylittlesecret
};

// Setup
passport.use(new LocalStrategy((username, password, done) => {
    if (username !== user.username) return done(null, false);
    bcrypt.compare(password, user.passwordHash, (err, res) => {
        if (err) return done(err);
        if (!res) return done(null, false);
        return done(null, user);
    });
}));
passport.use(new AnonymousStrategy());

// Middlewares
app.use(app.mw.bodyParser());
app.use(passport.initialize());
app.use(passport.authenticate(['local', 'anonymous']));
app.use('/unprotected', (ctx) => ctx.send({
    isAuthenticated: ctx.isAuthenticated(),
    user: ctx.request.auth
}));
app.use('/protected', passport.ensureAuthenticated(), (ctx) => ctx.send({
    isAuthenticated: ctx.isAuthenticated(),
    user: ctx.request.auth
}));

// Listen
app.listen(process.env.PORT || 3000);
```

### Tips
1. For better performance, use `Passport.mutateApp(app);` in your application bootstrap. This adds an application wide compatibility layer between [Passport](https://github.com/jaredhanson/passport) and [Koa](https://github.com/koajs/koa). If you do not use this, the compatibility layer will be added on a per-request basis - thus reducing performance slightly.
2. If you allow unauthenticated requests (e.g. using `passport-anonymous` strategy) you can enforce authentication on some of your routes with the included `Passport.ensureAuthenticated()` middleware. 

### License

  [MIT](LICENSE.md)
