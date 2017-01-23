// Dependencies
import test from 'ava';
import { agent as request } from 'supertest-as-promised';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as AnonymousStrategy } from 'passport-anonymous';
import { KomapiPassport, ensureAuthenticated } from '../src/index';

// Tests
test('allows authenticated requests', async (t) => {
  t.plan(3);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(new LocalStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, { id: 1 });
    return done(null, false);
  }));
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate('local'));
  app.use(ensureAuthenticated());
  app.use((ctx) => {
    t.pass();
    ctx.body = 'ok'; // eslint-disable-line no-param-reassign
  });
  const res = await request(app.listen())
    .post('/')
    .send({ username: 'test', password: 'testpw' });
  t.is(res.status, 200);
  t.is(res.text, 'ok');
});
test('rejects unauthenticated requests', async (t) => {
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(new LocalStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, { id: 1 });
    return done(null, false);
  }));
  komapiPassport.use(new AnonymousStrategy());
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate(['local', 'anonymous']));
  app.use(ensureAuthenticated());
  app.use((ctx, next) => {
    t.throws(next, 'Access to this resource requires authentication');
  });
  app.use((ctx) => {
    t.fail();
    ctx.body = 'ok'; // eslint-disable-line no-param-reassign
  });
  await request(app.listen()).post('/');
});
test('rejects unauthenticated requests with custom error message', async (t) => {
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  const msg = 'Custom Error Message';
  komapiPassport.use(new LocalStrategy((username, password, done) => {
    if (username === 'test' && password === 'testpw') return done(null, { id: 1 });
    return done(null, false);
  }));
  komapiPassport.use(new AnonymousStrategy());
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate(['local', 'anonymous']));
  app.use(ensureAuthenticated(msg));
  app.use((ctx, next) => {
    t.throws(next, msg);
  });
  app.use((ctx) => {
    t.fail();
    ctx.body = 'ok'; // eslint-disable-line no-param-reassign
  });
  await request(app.listen()).post('/');
});
