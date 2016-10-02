// Dependencies
import { unauthorized as Unauthorized } from 'boom';

// Exports
export default function ensureAuthenticatedProvider(message) {
    const msg = message || 'Access to this resource requires authentication';
    return function ensureAuthenticated(ctx, next) {
        if (!ctx.isAuthenticated()) throw new Unauthorized(msg);
        return next();
    };
}
