const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.log('[DB] No MONGO_URI provided -> using fallback in-memory store');
    return false;
  }
  try {
    await mongoose.connect(uri, { autoIndex: true });
    isConnected = true;
    console.log('[DB] MongoDB connected:', mongoose.connection.host);
    return true;
  } catch (err) {
    console.log('[DB] MongoDB connection failed -> fallback store active:', err.message);
    return false;
  }
}

function getConnectionStatus() { return isConnected; }

module.exports = { connectDB, getConnectionStatus };
