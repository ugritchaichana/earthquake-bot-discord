import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'earthquake-bot';

let client = null;

export async function connectDB() {
  try {
    if (client) {
      return client.db(DB_NAME);
    }

    client = await MongoClient.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('Connected to MongoDB');
    return client.db(DB_NAME);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

export async function closeDB() {
  if (client) {
    try {
      await client.close();
      client = null;
      console.log('Disconnected from MongoDB');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
      throw error;
    }
  }
}

export async function getChannels() {
  try {
    const db = await connectDB();
    const channels = await db.collection('channels').find({}).toArray();
    return channels.reduce((acc, channel) => {
      acc[channel.guildId] = channel.channelId;
      return acc;
    }, {});
  } catch (error) {
    console.error('Error getting channels:', error);
    return {};
  } finally {
    await closeDB();
  }
}

export async function setChannel(guildId, channelId) {
  try {
    const db = await connectDB();
    await db.collection('channels').updateOne(
      { guildId },
      { $set: { guildId, channelId } },
      { upsert: true }
    );
    console.log(`Channel ${channelId} set for guild ${guildId}`);
  } catch (error) {
    console.error('Error setting channel:', error);
    throw error;
  } finally {
    await closeDB();
  }
}

export async function removeChannel(guildId) {
  try {
    const db = await connectDB();
    await db.collection('channels').deleteOne({ guildId });
    console.log(`Channel removed for guild ${guildId}`);
  } catch (error) {
    console.error('Error removing channel:', error);
    throw error;
  } finally {
    await closeDB();
  }
} 