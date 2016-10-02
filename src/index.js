// Dependencies
import delegate from 'delegates';
import passport from 'passport';
import passportRequest from 'passport/lib/http/request';
import passportInitialize from 'passport/lib/middleware/initialize';
import passportAuthenticate from 'passport/lib/middleware/authenticate';
import ensureAuthenticated from './ensureAuthenticated';

// Init
const defaultOpts = { session: false };

// Definitions
class KomapiPassport extends passport.Passport {
    constructor() {
        super();
        const self = this;
        this.framework({
            initialize: function initialize(passportInstance) {
                return function initializeMiddleware(ctx, next) {
                    if (!ctx.login) self.constructor.mutate(ctx, ctx.request, ctx.response);
                    return new Promise((resolve, reject) => {
                        passportInitialize(passportInstance)(ctx.request, ctx.response, (err) => {
                            const login = ctx.request.login;
                            Object.defineProperty(ctx, ctx.request._passport.instance._userProperty, {
                                get: () => ctx.request[ctx.request._passport.instance._userProperty],
                            });
                            ctx.request.login = ctx.request.logIn = (user, opts, callback) => { // eslint-disable-line no-param-reassign
                                if (callback) return login.call(ctx.request, user, opts, callback);
                                return new Promise((loginResolve, loginReject) => {
                                    login.call(ctx.request, user, opts, (loginErr) => {
                                        if (loginErr) return loginReject(loginErr);
                                        return loginResolve();
                                    });
                                });
                            };
                            /* istanbul ignore if | Ignored, as this is difficult to test */
                            if (err) return reject(err);
                            return resolve();
                        });
                    }).then(next);
                };
            },
            authenticate: function authenticate(passportInstance, strategies, opts, callback) {
                let config;
                let cb;
                if (typeof opts === 'function') {
                    cb = opts;
                    config = Object.assign({}, defaultOpts);
                } else {
                    cb = callback;
                    config = Object.assign({}, defaultOpts, opts);
                }
                return function authenticateMiddleware(ctx, next) {
                    return new Promise((resolve, reject) => {
                        const mockRes = {
                            redirect: (url) => {
                                ctx.redirect(url);
                                return resolve(true);
                            },
                            setHeader: ctx.set.bind(ctx),
                            end: (content) => {
                                if (content) ctx.body = content; // eslint-disable-line no-param-reassign
                                return resolve(true);
                            },
                            set statusCode(status) {
                                ctx.status = status; // eslint-disable-line no-param-reassign
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
                        return passportAuthenticate(passportInstance, strategies, config, cb)(ctx.request, mockRes, (err) => {
                            if (err) return reject(err);
                            return resolve();
                        });
                    }).then((stop) => {
                        if (!stop) return next();
                        return null;
                    });
                };
            },
        });
    }

    static mutate(context, request) {
        // Add passport to request
        request = Object.assign(request, passportRequest); // eslint-disable-line no-param-reassign

        // Context to request
        delegate(context, 'request')
            .method('_passport')
            .method('login')
            .method('logIn')
            .method('logout')
            .method('logOut')
            .method('isAuthenticated')
            .method('isUnauthenticated');

        // Koa Request to native req
        delegate(request, 'req')
            .access('httpVersion')
            .access('trailers')
            .access('setTimeout')
            .access('statusCode')
            .access('connection');

        // Koa Request to context
        delegate(request, 'ctx')
            .access('cookies')
            .access('throw')
            .access('session');
    }
}
KomapiPassport._initialize = passport.initialize;
KomapiPassport._authenticate = passport.authenticate;
function mutateApp(app) {
    return KomapiPassport.mutate(app.context, app.request, app.response);
}

// Exports
const komapiPassport = new KomapiPassport();
export default komapiPassport;
export { KomapiPassport, ensureAuthenticated, mutateApp };
