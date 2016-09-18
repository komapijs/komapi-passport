'use strict';

// Dependencies
import test from 'ava';
import {agent as request} from 'supertest-as-promised';
import Koa from 'koa';
import Passport from '../src/index';
import bodyParser from 'koa-bodyparser';
import {Strategy as LocalStrategy} from 'passport-local';
import {Strategy as AnonymousStrategy} from 'passport-anonymous';

// Tests
test('allows authenticated requests', async t => {
    t.plan(3);
    const app = new Koa();
    const passport = new Passport();
    passport.use(new LocalStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, {id:1});
        done(null, false);
    }));
    app.use(bodyParser());
    app.use(passport.initialize());
    app.use(passport.authenticate('local'));
    app.use(Passport.ensureAuthenticated());
    app.use((ctx, next) => {
        t.pass();
        ctx.body = 'ok';
    });
    const res = await request(app.listen())
        .post('/')
        .send({ username: 'test', password: 'testpw' });
    t.is(res.status, 200);
    t.is(res.text, 'ok');
});
test('rejects unauthenticated requests', async t => {
    const app = new Koa();
    const passport = new Passport();
    passport.use(new LocalStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, {id:1});
        done(null, false);
    }));
    passport.use(new AnonymousStrategy());
    app.use(bodyParser());
    app.use(passport.initialize());
    app.use(passport.authenticate(['local', 'anonymous']));
    app.use(Passport.ensureAuthenticated());
    app.use((ctx, next) => {
        t.throws(next, 'Access to this resource requires authentication');
    });
    app.use((ctx, next) => {
        t.fail();
        ctx.body = 'ok';
    });
    await request(app.listen()).post('/');
});
test('rejects unauthenticated requests with custom error message', async t => {
    const app = new Koa();
    const passport = new Passport();
    const msg = 'Custom Error Message';
    passport.use(new LocalStrategy(function (username, password, done) {
        if (username === 'test' && password === 'testpw') return done(null, {id:1});
        done(null, false);
    }));
    passport.use(new AnonymousStrategy());
    app.use(bodyParser());
    app.use(passport.initialize());
    app.use(passport.authenticate(['local', 'anonymous']));
    app.use(Passport.ensureAuthenticated(msg));
    app.use((ctx, next) => {
        t.throws(next, msg);
    });
    app.use((ctx, next) => {
        t.fail();
        ctx.body = 'ok';
    });
    await request(app.listen()).post('/');
});