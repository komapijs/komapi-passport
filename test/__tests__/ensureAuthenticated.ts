// Dependencies
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { agent as request } from 'supertest';
import { Strategy as AnonymousStrategy } from 'passport-anonymous';
import { Strategy as LocalStrategy } from 'passport-local';
import { ensureAuthenticated, KomapiPassport } from '../../src';

// Tests
it('rejects unauthenticated requests', async done => {
  expect.assertions(2);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(new AnonymousStrategy());
  komapiPassport.use(
    new LocalStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, { id: 1 });
      return doneCallback(null, false);
    }),
  );
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.body = err.message;
      ctx.status = err.statusCode;
    }
  });
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate(['local', 'anonymous']));
  app.use(ensureAuthenticated());
  app.use(() => app.use(() => done.fail('should have cancelled the request')));
  const res = await request(app.listen())
    .post('/')
    .send({ username: 'test', password: 'asdf' });
  expect(res.status).toBe(401);
  expect(res.text).toBe('Access to this resource requires authentication');

  // Done
  done();
});
it('rejects unauthenticated requests with custom error message', async done => {
  expect.assertions(2);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(new AnonymousStrategy());
  komapiPassport.use(
    new LocalStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, { id: 1 });
      return doneCallback(null, false);
    }),
  );
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.body = err.message;
      ctx.status = err.statusCode;
    }
  });
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate(['local', 'anonymous']));
  app.use(ensureAuthenticated('My custom error message'));
  app.use(() => done.fail('should have cancelled the request'));
  const res = await request(app.listen())
    .post('/')
    .send({ username: 'test', password: 'asdf' });
  expect(res.status).toBe(401);
  expect(res.text).toBe('My custom error message');

  // Done
  done();
});
it('allows authenticated requests', async done => {
  expect.assertions(2);
  const app = new Koa();
  const komapiPassport = new KomapiPassport();
  komapiPassport.use(
    new LocalStrategy((username, password, doneCallback) => {
      if (username === 'test' && password === 'testpw') return doneCallback(null, { id: 1 });
      return doneCallback(null, false);
    }),
  );
  app.use(bodyParser());
  app.use(komapiPassport.initialize());
  app.use(komapiPassport.authenticate('local', { session: false }));
  app.use(ensureAuthenticated());
  app.use(ctx => {
    ctx.body = 'ok';
  });
  const res = await request(app.listen())
    .post('/')
    .send({ username: 'test', password: 'testpw' });
  expect(res.status).toBe(200);
  expect(res.text).toBe('ok');

  // Done
  done();
});
