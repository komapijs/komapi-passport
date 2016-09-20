'use strict';

// Dependencies
import test from 'ava';
import {agent as request} from 'supertest-as-promised';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-router';
import passport, {KomapiPassport, mutateApp} from '../src/index';
import {Strategy as LocalStrategy} from 'passport-local';
import {Strategy as AnonymousStrategy} from 'passport-anonymous';
import {BasicStrategy} from 'passport-http';
import {Strategy as OAuth2Strategy} from 'passport-oauth2';

// Init
const passportUser = {
    id: 1,
    username: 'test'
};
function appFactory() {
    const app = new Koa();
    const komapiPassport = new KomapiPassport();
    komapiPassport.serializeUser(function (user, done) {
        done(null, user.id);
    });
    komapiPassport.deserializeUser(function (id, done) {
        done(null, passportUser);
    });
    komapiPassport.use(new LocalStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, passportUser);
        else if (username === 'throw') return done(new Error('Authentication Error'));
        done(null, false);
    }));
    komapiPassport.use(new BasicStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, passportUser);
        else if (username === 'throw') return done(new Error('Authentication Error'));
        done(null, false);
    }));
    app.use(bodyParser());
    app.use(komapiPassport.initialize());
    app.use(komapiPassport.session());
    app.passport = komapiPassport;
    return app;
}

