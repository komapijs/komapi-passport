// Dependencies
const passport = require('./dist/index'); // eslint-disable-line import/no-unresolved

// Exports
module.exports = passport.default;
module.exports.KomapiPassport = passport.KomapiPassport;
module.exports.mutateApp = passport.mutateApp;
module.exports.ensureAuthenticated = passport.ensureAuthenticated;
