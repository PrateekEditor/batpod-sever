const mongoose = require('mongoose');

// Serverless functions can be invoked hundreds of times a minute, and each cold
// start would otherwise open a brand new connection pool until Atlas refuses
// them. Cache the connection promise on the Node global so every warm
// invocation in the same container reuses one pool.
let cached = global.__batpodMongoose;
if (!cached) cached = global.__batpodMongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
        // Keeps a dead pool from being reused after the container is frozen.
        socketTimeoutMS: 45000,
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

module.exports = { connectDB, mongoose };
