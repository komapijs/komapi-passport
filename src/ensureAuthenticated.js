'use strict';

// Dependencies
import Boom from 'boom';

// Exports
export default function ensureAuthenticatedProvider(message) {
    message = message || 'Access to this resource requires authentication';
    return function ensureAuthenticated(ctx, next) {
        if (!ctx.isAuthenticated()) throw Boom.unauthorized(message);
        return next();
    };
}