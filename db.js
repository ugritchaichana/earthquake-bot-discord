const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'earthquake-bot';

// สร้าง Schema สำหรับ Channel
const channelSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  channelName: { type: String, required: true },
  guildName: { type: String, required: true },
  focusRegion: { type: String, enum: ['global', 'thailand', 'sea', 'asia'], default: 'global' },
  updatedAt: { type: Date, default: Date.now }
});

// สร้าง Model
const Channel = mongoose.model('Channel', channelSchema);

let isConnected = false;
let pendingOperations = [];
let reconnectTimer = null;

// ฟังก์ชั่นพยายามเชื่อมต่อไปยัง MongoDB ซ้ำๆ
function scheduleReconnect() {
  if (reconnectTimer) return; // ถ้ามี timer อยู่แล้วให้ใช้ตัวเดิม
  
  console.log('[MongoDB] Scheduling reconnection attempt...');
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectDB();
      
      if (isConnected && pendingOperations.length > 0) {
        console.log(`[MongoDB] Processing ${pendingOperations.length} pending operations...`);
        const ops = [...pendingOperations]; // คัดลอกรายการ
        pendingOperations = []; // ล้างรายการรอ
        
        // ทำงานที่ค้างอยู่ทั้งหมด
        for (const operation of ops) {
          try {
            await operation();
          } catch (err) {
            console.error('[MongoDB] Error processing pending operation:', err);
          }
        }
      }
    } catch (error) {
      console.error('[MongoDB] Reconnection failed:', error);
      scheduleReconnect(); // พยายามเชื่อมต่อใหม่อีกครั้ง
    }
  }, 60000); // พยายามเชื่อมต่อใหม่ทุก 1 นาที
}

async function connectDB() {
  try {
    if (isConnected) {
      console.log('[MongoDB] Using existing connection');
      return;
    }

    console.log('[MongoDB] Connecting to database...');
    
    // ปรับปรุงการตั้งค่าเพื่อแก้ไขปัญหา TLS
    const conn = await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // ลบการตั้งค่า TLS ที่อาจก่อให้เกิดปัญหา
      retryWrites: true,
      retryReads: true,
      ssl: true, // ใช้ SSL แทน TLS
      authSource: 'admin',
      directConnection: false
    }).catch(err => {
      console.error('[MongoDB] Connection error:', err.message);
      throw err;
    });

    isConnected = true;
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
    console.log(`[MongoDB] Database name: ${DB_NAME}`);
    
    // Set up error event listener to detect disconnection
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err);
      isConnected = false;
      scheduleReconnect();
    });
    
    mongoose.connection.on('disconnected', () => {
      console.error('[MongoDB] Disconnected from database');
      isConnected = false;
      scheduleReconnect();
    });
    
    return conn;
  } catch (error) {
    console.error('[MongoDB] Error connecting to database:', error);
    isConnected = false;
    
    // Schedule reconnection attempt
    scheduleReconnect();
    
    throw error; // ส่งต่อ error ให้ส่วนที่เรียกใช้จัดการ
  }
}

async function closeDB() {
  if (isConnected) {
    try {
      console.log('[MongoDB] Closing database connection...');
      await mongoose.disconnect();
      isConnected = false;
      console.log('[MongoDB] Successfully closed database connection');
    } catch (error) {
      console.error('[MongoDB] Error closing database connection:', error);
    }
  }
}

async function getChannels() {
  try {
    console.log('[MongoDB] Getting channels from database...');
    
    // Connect to MongoDB
    await connectDB();
    
    // Get channels from MongoDB
    const channels = await Channel.find({});
    console.log(`[MongoDB] Found ${channels.length} channels in database`);
    
    // Transform to expected format
    return channels.reduce((acc, channel) => {
      acc[channel.guildId] = {
        channelId: channel.channelId,
        channelName: channel.channelName,
        guildName: channel.guildName,
        focusRegion: channel.focusRegion || 'global'
      };
      return acc;
    }, {});
  } catch (error) {
    console.error('[MongoDB] Error getting channels:', error);
    return {}; // ถ้าเกิดข้อผิดพลาดให้ส่งอ็อบเจ็กต์ว่างกลับไป
  }
}

async function setChannel(guildId, channelId, channelName, guildName, focusRegion = 'global') {
  console.log(`[MongoDB] Setting channel ${channelName} (${channelId}) for guild ${guildName} (${guildId}) with focus region: ${focusRegion}...`);
  
  const saveOperation = async () => {
    try {
      // Update MongoDB
      const result = await Channel.findOneAndUpdate(
        { guildId },
        { 
          guildId,
          channelId,
          channelName,
          guildName,
          focusRegion,
          updatedAt: new Date()
        },
        { 
          upsert: true,
          new: true
        }
      );
      console.log(`[MongoDB] Channel set successfully. ${result ? 'Updated existing channel' : 'Created new channel'}`);
      return true;
    } catch (error) {
      console.error('[MongoDB] Error setting channel:', error);
      throw error;
    }
  };
  
  try {
    await connectDB();
    return await saveOperation();
  } catch (error) {
    // เก็บ operation นี้ไว้ทำภายหลังเมื่อเชื่อมต่อได้
    console.log('[MongoDB] Adding to pending operations for when connection is restored');
    pendingOperations.push(() => saveOperation());
    
    // ถ้ายังไม่เชื่อมต่อให้เริ่มพยายามเชื่อมต่อใหม่
    if (!isConnected) {
      scheduleReconnect();
    }
    
    // แทนที่จะ throw error ให้ return false เพื่อให้แอปทำงานต่อไปได้
    return false;
  }
}

async function removeChannel(guildId) {
  console.log(`[MongoDB] Removing channel for guild ${guildId}...`);
  
  const removeOperation = async () => {
    try {
      // Delete from MongoDB
      const result = await Channel.deleteOne({ guildId });
      console.log(`[MongoDB] Channel removed successfully. Deleted: ${result.deletedCount}`);
      return true;
    } catch (error) {
      console.error('[MongoDB] Error removing channel:', error);
      throw error;
    }
  };
  
  try {
    await connectDB();
    return await removeOperation();
  } catch (error) {
    // เก็บ operation นี้ไว้ทำภายหลังเมื่อเชื่อมต่อได้
    console.log('[MongoDB] Adding to pending operations for when connection is restored');
    pendingOperations.push(() => removeOperation());
    
    // ถ้ายังไม่เชื่อมต่อให้เริ่มพยายามเชื่อมต่อใหม่
    if (!isConnected) {
      scheduleReconnect();
    }
    
    // แทนที่จะ throw error ให้ return false เพื่อให้แอปทำงานต่อไปได้
    return false;
  }
}

module.exports = {
  connectDB,
  closeDB,
  getChannels,
  setChannel,
  removeChannel
};