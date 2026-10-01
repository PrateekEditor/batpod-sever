// Vercel serverless entry point. @vercel/node hands each request to the
// exported Express app; everything else lives in ../src.
module.exports = require('../src/app');
