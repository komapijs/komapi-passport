// Dependencies
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { agent as request } from 'supertest';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as AnonymousStrategy } from 'passport-anonymous';
import { BasicStrategy } from 'passport-http';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import passport, { KomapiPassport, mutateApp } from '../../src';

/**
 * Types
 */
type serializeCallback = (err: Error | null, id: string | number) => void;
type unserializeCallback = (err: Error | null, profile: object) => void;

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
function appFactory(
  serializeFn = (user: any, done: serializeCallback) => done(null, user.id),
  deserializeFn = (id: string | number, done: unserializeCallback) => done(null, passportUser),
) {
  const app: Koa & { passport?: KomapiPassport } = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.serializeUser(serializeFn);
  komapiPassport.deserializeUser(deserializeFn);
  komapiPassport.use(
    new LocalStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, passportUser);
      if (username === 'throw') return doneCallback(new Error('Authentication Error'));
      return doneCallback(null, false);
    }),
  );
  komapiPassport.use(
    new BasicStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, passportUser);
      if (username === 'throw') return doneCallback(new Error('Authentication Error'));
      return doneCallback(null, false);
    }),
  );
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.session());
  app.passport = komapiPassport;
  return app;
}

// Tests
it('can mutate Koa globally to improve performance', () => {
  expect.assertions(2);
  const app = appFactory();

  // No login handler before mutation
  expect(app.context.login).toBe(undefined);

  // Mutate app
  mutateApp(app);

  // There should be login handlers after mutation
  expect(app.context.login).not.toBe(undefined);
});
it('does not mutate a globally mutated Koa instance', async done => {
  expect.assertions(3);
  const app = appFactory();
  const orgMutator = (app.passport!.constructor as typeof KomapiPassport).mutate;
  mutateApp(app);
  const spy = jest.fn(context => context);
  KomapiPassport.mutate = spy;

  app.passport!.use(new AnonymousStrategy());
  app.use(
    app.passport!.authenticate('anonymous', {
      successRedirect: '/secured',
      failureRedirect: '/failed',
    }),
  );
  app.use(ctx => {
    expect(ctx.isAuthenticated()).toBe(false);
    ctx.body = null;
  });
  const res = await request(app.listen()).get('/');
  expect(res.status).toBe(204);
  expect(spy).not.toHaveBeenCalled();

  // Restore
  KomapiPassport.mutate = orgMutator;

  // Done
  done();
});
it('mutates context automatically if Koa is not globally mutated', async done => {
  expect.assertions(3);
  const app = appFactory();

  app.passport!.use(new AnonymousStrategy());
  app.use(
    app.passport!.authenticate('anonymous', {
      successRedirect: '/secured',
      failureRedirect: '/failed',
    }),
  );
  app.use(ctx => {
    expect(typeof ctx.isAuthenticated).toBe('function');
    expect(ctx.isAuthenticated()).toBe(false);
    ctx.body = null;
  });
  const res = await request(app.listen()).get('/');
  expect(res.status).toBe(204);

  // Done
  done();
});
it('adds www-authenticate header for basic authentication', async done => {
  expect.assertions(2);
  const app = appFactory();

  app.passport!.use(new AnonymousStrategy());
  app.use(app.passport!.authenticate('basic'));
  app.use(() => done.fail('should have cancelled the request'));
  const res = await request(app.listen()).get('/');
  expect(res.status).toBe(401);
  expect(res.header['www-authenticate']).toBe('Basic realm="Users"');

  // Done
  done();
});
it('provides a passport singleton by default', async done => {
  expect.assertions(2);
  const app = new Koa();
  mutateApp(app);

  passport.use(
    new LocalStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, passportUser);
      if (username === 'throw') return doneCallback(new Error('Authentication Error'));
      return doneCallback(null, false);
    }),
  );
  app.use(bodyParser());
  app.use(passport.initialize());
  app.use(
    passport.authenticate('local', {
      successRedirect: '/secured',
      failureRedirect: '/failed',
      session: false,
    }),
  );
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(302);
  expect(res.header.location).toBe('/secured');

  // Done
  done();
});
it('refuses invalid credentials', async done => {
  expect.assertions(5);
  const app = appFactory();

  app.passport!.use(new AnonymousStrategy());
  app.use((ctx, next) => {
    expect(ctx.isAuthenticated()).toBe(false);
    expect((ctx as any).session).toBe(undefined);
    expect(ctx.state.user).toBe(undefined);
    return next();
  });
  app.use(
    app.passport!.authenticate('local', {
      successRedirect: '/secured',
      failureRedirect: '/failed',
    }),
  );
  app.use(() => done.fail('should have cancelled the request'));

  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'asdf' });
  expect(res.status).toBe(302);
  expect(res.header.location).toBe('/failed');

  // Done
  done();
});
it('accepts valid credentials', async done => {
  expect.assertions(9);
  const app = appFactory((user, doneCallback) => {
    expect(user).toEqual(passportUser);
    doneCallback(null, user.id);
  });
  let context: Koa.Context;
  app.passport!.use(new AnonymousStrategy());
  app.use((ctx, next) => {
    context = ctx;
    expect(context.isAuthenticated()).toBe(false);
    expect(context.session).toBe(undefined);
    expect(context.state.user).toBe(undefined);
    return next();
  });
  app.use(
    app.passport!.authenticate('local', {
      successRedirect: '/secured',
      failureRedirect: '/failed',
    }),
  );
  app.use(() => done.fail('should have cancelled the request'));

  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(302);
  expect(res.header.location).toBe('/secured');
  expect(context!.isAuthenticated()).toBe(true);
  expect(context!.state.user).toBe(passportUser);
  expect(context!.session).toEqual({
    passport: {
      user: 1,
    },
  });

  // Done
  done();
});
it('allows unauthenticated requests to unprotected routes', async done => {
  expect.assertions(4);
  const app = appFactory((user, doneCallback) => {
    expect(user).toEqual(passportUser);
    doneCallback(null, user.id);
  });

  app.passport!.use(new AnonymousStrategy());
  app.use(ctx => {
    expect(ctx.isAuthenticated()).toBe(false);
    expect(ctx.session).toBe(undefined);
    expect(ctx.state.user).toBe(undefined);
    ctx.body = null;
  });

  const res = await request(app.listen())
    .post('/')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(204);

  // Done
  done();
});
it('custom authentication callbacks refuses invalid credentials', async done => {
  expect.assertions(5);
  const app = appFactory();
  let context: Koa.Context;
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use((ctx, next) =>
    app.passport!.authenticate('local', user => {
      if (!user) {
        ctx.status = 401;
        ctx.body = { success: false };
      } else {
        ctx.body = { success: true };
        ctx.login(user);
      }
    })(ctx, next),
  );
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'asdf' });
  expect(res.status).toBe(401);
  expect(context!.isAuthenticated()).toBe(false);
  expect(context!.session).toBe(undefined);
  expect(res.body).toEqual({ success: false });
  expect(context!.state.user).toBe(undefined);

  // Done
  done();
});
it('custom authentication callbacks accepts valid credentials', async done => {
  expect.assertions(5);
  const app = appFactory();
  let context: Koa.Context;
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use((ctx, next) =>
    app.passport!.authenticate('local', user => {
      if (!user) {
        ctx.status = 401;
        ctx.body = { success: false };
      } else {
        ctx.body = { success: true };
        ctx.login(user);
      }
    })(ctx, next),
  );
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(200);
  expect(context!.isAuthenticated()).toBe(true);
  expect(context!.session).toEqual({
    passport: {
      user: 1,
    },
  });
  expect(res.body).toEqual({ success: true });
  expect(context!.state.user).toEqual(passportUser);

  // Done
  done();
});
it('login() works', async done => {
  expect.assertions(4);
  const app = appFactory();
  let context: Koa.Context;
  app.use((ctx, next) => {
    ctx.login(passportUser);
    context = ctx;
    return next();
  });
  app.use(ctx => {
    ctx.body = null;
  });
  const res = await request(app.listen()).get('/');
  expect(res.status).toBe(204);
  expect(context!.isAuthenticated()).toBe(true);
  expect(context!.session).toEqual({
    passport: {
      user: 1,
    },
  });
  expect(context!.state.user).toEqual(passportUser);

  // Done
  done();
});
it('logout() works', async done => {
  expect.assertions(4);
  const app = appFactory();
  let context: Koa.Context;
  app.use((ctx, next) => {
    ctx.login(passportUser);
    context = ctx;
    return next();
  });
  app.use((ctx, next) => {
    ctx.logout();
    return next();
  });
  app.use(ctx => {
    ctx.body = null;
  });
  const res = await request(app.listen()).get('/');
  expect(res.status).toBe(204);
  expect(context!.isAuthenticated()).toBe(false);
  expect(context!.session).toEqual({ passport: {} });
  expect(context!.state.user).toBe(null);

  // Done
  done();
});
it('errors in the login handler are correctly handled', async done => {
  expect.assertions(3);
  const app = new Koa();
  const localPassport = new KomapiPassport();
  localPassport.use(
    new LocalStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, passportUser);
      return doneCallback(null, false);
    }),
  );
  app.use(bodyParser());
  app.use(localPassport.initialize());
  app.use(localPassport.session());
  app.use(async (ctx, next) => {
    try {
      await next();
      done.fail('Should have cancelled the request');
    } catch (err) {
      expect(err.message).toBe('Failed to serialize user into session');
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  });
  app.use((ctx, next) =>
    localPassport.authenticate('local', user => {
      if (!user) throw new Error('Invalid user');
      return ctx.login(user);
    })(ctx, next),
  );
  app.use((ctx, next) => {
    done.fail('Should have cancelled the request');
    return next();
  });
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Failed to serialize user into session' });

  // Done
  done();
});
it('errors during authentication are correctly handled', async done => {
  expect.assertions(5);
  const app = appFactory();
  let context: Koa.Context;
  app.use(async (ctx, next) => {
    try {
      await next();
      done.fail('Should have cancelled the request');
    } catch (err) {
      expect(err.message).toBe('Authentication Error');
      ctx.status = 500; // eslint-disable-line no-param-reassign
      ctx.body = { status: 'error' }; // eslint-disable-line no-param-reassign
    }
  });
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use(
    app.passport!.authenticate('local', {
      successRedirect: '/secured',
      failureRedirect: '/failed',
    }),
  );
  app.use((ctx, next) => {
    done.fail('Should have cancelled the request');
    return next();
  });
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'throw', password: 'throw' });
  expect(res.status).toBe(500);
  expect(context!.isAuthenticated()).toBe(false);
  expect(res.body).toEqual({ status: 'error' });
  expect(context!.state.user).toBe(undefined);

  // Done
  done();
});
it('errors during custom authentication are correctly handled', async done => {
  expect.assertions(5);
  const app = appFactory();
  let context: Koa.Context;
  app.use(async (ctx, next) => {
    try {
      await next();
      done.fail('Should have cancelled the request');
    } catch (err) {
      expect(err.message).toBe('Authentication Error');
      ctx.status = 500; // eslint-disable-line no-param-reassign
      ctx.body = { status: 'error' }; // eslint-disable-line no-param-reassign
    }
  });
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use((ctx, next) =>
    app.passport!.authenticate('local', user => {
      if (!user) throw new Error('Authentication Error');
      return ctx.login(user, { session: false });
    })(ctx, next),
  );
  app.use((ctx, next) => {
    done.fail('Should have cancelled the request');
    return next();
  });
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'throw', password: 'throw' });
  expect(res.status).toBe(500);
  expect(context!.isAuthenticated()).toBe(false);
  expect(res.body).toEqual({ status: 'error' });
  expect(context!.state.user).toBe(undefined);

  // Done
  done();
});
it('can authorize using the default account property', async done => {
  expect.assertions(2);
  const app = appFactory();
  let context: Koa.Context;
  app.use((ctx, next) => {
    context = ctx;
    return next();
  });
  app.use(
    app.passport!.authorize('local', {
      successRedirect: '/secured',
      failureRedirect: '/failed',
    }),
  );
  app.use(ctx => {
    ctx.body = null;
  });
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(204);
  expect((context!.request as any).account).toEqual(passportUser);

  // Done
  done();
});
it('supports custom user property', async done => {
  expect.assertions(3);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(
    new LocalStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, passportUser);
      return doneCallback(null, false);
    }),
  );
  app.use(bodyParser());
  app.use(komapiPassport.initialize({ userProperty: 'customProperty' }));
  app.use(komapiPassport.session());
  app.use(komapiPassport.authenticate('local', { session: false }));
  app.use(ctx => {
    expect((ctx.request as any).customProperty).toEqual(passportUser);
    expect(ctx.state.customProperty).toEqual(passportUser);
    ctx.body = null;
  });
  const res = await request(app.listen())
    .post('/login')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(204);

  // Done
  done();
});
it('supports authInfo', async done => {
  expect.assertions(4);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  const authInfo = {
    scope: ['read', 'write'],
    provider: 'myprovider',
  };
  komapiPassport.use(
    new BearerStrategy(async (token, doneCallback) => {
      if (token === 'myCorrectToken') return doneCallback(null, passportUser, authInfo as any);
      return doneCallback(null, false);
    }),
  );
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.session());
  app.use(komapiPassport.authenticate('bearer', { session: false }));
  app.use(ctx => {
    expect((ctx.request as any).user).toEqual(passportUser);
    expect(ctx.state.user).toEqual(passportUser);
    expect(ctx.authInfo).toEqual(authInfo);
    ctx.body = null;
  });
  const res = await request(app.listen())
    .get('/')
    .set('Authorization', 'Bearer myCorrectToken');
  expect(res.status).toBe(204);

  // Done
  done();
});
it('does not set body unless explicitly told to', async done => {
  expect.assertions(3);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(
    new OAuth2Strategy(
      {
        authorizationURL: 'https://www.example.com/oauth2/authorize',
        tokenURL: 'https://www.example.com/oauth2/token',
        clientID: 'ABC123',
        clientSecret: 'secret',
        passReqToCallback: false,
        callbackURL: '',
      },
      () => {},
    ),
  );
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate('oauth2'));
  const res = await request(app.listen())
    .get('/login')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(302);
  expect(res.body).toEqual({});
  expect(res.header.location).toBe('https://www.example.com/oauth2/authorize?response_type=code&client_id=ABC123');

  // Done
  done();
});
