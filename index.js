// Import required modules
require('dotenv').config();
const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { keepAlive } = require('./keep_alive.js');
const { getChannels, connectDB } = require('./db.js');
const express = require('express');

// Start the keep-alive service and get the Express app
const app = keepAlive();

// Add additional routes to the same Express app
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add API routes from index.js to the same app
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working' });
});

// Start a single Express server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Import commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Setup REST API for slash commands
const commands = [];
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

client.commands = new Collection();

// Import command files dynamically
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Earthquake monitoring configuration
const USGS_API_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
let lastEarthquakeId = null;
const processedEarthquakes = new Set();

// ค่าพิกัดและระยะโฟกัสตามภูมิภาค
const REGIONS = {
  global: {
    minMagnitude: 4.0
  },
  thailand: {
    center: { lat: 13.7563, lon: 100.5018 }, // กรุงเทพฯ
    radius: 2200, // รัศมี 2200 กม. (เพิ่มจาก 2000 กม.)
    minMagnitude: 3.0
  },
  sea: {
    // ขอบเขตของ Southeast Asia
    minLat: -11, // ใต้สุดของอินโดนีเซีย
    maxLat: 28,  // เหนือสุดของพม่า
    minLon: 92,  // ตะวันตกสุดของพม่า
    maxLon: 141, // ตะวันออกสุดของอินโดนีเซีย/ฟิลิปปินส์
    minMagnitude: 3.5
  },
  asia: {
    // ขอบเขตของเอเชีย
    minLat: -10, // ใต้สุดของอินโดนีเซีย
    maxLat: 60,  // เหนือสุดของรัสเซีย
    minLon: 30,  // ตะวันตกสุดของเอเชียตะวันตก
    maxLon: 150, // ตะวันออกสุดของญี่ปุ่น
    minMagnitude: 3.8
  }
};

