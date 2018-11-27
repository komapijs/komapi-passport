# komapi-passport

Disclaimer: There will be breaking changes and outdated documentation during the pre-v1.0.0 cycles.

[![npm](https://img.shields.io/npm/v/komapi-passport.svg)](https://npmjs.org/package/komapi-passport)
[![CircleCI](https://img.shields.io/circleci/project/github/komapijs/komapi-passport/master.svg)](https://circleci.com/gh/komapijs/komapi-passport/tree/master)
[![Codecov branch](https://img.shields.io/codecov/c/github/komapijs/komapi-passport/master.svg)](https://codecov.io/gh/komapijs/komapi-passport/tree/master)
[![David](https://img.shields.io/david/komapijs/komapi-passport/master.svg)](https://david-dm.org/komapijs/komapi-passport/master)
[![Known Vulnerabilities](https://snyk.io/test/github/komapijs/komapi-passport/master/badge.svg)](https://snyk.io/test/github/komapijs/komapi-passport/master)
[![renovate-app badge](https://img.shields.io/badge/renovate-app-blue.svg)](https://renovateapp.com/)
[![license](https://img.shields.io/github/license/komapijs/komapi-passport.svg)](https://github.com/komapijs/komapi-passport/blob/master/LICENSE.md)

Recommended middleware for authentication in [komapi](https://github.com/komapijs/komapi). This is a [Koa](https://github.com/koajs/koa) compatible implementation of [Passport](https://github.com/jaredhanson/passport) and an alternative to [koa-passport](https://github.com/rkusa/koa-passport).

Please refer to [Passport](https://github.com/jaredhanson/passport) for more information on how to use passport.

## Documentation
- [Installation](#installation)
- [Hello World](#hello-world)
- [Tips](#tips)
- [Contributing](#contributing)
- [License](#license)
  
<a id="installation"></a>
## Installation
Install through npm and require it in your `index.js` file.
```bash
$ npm install --save komapi-passport passport-http bcrypt
```

<a id="hello-world"></a>
## Hello World
Try `GET /` using the simple example application below. This example uses http basic authentication, but all passport strategies are supported.
Username is "jeffj" and password is "mylittlesecret".

```js
// Dependencies
import Koa from 'koa';
import passport, { mutateApp } from 'komapi-passport';
import { BasicStrategy } from 'passport-http';
import bcrypt from 'bcrypt';

// Init
const app = new Koa();
mutateApp(app); // This is optional. See the tips (1) for description
const user = {
    id: 1,
    username: 'jeffj',
    name: 'Jeff Jagger',
    passwordHash: '$2a$06$5f2353rB/Jgb0s8vRKteluCJR2WY1E97.0htzB6RW.O1LJa.BQamu' // mylittlesecret
};

// Setup
passport.use(new BasicStrategy((username, password, done) => {
    console.log(username, password)
    if (username !== user.username) return done(null, false);
    bcrypt.compare(password, user.passwordHash, (err, res) => {
        if (err) return done(err);
        if (!res) return done(null, false);
        return done(null, user);
    });
}));

// Middlewares
app.use(passport.initialize());
app.use(passport.authenticate(['basic']));
app.use('/', passport.ensureAuthenticated(), (ctx) => {
  ctx.body = {
    isAuthenticated: ctx.isAuthenticated(),
    user: ctx.state.user, // or 'ctx.auth' or 'ctx.request.auth' for consistency, regardless of passport user property
  };
});

// Listen
app.listen(process.env.PORT || 3000);
```

<a id="tips"></a>
## Tips
1. For better performance, use `mutateApp(app);` in your application bootstrap. This adds an application wide compatibility layer between [Passport](https://github.com/jaredhanson/passport) and [Koa](https://github.com/koajs/koa). If you do not use this, the compatibility layer will be added on a per-request basis - thus reducing performance slightly.
2. If you allow unauthenticated requests (e.g. using `passport-anonymous` strategy) you can enforce authentication on some of your routes with the included `Passport.ensureAuthenticated()` middleware. 

<a id="contributing"></a>
## Contributing

This project follows [angular commit conventions](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#commit).
### Release

Run `npm run release` to publish a new release and `npm run release --tag=next` to publish a pre-release.

<a id="license"></a>
## License

  [MIT](LICENSE.md)
