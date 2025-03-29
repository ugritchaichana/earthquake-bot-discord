import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'earthquake-bot';

let client = null;

export async function connectDB() {
  try {
    if (client) {
      console.log('[MongoDB] Using existing connection');
      return client.db(DB_NAME);
    }

    console.log('[MongoDB] Connecting to database...');
    client = await MongoClient.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: true,
      retryWrites: true,
      w: 'majority',
      retryReads: true
    });

    // Test the connection
    await client.db(DB_NAME).command({ ping: 1 });
    console.log('[MongoDB] Successfully connected to database');
    console.log(`[MongoDB] Database name: ${DB_NAME}`);
    console.log(`[MongoDB] Server version: ${client.serverVersion}`);
    
    return client.db(DB_NAME);
  } catch (error) {
    console.error('[MongoDB] Error connecting to database:', error);
    throw error;
  }
}

export async function closeDB() {
  if (client) {
    try {
      console.log('[MongoDB] Closing database connection...');
      await client.close();
      client = null;
      console.log('[MongoDB] Successfully closed database connection');
    } catch (error) {
      console.error('[MongoDB] Error closing database connection:', error);
      throw error;
    }
  }
}

export async function getChannels() {
  try {
    console.log('[MongoDB] Getting channels from database...');
    const db = await connectDB();
    const channels = await db.collection('channels').find({}).toArray();
    console.log(`[MongoDB] Found ${channels.length} channels in database`);
    return channels.reduce((acc, channel) => {
      acc[channel.guildId] = channel.channelId;
      return acc;
    }, {});
  } catch (error) {
    console.error('[MongoDB] Error getting channels:', error);
    return {};
  } finally {
    await closeDB();
  }
}

export async function setChannel(guildId, channelId) {
  try {
    console.log(`[MongoDB] Setting channel ${channelId} for guild ${guildId}...`);
    const db = await connectDB();
    const result = await db.collection('channels').updateOne(
      { guildId },
      { $set: { guildId, channelId } },
      { upsert: true }
    );
    console.log(`[MongoDB] Channel set successfully. Modified: ${result.modifiedCount}, Upserted: ${result.upsertedCount}`);
  } catch (error) {
    console.error('[MongoDB] Error setting channel:', error);
    throw error;
  } finally {
    await closeDB();
  }
}

export async function removeChannel(guildId) {
  try {
    console.log(`[MongoDB] Removing channel for guild ${guildId}...`);
    const db = await connectDB();
    const result = await db.collection('channels').deleteOne({ guildId });
    console.log(`[MongoDB] Channel removed successfully. Deleted: ${result.deletedCount}`);
  } catch (error) {
    console.error('[MongoDB] Error removing channel:', error);
    throw error;
  } finally {
    await closeDB();
  }
} 