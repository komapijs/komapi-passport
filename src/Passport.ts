// eslint-disable-next-line import/no-extraneous-dependencies
import Koa from 'koa';
import delegate from 'delegates';
import passport from 'passport';
import http from 'http';

/* eslint-disable @typescript-eslint/no-var-requires */
const passportRequest = require('passport/lib/http/request');
const passportInitialize = require('passport/lib/middleware/initialize');
const passportAuthenticate = require('passport/lib/middleware/authenticate');
/* eslint-enable @typescript-eslint/no-var-requires */

// Setup eslint
/* eslint-disable no-underscore-dangle */

/**
 * Overload Koa
 */
declare module 'koa' {
  export interface BaseRequest {
    account?: object;
    user?: object;
    authInfo: object;
    _passport: {
      instance: passport.Authenticator<unknown, unknown, unknown>;
    };
    login: (user: any, options?: any) => Promise<void>;
    logIn: this['login'];
    logout: () => void;
    logOut: this['logout'];
    isAuthenticated: () => boolean;
    isUnauthenticated: () => boolean;
  }
  export interface BaseContext {
    _passport: Koa.BaseRequest['_passport'];
    login: Koa.BaseRequest['login'];
    logIn: Koa.BaseRequest['logIn'];
    logout: Koa.BaseRequest['logout'];
    logOut: Koa.BaseRequest['logOut'];
    isAuthenticated: Koa.BaseRequest['isAuthenticated'];
    isUnauthenticated: Koa.BaseRequest['isUnauthenticated'];
    session?: any;
  }
}

/**
 * Overload Passport
 */
declare module 'passport' {
  interface Authenticator {
    initialize(options?: { userProperty: string }): Koa.Middleware;
  }
}

/**
 * Types
 */
interface PassportAuthenticatorInstance {
  _userProperty: string;
}

// Definitions
class KomapiPassport extends passport.Passport {
  public static _initialize = passport.initialize;
  public static _authenticate = passport.authenticate;

  /**
   * Mutate the Koa context for request handling
   *
   * @param {Koa.BaseContext} context
   * @param {Koa.BaseRequest} request
   * @returns {Koa.BaseContext}
   */
  public static mutate(context: Koa.BaseContext, request: Koa.BaseRequest): Koa.BaseContext {
    // Add passport to request
    Object.assign(request, passportRequest);

    // Context to req
    delegate<Koa.BaseContext, Koa.BaseRequest>(context, 'request').access('authInfo');

    // Context to request
    delegate<Koa.BaseContext, Koa.BaseRequest>(context, 'request')
      .access('_passport')
      .method('login')
      .method('logIn')
      .method('logout')
      .method('logOut')
      .method('isAuthenticated')
      .method('isUnauthenticated');

    // Koa Request to native req
    delegate<Koa.BaseRequest, http.IncomingMessage & { authInfo: object }>(request, 'req')
      .access('authInfo')
      .access('httpVersion')
      .access('trailers')
      .access('setTimeout')
      .access('statusCode')
      .access('connection')
      .access('protocol');

    // Koa Request to context
    delegate<Koa.BaseRequest, Koa.Context>(request, 'ctx')
      .access('cookies')
      .access('throw')
      .access('session');

    return context;
  }

  /**
   * Constructor
   */
  public constructor() {
    super();
    this.framework({
      initialize: function initialize(
        passportInstance: passport.Authenticator<unknown, unknown, unknown> & PassportAuthenticatorInstance,
      ) {
        return function initializeMiddleware(ctx, next) {
          if (!ctx.login) KomapiPassport.mutate(ctx, ctx.request);
          return new Promise((resolve, reject) => {
            Object.defineProperty(ctx.request, passportInstance._userProperty, {
              enumerable: true,
              get: () => ctx.state[passportInstance._userProperty],
              set: v => {
                ctx.state[passportInstance._userProperty] = v;
              },
            });
            passportInitialize(passportInstance)(ctx.request, ctx.response, (err: Error) => {
              const { login } = ctx.request;
              ctx.request.login = (user: any, opts?: any, callback?: (err: Error) => void) => {
                if (callback) return login.call(ctx.request, user, opts, callback);
                return new Promise((loginResolve, loginReject) => {
                  login.call(ctx.request, user, opts, (loginErr: Error) => {
                    if (loginErr) return loginReject(loginErr);
                    return loginResolve();
                  });
                });
              };
              ctx.request.logIn = ctx.request.login;

              /* istanbul ignore next line // ignored as passport does not generate an error in the callback today, but might in the future */
              if (err) return reject(err);
              return resolve();
            });
          }).then(next);
        };
      },
      authenticate: function authenticate(
        passportInstance,
        strategies,
        options: passport.AuthenticateOptions,
        callback: (...args: any[]) => any,
      ) {
        let config: Partial<passport.AuthenticateOptions>;
        let cb: (...args: any[]) => any;
        if (typeof options === 'function') {
          cb = options;
          config = {};
        } else {
          cb = callback;
          config = { ...options };
        }
        return function authenticateMiddleware(ctx, next) {
          return new Promise((resolve, reject) => {
            const mockRes = {
              redirect: (url: string, status: number) => {
                ctx.redirect(url, status);
                return resolve(true);
              },
              setHeader: ctx.set.bind(ctx),
              end: (content: any) => {
                if (content) ctx.body = content;
                return resolve(true);
              },
              set statusCode(status) {
                ctx.status = status;
              },
              get statusCode() {
                return ctx.status;
              },
            };
            if (cb) {
              const _callback = cb;
              cb = function authenticateCallback(err, user, info, status) {
                if (err) return reject(err);
                return Promise.resolve(_callback(user, info, status))
                  .then(resolve)
                  .catch(reject);
              };
            }
            return passportAuthenticate(passportInstance, strategies, config, cb)(
              ctx.request,
              mockRes,
              (err: Error) => {
                if (err) return reject(err);
                return resolve();
              },
            );
          }).then(stop => {
            if (!stop) return next();
            return null;
          });
        };
      },
    });
  }
}

/**
 * Mutate Koa application to improve performance during authentication
 *
 * @param {Koa} app - Koa application instance
 * @returns {Koa.BaseContext} - Mutated context object
 */
function mutateApp(app: Koa) {
  return KomapiPassport.mutate(app.context, app.request);
}

// Exports
const komapiPassport = new KomapiPassport();
export default komapiPassport;
export { KomapiPassport, mutateApp };
