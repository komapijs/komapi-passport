// eslint-disable-next-line import/no-extraneous-dependencies
import Koa from 'koa';
import { Unauthorized } from 'botched';

// Exports
/**
 * Create middleware to ensure a request is authenticated
 *
 * @param {string} [message=Access to this resource requires authentication] - Optional error message to display
 * @returns {function} - Returns the middleware
 */
export default function ensureAuthenticatedMiddlewareFactory(
  message = 'Access to this resource requires authentication',
): Koa.Middleware {
  return function ensureAuthenticatedMiddleware(ctx, next) {
    if (!ctx.isAuthenticated()) throw new Unauthorized(message);
    return next();
  };
}