// Tests
test.serial('can mutate Koa objects to improve performance', async t => {
    t.plan(4);
    const app = appFactory();
    const orgMutator = app.passport.constructor.mutate;
    t.is(typeof app.context.login, 'undefined');
    mutateApp(app);
    t.is(typeof app.context.login, 'function');
    KomapiPassport.mutate = function fakeMutator() {
        t.fail();
    };
    app.passport.use(new AnonymousStrategy());
    app.use(app.passport.authenticate('anonymous', {
        successRedirect: '/secured',
        failureRedirect: '/failed'
    }));
    app.use((ctx, next) => {
        t.is(ctx.isAuthenticated(), false);
        ctx.body = null;
    });
    const res = await request(app.listen())
        .get('/');
    t.is(res.status, 204);
    KomapiPassport.mutate = orgMutator;
});
test('adds www-authenticate header', async t => {
    const app = appFactory();
    const router = new Router();
    router.get('/', (ctx) => {
        t.fail();
        ctx.body = null;
    });
    app.use(app.passport.authenticate('basic'));
    app.use(router.routes());
    const res = await request(app.listen())
        .get('/');
    t.is(res.status, 401);
    t.is(res.headers['www-authenticate'], 'Basic realm="Users"');
});
test('provides a passport singleton by default', async t => {
    const app = new Koa();
    t.is(app.context.isAuthenticated, undefined);
    mutateApp(app);
    t.is(typeof app.context.isAuthenticated, 'function');
    passport.use(new LocalStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, passportUser);
        else if (username === 'throw') return done(new Error('Authentication Error'));
        done(null, false);
    }));
    app.use(bodyParser());
    app.use(passport.initialize());
    app.use(passport.authenticate('local', {
        successRedirect: '/secured',
        failureRedirect: '/failed',
        session: false
    }));
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 302);
    t.is(res.headers['location'], '/secured');
});
test('refuses invalid credentials', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.post('/', (ctx) => {
        t.fail();
        ctx.body = null;
    });
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });
    app.use(app.passport.authenticate('local', {
        successRedirect: '/secured',
        failureRedirect: '/failed'
    }));
    app.use(router.routes());
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'asdf' });
    t.is(res.status, 302);
    t.is(res.headers['location'], '/failed');
    t.is(context.isAuthenticated(), false);
    t.is(context.session, undefined);
    t.is(context.user, undefined);
});
test('accepts valid credentials', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.get('/', (ctx) => {
        t.fail();
        ctx.body = null;
    });
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });
    app.use(app.passport.authenticate('local', {
        successRedirect: '/secured',
        failureRedirect: '/failed',
        session: true
    }));
    app.use(router.routes());
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 302);
    t.is(res.headers['location'], '/secured');
    t.is(context.isAuthenticated(), true);
    t.deepEqual(context.session, {
        passport: {
            user: 1
        }
    });
    t.deepEqual(context.user, passportUser);
});
test('allows unauthenticated requests to unprotected routes', async t => {
    t.plan(4);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.get('/', (ctx) => {
        t.pass();
        ctx.body = null;
    });
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });

    app.use(router.routes());
    const res = await request(app.listen())
        .get('/');
    t.is(res.status, 204);
    t.is(context.isAuthenticated(), false);
    t.is(context.user, undefined);
});
test('custom authentication callbacks accepts valid credentials', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });
    app.use((ctx, next) => {
        return app.passport.authenticate('local', (user, info) => {
            if (!user) {
                ctx.status = 401;
                ctx.body = {success: false};
            } else {
                ctx.body = {success: true};
                return ctx.login(user);
            }
        })(ctx, next);
    });
    app.use(router.routes());
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 200);
    t.is(context.isAuthenticated(), true);
    t.deepEqual(context.session, {
        passport: {
            user: 1
        }
    });
    t.deepEqual(res.body, {success: true});
    t.deepEqual(context.user, passportUser);
});
test('custom authentication callbacks refuses valid credentials', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });
    app.use((ctx, next) => {
        return app.passport.authenticate('local', (user, info) => {
            if (!user) {
                ctx.status = 401;
                ctx.body = {success: false};
            } else {
                ctx.body = {success: true};
                return ctx.login(user);
            }
        })(ctx, next);
    });
    app.use(router.routes());
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'asdf' });
    t.is(res.status, 401);
    t.is(context.isAuthenticated(), false);
    t.deepEqual(context.session, undefined);
    t.deepEqual(res.body, {success: false});
    t.deepEqual(context.user, undefined);
});
test('login works', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.get('/', (ctx) => {
        t.pass();
        ctx.body = null;
    });
    app.use((ctx, next) => {
        context = ctx;
        ctx.login(passportUser);
        return next();
    });
    app.use(router.routes());
    const res = await request(app.listen())
        .get('/');
    t.is(res.status, 204);
    t.is(context.isAuthenticated(), true);
    t.deepEqual(context.session, {
        passport: {
            user: 1
        }
    });
    t.deepEqual(context.user, passportUser);
});
test('logout works', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.get('/', (ctx) => {
        t.pass();
        ctx.body = null;
    });
    app.use((ctx, next) => {
        context = ctx;
        ctx.login(passportUser);
        return next();
    });
    app.use((ctx, next) => {
        ctx.logout();
        return next();
    });
    app.use(router.routes());
    const res = await request(app.listen())
        .get('/');
    t.is(res.status, 204);
    t.is(context.isAuthenticated(), false);
    t.deepEqual(context.session, { passport: {} });
    t.deepEqual(context.user, null);
});
test('errors in the login handler are correctly propagated', async t => {
    t.plan(3);
    const app = new Koa();
    const passport = new KomapiPassport();
    const router = new Router();
    passport.use(new LocalStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, passportUser);
        done(null, false);
    }));
    app.use(bodyParser());
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(router.routes());
    app.use(async (ctx, next) => {
        try {
            await next();
            t.fail();
        } catch (err) {
            t.is(err.message, 'Failed to serialize user into session');
            ctx.status = 500;
            ctx.body = {error: err.message};
        }
    });
    app.use((ctx, next) => {
        return passport.authenticate('local', (user, info) => {
            if (!user) throw new Error('Invalid user');
            return ctx.login(user);
        })(ctx, next);
    });
    app.use((ctx, next) => {
        t.fail();
        return next();
    });
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 500);
    t.deepEqual(res.body, { error: 'Failed to serialize user into session' });
});
test('errors during authentication are propagated properly', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.post('/login', (ctx) => {
        t.fail();
        ctx.body = null;
    });
    app.use(async (ctx, next) => {
        try {
            await next();
        } catch (err) {
            t.is(err.message, 'Authentication Error');
            ctx.status = 500;
            ctx.body = {status:'error'};
        }
    });
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });
    app.use(app.passport.authenticate('local', {
        successRedirect: '/secured',
        failureRedirect: '/failed'
    }));
    app.use(router.routes());
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'throw', password: 'throw' });
    t.is(res.status, 500);
    t.is(context.isAuthenticated(), false);
    t.deepEqual(res.body, {status:'error'});
    t.deepEqual(context.user, undefined);
});
test('errors during custom authentication function are propagated properly', async t => {
    t.plan(5);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.post('/login', (ctx) => {
        t.fail();
        ctx.body = null;
    });
    app.use(async (ctx, next) => {
        try {
            await next();
        } catch (err) {
            t.is(err.message, 'Authentication Error');
            ctx.status = 500;
            ctx.body = {status:'error'};
        }
    });
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });
    app.use((ctx, next) => {
        return app.passport.authenticate('local', (user, info) => {
            if (!user) throw new Error('Authentication Error');
            return ctx.login(user, {session: false});
        })(ctx, next);
    });
    app.use(router.routes());
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'throw', password: 'throw' });
    t.is(res.status, 500);
    t.is(context.isAuthenticated(), false);
    t.deepEqual(res.body, {status:'error'});
    t.deepEqual(context.user, undefined);
});
test('can authorize using the account property', async t => {
    t.plan(2);
    const app = appFactory();
    const router = new Router();
    let context = {};
    router.post('/login', (ctx) => {
        ctx.body = null;
    });
    app.use((ctx, next) => {
        context = ctx;
        return next();
    });
    app.use(app.passport.authorize('local', {
        successRedirect: '/secured',
        failureRedirect: '/failed'
    }));
    app.use(router.routes());
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 204);
    t.deepEqual(context.request.account, passportUser);
});
test('supports custom user properties', async t => {
    t.plan(3);
    const app = new Koa();
    const komapiPassport = new KomapiPassport();
    const router = new Router();
    komapiPassport.use(new LocalStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, passportUser);
        done(null, false);
    }));
    app.use(bodyParser());
    app.use(komapiPassport.initialize({
        userProperty: 'customProperty'
    }));
    app.use(komapiPassport.session());
    app.use(router.routes());
    app.use(komapiPassport.authenticate('local'));
    app.use((ctx, next) => {
        t.deepEqual(ctx.request.customProperty, passportUser);
        t.deepEqual(ctx.customProperty, passportUser);
        ctx.body = null;
    });
    const res = await request(app.listen())
        .post('/login')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 204);
});
test('does not set body unless explicitly told to', async t => {
    const app = new Koa();
    const komapiPassport = new KomapiPassport();
    komapiPassport.use(new OAuth2Strategy({
        authorizationURL: 'https://www.example.com/oauth2/authorize',
        tokenURL: 'https://www.example.com/oauth2/token',
        clientID: 'ABC123',
        clientSecret: 'secret'
    }, (accessToken, refreshToken, profile, done) => {}));
    app.use(bodyParser());
    app.use(komapiPassport.initialize());
    app.use(komapiPassport.authenticate('oauth2'));
    const res = await request(app.listen())
        .get('/login')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 302);
    t.is(res.headers['location'], 'https://www.example.com/oauth2/authorize?response_type=code&client_id=ABC123');
});