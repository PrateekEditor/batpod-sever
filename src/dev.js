// Local development server. On Vercel this file is never used — api/index.js is.
require('dotenv').config();
const app = require('./app');

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`batpod-server listening on http://localhost:${port}`);
  console.log(`health check: http://localhost:${port}/api/health`);
});
