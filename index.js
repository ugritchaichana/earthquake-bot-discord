// Import required modules
import 'dotenv/config';
import fetch from 'node-fetch';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix ESM path issues on Windows
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Setup REST API for slash commands
const commands = [];
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages
  ] 
});

client.commands = new Collection();

// Import command files dynamically
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  // Convert to proper file:// URL for ES modules on Windows
  const fileURL = new URL(`file://${filePath}`);
  const commandModule = await import(fileURL);
  const command = commandModule.default;
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Setup API endpoint constants
const EARTHQUAKE_API_URLS = [
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', // All earthquakes in the past hour (primary)
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.geojson', // 4.5+ magnitude in the past hour (faster, smaller file)
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson', // 2.5+ magnitude in the past hour (more comprehensive)
];

// Use webhook URL only if provided, otherwise focus on bot functionality
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const USE_WEBHOOK = WEBHOOK_URL && WEBHOOK_URL.startsWith('https://discord.com/api/webhooks/');

// Store the last checked earthquake IDs to avoid duplicate notifications
const processedEarthquakeIds = new Set();

// Thailand and nearby region coordinates (more focused on Thailand and immediate neighbors)
const THAILAND_REGION = {
  minLat: 5,   // Southern Thailand/Malaysia border
  maxLat: 22,  // Northern Thailand/Myanmar/Laos
  minLng: 97,  // Western Thailand/Myanmar border
  maxLng: 106  // Eastern Thailand/Laos/Cambodia border
};

// Broader SEA region coordinates
const SEA_REGIONS = {
  minLat: -11, // Southern Indonesia
  maxLat: 28,  // Northern Myanmar
  minLng: 92,  // Western Myanmar
  maxLng: 141  // Eastern Indonesia/Philippines
};

const THAILAND_NEIGHBORS = [
  {name: "Myanmar", keywords: ["myanmar", "burma"]},
  {name: "Laos", keywords: ["laos", "lao"]},
  {name: "Cambodia", keywords: ["cambodia"]},
  {name: "Vietnam", keywords: ["vietnam"]},
  {name: "Malaysia", keywords: ["malaysia"]},
  {name: "Indonesia", keywords: ["indonesia", "sumatra"]},
  {name: "Philippines", keywords: ["philippines"]}
];

// Various utility functions
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isInThailandRegion(longitude, latitude) {
  return (
    latitude >= THAILAND_REGION.minLat && 
    latitude <= THAILAND_REGION.maxLat && 
    longitude >= THAILAND_REGION.minLng && 
    longitude <= THAILAND_REGION.maxLng
  );
}

function isInSEA(longitude, latitude) {
  return (
    latitude >= SEA_REGIONS.minLat && 
    latitude <= SEA_REGIONS.maxLat && 
    longitude >= SEA_REGIONS.minLng && 
    longitude <= SEA_REGIONS.maxLng
  );
}

function isInNeighboringCountry(location) {
  location = location.toLowerCase();
  return THAILAND_NEIGHBORS.some(country => 
    location.includes(country.name.toLowerCase()) || 
    country.keywords.some(keyword => location.includes(keyword))
  );
}

const BANGKOK_COORDS = {
  latitude: 13.7563,
  longitude: 100.5018
};

function getMagnitudeColor(magnitude) {
  if (magnitude >= 7.0) return 0x990000; 
  else if (magnitude >= 6.0) return 0xFF0000;
  else if (magnitude >= 5.0) return 0xFF9900;
  else if (magnitude >= 4.0) return 0xFFCC00;
  else return 0xFFFF00; 
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour12: true
  });
}

function getAlertLevel(magnitude, distanceFromThailand, isNearThailand, inNeighboringCountry) {
  let priorityScore = 100;
  
  if (magnitude >= 7.0) priorityScore -= 50;
  else if (magnitude >= 6.0) priorityScore -= 30;
  else if (magnitude >= 5.0) priorityScore -= 15;
  else if (magnitude >= 4.0) priorityScore -= 5;
  
  if (isNearThailand) priorityScore -= 25;
  else if (inNeighboringCountry) priorityScore -= 15;
  else if (distanceFromThailand < 500) priorityScore -= 20;
  else if (distanceFromThailand < 1000) priorityScore -= 10;
  else if (distanceFromThailand < 2000) priorityScore -= 5;
  
  if (priorityScore <= 30) {
    return {
      level: "EXTREME ALERT",
      description: "Severe earthquake with potential impact on Thailand",
      shouldAlert: true
    };
  } else if (priorityScore <= 50) {
    return {
      level: "HIGH ALERT",
      description: "Strong earthquake that may be felt in Thailand",
      shouldAlert: magnitude >= 5.5
    };
  } else if (priorityScore <= 70) {
    return {
      level: "MODERATE ALERT",
      description: "Notable earthquake in the region",
      shouldAlert: magnitude >= 6.0
    };
  } else if (priorityScore <= 85) {
    return {
      level: "LOW ALERT",
      description: "Earthquake with minimal impact",
      shouldAlert: false
    };
  } else {
    return {
      level: "INFORMATION ONLY",
      description: "Distant earthquake with no direct impact on Thailand",
      shouldAlert: false
    };
  }
}

