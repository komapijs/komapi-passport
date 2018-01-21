// Dependencies
import { unauthorized } from 'boom';

// Exports
/**
 * Create middleware to ensure a request is authenticated
 *
 * @param {string} [message=Access to this resource requires authentication] - Optional error message to display
 * @returns {function} - Returns the middleware
 */
export default function ensureAuthenticatedProvider(message = 'Access to this resource requires authentication') {
  return function ensureAuthenticated(ctx, next) {
    if (!ctx.isAuthenticated()) throw unauthorized(message);
    return next();
  };
}