function getMagnitudeColor(magnitude) {
  if (magnitude >= 7.0) return 0xFF0000; // Dark red
  else if (magnitude >= 6.0) return 0xFF3300; // Red
  else if (magnitude >= 5.0) return 0xFF6600; // Orange
  else if (magnitude >= 4.0) return 0xFF9900; // Light orange
  else return 0xFFCC00; // Yellow
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function isNearThailand(coordinates) {
  // Bangkok coordinates
  const BANGKOK_LAT = 13.7563;
  const BANGKOK_LON = 100.5018;
  
  // Convert coordinates to radians
  const lat1 = coordinates[1] * Math.PI / 180;
  const lon1 = coordinates[0] * Math.PI / 180;
  const lat2 = BANGKOK_LAT * Math.PI / 180;
  const lon2 = BANGKOK_LON * Math.PI / 180;
  
  // Earth's radius in kilometers
  const R = 6371;
  
  // Calculate distance using Haversine formula
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  // Return true if earthquake is within 1000km of Bangkok
  return distance <= 1000;
}

// คำนวณระยะห่างระหว่างจุดสองจุดบนโลก (หน่วยเป็นกิโลเมตร)
function calculateDistance(lat1, lon1, lat2, lon2) {
  // Earth's radius in kilometers
  const R = 6371;
  
  // Convert coordinates to radians
  const lat1Rad = lat1 * Math.PI / 180;
  const lon1Rad = lon1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const lon2Rad = lon2 * Math.PI / 180;
  
  // Calculate distance using Haversine formula
  const dLat = lat2Rad - lat1Rad;
  const dLon = lon2Rad - lon1Rad;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ตรวจสอบว่าแผ่นดินไหวอยู่ในภูมิภาคที่เลือกหรือไม่
function isInRegion(coordinates, region) {
  const latitude = coordinates[1];
  const longitude = coordinates[0];
  
  switch(region) {
    case 'thailand':
      const distanceFromBangkok = calculateDistance(
        REGIONS.thailand.center.lat,
        REGIONS.thailand.center.lon,
        latitude,
        longitude
      );
      return distanceFromBangkok <= REGIONS.thailand.radius;
      
    case 'sea':
      return latitude >= REGIONS.sea.minLat && 
             latitude <= REGIONS.sea.maxLat && 
             longitude >= REGIONS.sea.minLon && 
             longitude <= REGIONS.sea.maxLon;
      
    case 'asia':
      return latitude >= REGIONS.asia.minLat && 
             latitude <= REGIONS.asia.maxLat && 
             longitude >= REGIONS.asia.minLon && 
             longitude <= REGIONS.asia.maxLon;
      
    case 'global':
    default:
      return true; // ทั่วโลกจะรับแผ่นดินไหวทั้งหมด
  }
}

async function checkEarthquakes() {
  try {
    const response = await fetch(USGS_API_URL, {
      headers: {
        'User-Agent': 'EarthquakeBot/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Get channels from MongoDB
    let channels = {};
    try {
      channels = await getChannels();
    } catch (error) {
      console.error('[Earthquake] Error getting channels from MongoDB:', error);
      // Continue with empty channels object
      channels = {};
    }
    
    // If no channels configured, skip all processing
    if (Object.keys(channels).length === 0) {
      return;
    }
    console.log(`[Earthquake] Found ${Object.keys(channels).length} channels to check`);
    
    // Process earthquakes in reverse chronological order (newest first)
    for (const earthquake of data.features.reverse()) {
      // Skip if we've already processed this earthquake
      if (processedEarthquakes.has(earthquake.id)) {
        continue;
      }
      
      const coordinates = earthquake.geometry.coordinates;
      const magnitude = earthquake.properties.mag;
      
      // Add to processed set so we don't process it again
      processedEarthquakes.add(earthquake.id);
      
      // Send alert to each configured channel if earthquake matches their criteria
      for (const [guildId, channelData] of Object.entries(channels)) {
        try {
          // Get the focusRegion for this guild (default to global if not specified)
          const focusRegion = channelData.focusRegion || 'global';
          
          // Check minimum magnitude for this region
          const minMagnitude = REGIONS[focusRegion].minMagnitude;
          
          // Skip if magnitude is too low for this region
          if (magnitude < minMagnitude) {
            continue;
          }
          
          // Skip if earthquake is not in the selected region
          if (!isInRegion(coordinates, focusRegion)) {
            continue;
          }
          
          // It passed all filters, send notification
          const channelId = channelData.channelId;
          const channel = await client.channels.fetch(channelId);
          
          if (channel) {
            await sendEarthquakeAlert(channel, earthquake, focusRegion);
            console.log(`[Earthquake] Alert sent to channel ${channelId} in guild ${guildId} (${focusRegion} focus)`);
          }
        } catch (error) {
          console.error(`[Earthquake] Error processing alert for guild ${guildId}:`, error);
        }
      }
    }

    // Clean up old earthquake IDs to prevent memory issues
    if (processedEarthquakes.size > 1000) {
      const idsArray = Array.from(processedEarthquakes);
      const idsToKeep = idsArray.slice(idsArray.length - 500);
      processedEarthquakes.clear();
      idsToKeep.forEach(id => processedEarthquakes.add(id));
    }

  } catch (error) {
    console.error('[Earthquake] Error checking earthquakes:', error);
  }
}

// Register slash commands when bot starts
client.once(Events.ClientReady, async c => {
  console.log(`[Bot] Ready! Logged in as ${c.user.tag}`);
  
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    console.log('[Bot] Refreshing application (/) commands...');
    
    await rest.put(
      Routes.applicationCommands(c.user.id),
      { body: commands },
    );
    
    console.log('[Bot] Successfully refreshed application (/) commands.');
  } catch (error) {
    console.error('[Bot] Error refreshing commands:', error);
  }
  
  // Connect to MongoDB - but don't block bot startup if it fails
  try {
    await connectDB();
  } catch (error) {
    console.error('[Bot] MongoDB connection failed, but continuing without it:', error);
  }
  
  // Initial check
  checkEarthquakes();
  
  // Set up interval for regular checks (every 5 seconds)
  setInterval(checkEarthquakes, 5000);
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`[Command] No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Command] Error executing command ${interaction.commandName}:`, error);
    
    if (interaction.replied) {
      await interaction.followUp({ 
        content: 'An error occurred while executing this command. Please try again.', 
        flags: 64
      }).catch(e => console.error('[Command] Error sending followUp:', e));
    } else if (interaction.deferred) {
      await interaction.editReply({ 
        content: 'An error occurred while executing this command. Please try again.' 
      }).catch(e => console.error('[Command] Error sending editReply:', e));
    } else {
      await interaction.reply({ 
        content: 'An error occurred while executing this command. Please try again.', 
        flags: 64
      }).catch(e => console.error('[Command] Error sending reply:', e));
    }
  }
});

// Try to connect to MongoDB but don't terminate if it fails
try {
  connectDB().catch(err => {
    console.error('[MongoDB] Initial connection error but continuing anyway:', err.message);
  });
} catch (error) {
  console.error('[MongoDB] Failed to initialize MongoDB connection:', error.message);
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

async function sendEarthquakeAlert(channel, earthquake, focusRegion) {
  const magnitude = earthquake.properties.mag.toFixed(1);
  const location = earthquake.properties.place;
  const time = formatTime(earthquake.properties.time);
  const coordinates = earthquake.geometry.coordinates;
  const depth = coordinates[2].toFixed(1);
  const latitude = coordinates[1];
  const longitude = coordinates[0];
  
  // คำนวณระยะห่างจากกรุงเทพฯ สำหรับโฟกัส Thailand
  let distanceFromBangkok = null;
  if (focusRegion === 'thailand') {
    distanceFromBangkok = calculateDistance(
      REGIONS.thailand.center.lat,
      REGIONS.thailand.center.lon,
      latitude,
      longitude
    ).toFixed(0); // ปัดเศษเป็นจำนวนเต็ม
  }
  
  const embed = {
    title: '🌍 Earthquake Alert',
    description: `**Location:** ${location}\n**Time:** ${time}`,
    color: getMagnitudeColor(parseFloat(magnitude)),
    fields: [
      {
        name: 'Magnitude',
        value: `**${magnitude}** Richter`,
        inline: true
      },
      {
        name: 'Depth',
        value: `${depth} km`,
        inline: true
      },
      {
        name: 'Coordinates',
        value: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        inline: true
      }
    ],
    thumbnail: {
      url: `https://earthquake.usgs.gov/images/globes/${Math.round(latitude)}${Math.round(longitude)}/en-US.jpg`
    },
    footer: {
      text: 'Data from USGS Earthquake Hazards Program',
      icon_url: 'https://earthquake.usgs.gov/theme/images/logo.png'
    },
    timestamp: new Date(earthquake.properties.time).toISOString()
  };

  // เพิ่มฟิลด์ระยะห่างจากกรุงเทพฯ เมื่อโฟกัสเป็น Thailand
  if (distanceFromBangkok !== null) {
    embed.fields.push({
      name: 'Distance from Bangkok',
      value: `${distanceFromBangkok} km`,
      inline: true
    });
  }

  // เพิ่มข้อความระดับความรุนแรง
  let alertContent = '🚨 **Earthquake Alert** 🚨';
  
  if (parseFloat(magnitude) >= 6.0) {
    alertContent = '@everyone 🚨 **Major Earthquake Alert** 🚨';
  } else if (parseFloat(magnitude) >= 5.0) {
    alertContent = '@everyone 🚨 **Earthquake Alert** 🚨';
  }
  
  // เพิ่มข้อความระบุโฟกัสภูมิภาค
  let regionText = '';
  switch (focusRegion) {
    case 'thailand':
      regionText = '🇹🇭 Thailand Region';
      break;
    case 'sea':
      regionText = '🌏 Southeast Asia';
      break;
    case 'asia':
      regionText = '🌏 Asia';
      break;
    default:
      regionText = '🌎 Global';
  }
  
  alertContent += ` (${regionText})`;

  await channel.send({
    content: alertContent,
    embeds: [embed]
  });
}