function getImpactAssessment(magnitude, distanceFromThailand, isNearThailand, inNeighboringCountry) {
  if (isNearThailand && magnitude >= 5.0) {
    return "Significant shaking may be felt across Thailand. Monitor for possible damage and aftershocks.";
  } else if (isNearThailand && magnitude >= 4.0) {
    return "Light to moderate shaking may be felt in parts of Thailand. Generally low risk of damage.";
  } else if (inNeighboringCountry && magnitude >= 6.0) {
    return "Strong earthquake in neighboring country. May be felt in border regions of Thailand.";
  } else if (distanceFromThailand < 500 && magnitude >= 6.5) {
    return "Major earthquake near Thailand. Monitor for possible effects.";
  } else if (distanceFromThailand < 1000 && magnitude >= 7.0) {
    return "Significant regional earthquake. Check for tsunami warnings if near coast.";
  } else {
    return "No direct impact expected for Thailand.";
  }
}

async function fetchEarthquakeData(apiUrl) {
  try {
    const controller = new AbortController();
    // Increasing timeout from 5 seconds to 15 seconds to avoid frequent timeouts
    const timeoutId = setTimeout(() => controller.abort(), 15000); 
    
    const response = await fetch(apiUrl, { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'EarthquakeAlertBot/1.0'
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching earthquake data from ${apiUrl}:`, error.name);
    return null;
  }
}

// Helper function to get configured alert channels
function getAlertChannels() {
  try {
    const dbPath = path.join(process.cwd(), 'channels.json');
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

async function checkEarthquakes() {
  // Try to fetch from each API endpoint, but don't wait for all to finish
  // This is more resilient to individual API failures
  let successfulFetches = 0;
  const fetchPromises = [];
  
  for (const url of EARTHQUAKE_API_URLS) {
    const promise = fetchEarthquakeData(url).then(data => {
      if (data) {
        successfulFetches++;
        return data;
      }
      return null;
    });
    fetchPromises.push(promise);
  }
  
  const results = await Promise.allSettled(fetchPromises);
  
  const newEarthquakes = [];
  
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      
      data.features.forEach(earthquake => {
        const id = earthquake.id;
        if (!processedEarthquakeIds.has(id) && earthquake.properties.mag >= 4.0) {
          newEarthquakes.push(earthquake);
          processedEarthquakeIds.add(id);
        }
      });
    }
  });
  
  if (processedEarthquakeIds.size > 1000) {
    const idsArray = Array.from(processedEarthquakeIds);
    const idsToKeep = idsArray.slice(idsArray.length - 500);
    processedEarthquakeIds.clear();
    idsToKeep.forEach(id => processedEarthquakeIds.add(id));
  }

  if (newEarthquakes.length === 0) {
    return;
  }

  newEarthquakes.sort((a, b) => {
    const magA = a.properties.mag;
    const magB = b.properties.mag;
    const coordsA = a.geometry.coordinates;
    const coordsB = b.geometry.coordinates;
    
    const distA = calculateDistance(
      BANGKOK_COORDS.latitude, 
      BANGKOK_COORDS.longitude, 
      coordsA[1], 
      coordsA[0]
    );
    
    const distB = calculateDistance(
      BANGKOK_COORDS.latitude, 
      BANGKOK_COORDS.longitude, 
      coordsB[1], 
      coordsB[0]
    );
    
    const scoreA = distA / 100 - magA * 10;
    const scoreB = distB / 100 - magB * 10;
    
    return scoreA - scoreB;
  });

  // Send notifications to Discord channels configured with /setup
  const alertChannels = getAlertChannels();
  const discordNotificationPromises = [];

  // Process bot notifications first (priority)
  for (const [guildId, channelId] of Object.entries(alertChannels)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) continue;
    
    for (const earthquake of newEarthquakes) {
      const magnitude = earthquake.properties.mag.toFixed(1);
      const location = earthquake.properties.place;
      const time = formatTime(earthquake.properties.time);
      const url = earthquake.properties.url;
      const coordinates = earthquake.geometry.coordinates;
      const longitude = coordinates[0];
      const latitude = coordinates[1];
      const depth = coordinates[2].toFixed(1);
      
      const distanceFromBangkok = calculateDistance(
        BANGKOK_COORDS.latitude, 
        BANGKOK_COORDS.longitude, 
        latitude, 
        longitude
      ).toFixed(0);
      
      const inThailandRegion = isInThailandRegion(longitude, latitude);
      const inSEA = isInSEA(longitude, latitude);
      const inNeighboringCountry = isInNeighboringCountry(location);
      
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=8`;
      
      const alertInfo = getAlertLevel(
        parseFloat(magnitude), 
        parseFloat(distanceFromBangkok), 
        inThailandRegion, 
        inNeighboringCountry
      );
      
      const impact = getImpactAssessment(
        parseFloat(magnitude), 
        parseFloat(distanceFromBangkok), 
        inThailandRegion, 
        inNeighboringCountry
      );
      
      let alertContent = '🚨 **EARTHQUAKE ALERT** 🚨';
      
      if (inThailandRegion && parseFloat(magnitude) >= 4.5) {
        alertContent = '@everyone 🚨 **URGENT! EARTHQUAKE NEAR THAILAND** 🚨';
      } else if ((inSEA || inNeighboringCountry) && parseFloat(magnitude) >= 5.5) {
        alertContent = '@everyone 🚨 **ALERT! EARTHQUAKE IN SOUTHEAST ASIA** 🚨';
      } else if (parseFloat(magnitude) >= 7.0) {
        alertContent = '@everyone 🚨 **MAJOR GLOBAL EARTHQUAKE ALERT** 🚨';
      }
      
      let locationTag = "";
      if (inThailandRegion) locationTag = "[THAILAND AREA] ";
      else if (inNeighboringCountry) locationTag = "[NEIGHBORING COUNTRY] ";
      else if (inSEA) locationTag = "[SOUTHEAST ASIA] ";
      
      try {
        await channel.send({
          content: alertContent,
          embeds: [{
            title: `${locationTag}Magnitude ${magnitude} Earthquake ${location}`,
            description: 
              `**Alert Level:** ${alertInfo.level}\n` +
              `**Time (Bangkok, GMT+7):** ${time}\n` +
              `**Depth:** ${depth} km\n` +
              `**Coordinates:** [${latitude.toFixed(4)}, ${longitude.toFixed(4)}](${mapsUrl})\n` +
              `**Distance from Bangkok:** ${distanceFromBangkok} km\n\n` +
              `**Impact Assessment:** ${impact}\n\n` +
              `[View USGS Details](${url})`,
            color: getMagnitudeColor(parseFloat(magnitude)),
            thumbnail: {
              url: `https://earthquake.usgs.gov/images/globes/${Math.round(latitude)}${Math.round(longitude)}/en-US.jpg`
            },
            fields: [
              {
                name: 'Magnitude',
                value: `**${magnitude}**`,
                inline: true
              },
              {
                name: 'Region',
                value: location,
                inline: true
              },
              {
                name: 'Depth',
                value: `${depth} km`,
                inline: true
              }
            ],
            footer: {
              text: 'Data source: USGS Earthquake Hazards Program',
              icon_url: 'https://earthquake.usgs.gov/theme/images/logo.png'
            },
            timestamp: new Date(earthquake.properties.time).toISOString()
          }]
        });
        console.log(`Sent earthquake notification to channel ${channelId} for ${location} with magnitude ${magnitude}`);
      } catch (err) {
        console.error(`Error sending to channel ${channelId}:`, err.message);
      }
    }
  }

  // Process webhook notifications (if webhook URL is defined and valid)
  if (USE_WEBHOOK) {
    const notificationPromises = newEarthquakes.map(async (earthquake) => {
      const magnitude = earthquake.properties.mag.toFixed(1);
      const location = earthquake.properties.place;
      const time = formatTime(earthquake.properties.time);
      const url = earthquake.properties.url;
      const coordinates = earthquake.geometry.coordinates;
      const longitude = coordinates[0];
      const latitude = coordinates[1];
      const depth = coordinates[2].toFixed(1);
      
      const distanceFromBangkok = calculateDistance(
        BANGKOK_COORDS.latitude, 
        BANGKOK_COORDS.longitude, 
        latitude, 
        longitude
      ).toFixed(0);
      
      const inThailandRegion = isInThailandRegion(longitude, latitude);
      const inSEA = isInSEA(longitude, latitude);
      const inNeighboringCountry = isInNeighboringCountry(location);
      
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=8`;
      
      const alertInfo = getAlertLevel(
        parseFloat(magnitude), 
        parseFloat(distanceFromBangkok), 
        inThailandRegion, 
        inNeighboringCountry
      );
      
      const impact = getImpactAssessment(
        parseFloat(magnitude), 
        parseFloat(distanceFromBangkok), 
        inThailandRegion, 
        inNeighboringCountry
      );
      
      let alertContent = '🚨 **EARTHQUAKE ALERT** 🚨';
      
      if (inThailandRegion && parseFloat(magnitude) >= 4.5) {
        alertContent = '@everyone 🚨 **URGENT! EARTHQUAKE NEAR THAILAND** 🚨';
      } else if ((inSEA || inNeighboringCountry) && parseFloat(magnitude) >= 5.5) {
        alertContent = '@everyone 🚨 **ALERT! EARTHQUAKE IN SOUTHEAST ASIA** 🚨';
      } else if (parseFloat(magnitude) >= 7.0) {
        alertContent = '@everyone 🚨 **MAJOR GLOBAL EARTHQUAKE ALERT** 🚨';
      }
      
      let locationTag = "";
      if (inThailandRegion) locationTag = "[THAILAND AREA] ";
      else if (inNeighboringCountry) locationTag = "[NEIGHBORING COUNTRY] ";
      else if (inSEA) locationTag = "[SOUTHEAST ASIA] ";
      
      const webhookMessage = {
        content: alertContent,
        embeds: [{
          title: `${locationTag}Magnitude ${magnitude} Earthquake ${location}`,
          description: 
            `**Alert Level:** ${alertInfo.level}\n` +
            `**Time (Bangkok, GMT+7):** ${time}\n` +
            `**Depth:** ${depth} km\n` +
            `**Coordinates:** [${latitude.toFixed(4)}, ${longitude.toFixed(4)}](${mapsUrl})\n` +
            `**Distance from Bangkok:** ${distanceFromBangkok} km\n\n` +
            `**Impact Assessment:** ${impact}\n\n` +
            `[View USGS Details](${url})`,
          color: getMagnitudeColor(parseFloat(magnitude)),
          thumbnail: {
            url: `https://earthquake.usgs.gov/images/globes/${Math.round(latitude)}${Math.round(longitude)}/en-US.jpg`
          },
          fields: [
            {
              name: 'Magnitude',
              value: `**${magnitude}**`,
              inline: true
            },
            {
              name: 'Region',
              value: location,
              inline: true
            },
            {
              name: 'Depth',
              value: `${depth} km`,
              inline: true
            }
          ],
          footer: {
            text: 'Data source: USGS Earthquake Hazards Program',
            icon_url: 'https://earthquake.usgs.gov/theme/images/logo.png'
          },
          timestamp: new Date(earthquake.properties.time).toISOString()
        }]
      };
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookMessage),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.log(`Sent earthquake notification for ${location} with magnitude ${magnitude}`);
      } catch (error) {
        console.error(`Failed to send webhook for earthquake at ${location}:`, error);
      }
    });
    
    await Promise.allSettled(notificationPromises);
  }
}

// Register slash commands when bot starts
client.once(Events.ClientReady, async c => {
  console.log(`Earthquake Bot ready! Logged in as ${c.user.tag}`);
  
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(c.user.id),
      { body: commands },
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
  
  console.log('Starting real-time earthquake monitoring service...');
  
  // Initial check
  checkEarthquakes();
  
  // Set up interval for regular checks - slightly longer interval to reduce timeouts
  setInterval(checkEarthquakes, 30000); // Changed from 15 to 30 seconds
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    
    // Check if interaction has been replied to or deferred already to avoid 10062 error
    if (interaction.replied) {
      await interaction.followUp({ 
        content: 'An error occurred while executing this command. Please try again later.', 
        ephemeral: true 
      }).catch(e => console.error('Error sending followUp:', e));
    } else if (interaction.deferred) {
      await interaction.editReply({ 
        content: 'An error occurred while executing this command. Please try again later.' 
      }).catch(e => console.error('Error sending editReply:', e));
    } else {
      await interaction.reply({ 
        content: 'An error occurred while executing this command. Please try again later.', 
        ephemeral: true 
      }).catch(e => console.error('Error sending reply:', e));
    }
  }
});

// Login to Discord with the bot token
client.login(process.env.DISCORD_TOKEN);