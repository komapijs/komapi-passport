// Dependencies
import test from 'ava';
import { agent as request } from 'supertest';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-router';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as AnonymousStrategy } from 'passport-anonymous';
import { BasicStrategy } from 'passport-http';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import passport, { KomapiPassport, mutateApp } from '../src/index';

// Init
const passportUser = {
  id: 1,
  username: 'test',
};
/**
 * Create an app for use in testing
 *
 * @param {function=} serializeFn - Optional function to serialize a user session in Passport.js
 * @param {function=} deserializeFn - Optional function to deserialize a user session in Passport.js
 * @returns {Koa} - Returns the application instance
 */
function appFactory(serializeFn = (user, done) => done(null, user.id), deserializeFn = (id, done) => done(null, passportUser)) {
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.serializeUser(serializeFn);
  komapiPassport.deserializeUser(deserializeFn);
  komapiPassport.use(new LocalStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, passportUser);
    else if (username === 'throw') return done(new Error('Authentication Error'));
    return done(null, false);
  }));
  komapiPassport.use(new BasicStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, passportUser);
    else if (username === 'throw') return done(new Error('Authentication Error'));
    return done(null, false);
  }));
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.session());
  app.passport = komapiPassport;
  return app;
}

// Tests
test.serial('can mutate Koa objects to improve performance', async (t) => {
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
    failureRedirect: '/failed',
  }));
  app.use((ctx) => {
    t.is(ctx.isAuthenticated(), false);
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  const res = await request(app.listen())
    .get('/');
  t.is(res.status, 204);
  KomapiPassport.mutate = orgMutator;
});
test('adds www-authenticate header', async (t) => {
  const app = appFactory();
  const router = new Router();
  router.get('/', (ctx) => {
    t.fail();
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  app.use(app.passport.authenticate('basic'));
  app.use(router.routes());
  const res = await request(app.listen())
    .get('/');
  t.is(res.status, 401);
  t.is(res.headers['www-authenticate'], 'Basic realm="Users"');
});
test('provides a passport singleton by default', async (t) => {
  const app = new Koa();
  t.is(app.context.isAuthenticated, undefined);
  mutateApp(app);
  t.is(typeof app.context.isAuthenticated, 'function');
  passport.use(new LocalStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, passportUser);
    else if (username === 'throw') return done(new Error('Authentication Error'));
    return done(null, false);
  }));
  app.use(bodyParser());
  app.use(passport.initialize());
  app.use(passport.authenticate('local', {
    successRedirect: '/secured',
    failureRedirect: '/failed',
    session: false,
  }));
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  t.is(res.status, 302);
  t.is(res.headers.location, '/secured');
});
test('refuses invalid credentials', async (t) => {
  t.plan(5);
  const app = appFactory();
  const router = new Router();
  let context = {};
  router.post('/', (ctx) => {
    t.fail();
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use(app.passport.authenticate('local', {
    successRedirect: '/secured',
    failureRedirect: '/failed',
  }));
  app.use(router.routes());
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'asdf' });
  t.is(res.status, 302);
  t.is(res.headers.location, '/failed');
  t.is(context.isAuthenticated(), false);
  t.is(context.session, undefined);
  t.is(context.state.user, undefined);
});
test('accepts valid credentials', async (t) => {
  t.plan(6);
  const app = appFactory((user, done) => {
    t.deepEqual(user, passportUser);
    done(null, user.id);
  });
  const router = new Router();
  let context = {};
  router.get('/', (ctx) => {
    t.fail();
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use(app.passport.authenticate('local', {
    successRedirect: '/secured',
    failureRedirect: '/failed',
  }));
  app.use(router.routes());
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  t.is(res.status, 302);
  t.is(res.headers.location, '/secured');
  t.is(context.isAuthenticated(), true);
  t.deepEqual(context.session, {
    passport: {
      user: 1,
    },
  });
  t.deepEqual(context.state.user, passportUser);
});
test('allows unauthenticated requests to unprotected routes', async (t) => {
  t.plan(4);
  const app = appFactory();
  const router = new Router();
  let context = {};
  router.get('/', (ctx) => {
    t.pass();
    ctx.body = null; // eslint-disable-line no-param-reassign
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
  t.is(context.state.user, undefined);
});
test('custom authentication callbacks accepts valid credentials', async (t) => {
  t.plan(5);
  const app = appFactory();
  const router = new Router();
  let context = {};
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use((ctx, next) => app.passport.authenticate('local', (user) => {
    if (!user) {
      ctx.status = 401; // eslint-disable-line no-param-reassign
      ctx.body = { success: false }; // eslint-disable-line no-param-reassign
    } else {
      ctx.body = { success: true }; // eslint-disable-line no-param-reassign
      ctx.login(user);
    }
  })(ctx, next));
  app.use(router.routes());
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  t.is(res.status, 200);
  t.is(context.isAuthenticated(), true);
  t.deepEqual(context.session, {
    passport: {
      user: 1,
    },
  });
  t.deepEqual(res.body, { success: true });
  t.deepEqual(context.state.user, passportUser);
});
test('custom authentication callbacks refuses valid credentials', async (t) => {
  t.plan(5);
  const app = appFactory();
  const router = new Router();
  let context = {};
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use((ctx, next) => app.passport.authenticate('local', (user) => {
    if (!user) {
      ctx.status = 401; // eslint-disable-line no-param-reassign
      ctx.body = { success: false }; // eslint-disable-line no-param-reassign
    } else {
      ctx.body = { success: true }; // eslint-disable-line no-param-reassign
      ctx.login(user);
    }
  })(ctx, next));
  app.use(router.routes());
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'asdf' });
  t.is(res.status, 401);
  t.is(context.isAuthenticated(), false);
  t.deepEqual(context.session, undefined);
  t.deepEqual(res.body, { success: false });
  t.deepEqual(context.state.user, undefined);
});
test('login works', async (t) => {
  t.plan(5);
  const app = appFactory();
  const router = new Router();
  let context = {};
  router.get('/', (ctx) => {
    t.pass();
    ctx.body = null; // eslint-disable-line no-param-reassign
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
      user: 1,
    },
  });
  t.deepEqual(context.state.user, passportUser);
});
test('logout works', async (t) => {
  t.plan(5);
  const app = appFactory();
  const router = new Router();
  let context = {};
  router.get('/', (ctx) => {
    t.pass();
    ctx.body = null; // eslint-disable-line no-param-reassign
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
  t.deepEqual(context.state.user, null);
});
test('errors in the login handler are correctly propagated', async (t) => {
  t.plan(3);
  const app = new Koa();
  const localPassport = new KomapiPassport();
  const router = new Router();
  localPassport.use(new LocalStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, passportUser);
    return done(null, false);
  }));
  app.use(bodyParser());
  app.use(localPassport.initialize());
  app.use(localPassport.session());
  app.use(router.routes());
  app.use(async (ctx, next) => {
    try {
      await next();
      t.fail();
    } catch (err) {
      t.is(err.message, 'Failed to serialize user into session');
      ctx.status = 500; // eslint-disable-line no-param-reassign
      ctx.body = { error: err.message }; // eslint-disable-line no-param-reassign
    }
  });
  app.use((ctx, next) => localPassport.authenticate('local', (user) => {
    if (!user) throw new Error('Invalid user');
    return ctx.login(user);
  })(ctx, next));
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
test('errors during authentication are propagated properly', async (t) => {
  t.plan(5);
  const app = appFactory();
  const router = new Router();
  let context = {};
  router.post('/login', (ctx) => {
    t.fail();
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      t.is(err.message, 'Authentication Error');
      ctx.status = 500; // eslint-disable-line no-param-reassign
      ctx.body = { status: 'error' }; // eslint-disable-line no-param-reassign
    }
  });
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use(app.passport.authenticate('local', {
    successRedirect: '/secured',
    failureRedirect: '/failed',
  }));
  app.use(router.routes());
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'throw', password: 'throw' });
  t.is(res.status, 500);
  t.is(context.isAuthenticated(), false);
  t.deepEqual(res.body, { status: 'error' });
  t.deepEqual(context.state.user, undefined);
});
test('errors during custom authentication function are propagated properly', async (t) => {
  t.plan(5);
  const app = appFactory();
  const router = new Router();
  let context = {};
  router.post('/login', (ctx) => {
    t.fail();
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      t.is(err.message, 'Authentication Error');
      ctx.status = 500; // eslint-disable-line no-param-reassign
      ctx.body = { status: 'error' }; // eslint-disable-line no-param-reassign
    }
  });
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use((ctx, next) => app.passport.authenticate('local', (user) => {
    if (!user) throw new Error('Authentication Error');
    return ctx.login(user, { session: false });
  })(ctx, next));
  app.use(router.routes());
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'throw', password: 'throw' });
  t.is(res.status, 500);
  t.is(context.isAuthenticated(), false);
  t.deepEqual(res.body, { status: 'error' });
  t.deepEqual(context.state.user, undefined);
});
test('can authorize using the account property', async (t) => {
  t.plan(2);
  const app = appFactory();
  const router = new Router();
  let context = {};
  router.post('/login', (ctx) => {
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use(app.passport.authorize('local', {
    successRedirect: '/secured',
    failureRedirect: '/failed',
  }));
  app.use(router.routes());
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  t.is(res.status, 204);
  t.deepEqual(context.request.account, passportUser);
});
test('supports custom user properties', async (t) => {
  t.plan(3);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  const router = new Router();
  komapiPassport.use(new LocalStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, passportUser);
    return done(null, false);
  }));
  app.use(bodyParser());
  app.use(komapiPassport.initialize({ userProperty: 'customProperty' }));
  app.use(komapiPassport.session());
  app.use(router.routes());
  app.use(komapiPassport.authenticate('local', { session: false }));
  app.use((ctx) => {
    t.deepEqual(ctx.request.customProperty, passportUser);
    t.deepEqual(ctx.state.customProperty, passportUser);
    ctx.body = null; // eslint-disable-line no-param-reassign
  });
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  t.is(res.status, 204);
});
test('does not set body unless explicitly told to', async (t) => {
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(new OAuth2Strategy({
    authorizationURL: 'https://www.example.com/oauth2/authorize',
    tokenURL: 'https://www.example.com/oauth2/token',
    clientID: 'ABC123',
    clientSecret: 'secret',
  }, () => {}));
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate('oauth2'));
  const res = await request(app.listen())
    .get('/login')
    .send({ username: 'test', password: 'testpw' });
  t.is(res.status, 302);
  t.is(res.headers.location, 'https://www.example.com/oauth2/authorize?response_type=code&client_id=ABC123');
});
