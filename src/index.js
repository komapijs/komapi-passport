'use strict';

// Dependencies
import delegate from 'delegates';
import passport from 'passport';
import passportRequest from 'passport/lib/http/request';
import passportInitialize from 'passport/lib/middleware/initialize';
import passportAuthenticate from 'passport/lib/middleware/authenticate';
import ensureAuthenticated from './ensureAuthenticated';

// Init
const defaultOpts = {
    session: false
};

// Definitions
function mutateApp(app) {
    return KomapiPassport.mutate(app.context, app.request, app.response);
}
class KomapiPassport extends passport.Passport {
    constructor() {
        super();
        const self = this;
        this.framework({
            initialize: function initialize(passport) {
                return function initializeMiddleware(ctx, next) {
                    if (!ctx.login) self.constructor.mutate(ctx, ctx.request, ctx.response);
                    return new Promise((resolve, reject) => {
                        passportInitialize(passport)(ctx.request, ctx.response, (err) => {
                            const login = ctx.request.login;
                            Object.defineProperty(ctx, ctx.request._passport.instance._userProperty, {
                                get: () => ctx.request[ctx.request._passport.instance._userProperty]
                            });
                            ctx.request.login = ctx.request.logIn = function(user, opts, callback) {
                                if (callback) return login.call(ctx.request, user, opts, callback);
                                return new Promise((resolve, reject) => {
                                    login.call(ctx.request, user, opts, (err) => {
                                        if (err) return reject(err);
                                        return resolve();
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
            authenticate: function authenticate(passport, strategies, opts, callback) {
                if (typeof opts === 'function') {
                    callback = opts;
                    opts = {};
                }
                opts = Object.assign({}, defaultOpts, opts);
                return function authenticateMiddleware(ctx, next) {
                    return new Promise((resolve, reject) => {
                        const mockRes = {
                            redirect: (url) => {
                                ctx.redirect(url);
                                return resolve(true);
                            },
                            setHeader: ctx.set.bind(ctx),
                            end: (content) => {
                                if (content) ctx.body = content;
                                return resolve(true);
                            },
                            set statusCode(status) {
                                ctx.status = status;
                            },
                            get statusCode() {
                                return ctx.status;
                            }
                        };
                        if (callback) {
                            const _callback = callback;
                            callback = function authenticateCallback(err, user, info, status) {
                                if (err) return reject(err);
                                return Promise.resolve(_callback(user, info, status))
                                    .then(() => resolve())
                                    .catch((err) => reject(err));
                            };
                        }
                        return passportAuthenticate(passport, strategies, opts, callback)(ctx.request, mockRes, (err) => {
                            if (err) return reject(err);
                            return resolve();
                        });
                    }).then((stop) => {
                        if (!stop) return next();
                    });
                };
            }
        });
    }
    static mutate(context, request, response) {

        // Add passport to request
        request = Object.assign(request, passportRequest);

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

// Exports
const komapiPassport = new KomapiPassport();
export default komapiPassport;
export {KomapiPassport, ensureAuthenticated, mutateApp};