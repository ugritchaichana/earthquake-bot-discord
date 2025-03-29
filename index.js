// Import required modules
import 'dotenv/config';
import fetch from 'node-fetch';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { keepAlive } from './keep_alive.js';
import { getChannels } from './db.js';

// Start the keep-alive server
keepAlive();

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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

client.commands = new Collection();

// Import command files dynamically
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
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

// Earthquake monitoring configuration
const USGS_API_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
let lastEarthquakeId = null;
const processedEarthquakes = new Set();

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
    
    // Process earthquakes in reverse chronological order (newest first)
    for (const earthquake of data.features.reverse()) {
      const coordinates = earthquake.geometry.coordinates;
      const magnitude = earthquake.properties.mag;
      
      // Check if earthquake is significant (magnitude >= 4.0) or near Thailand
      if (!processedEarthquakes.has(earthquake.id) && 
          (magnitude >= 4.0 || (magnitude >= 3.0 && isNearThailand(coordinates)))) {
        processedEarthquakes.add(earthquake.id);
        
        // Get channels from MongoDB
        const channels = await getChannels();
        console.log(`[Earthquake] Found ${Object.keys(channels).length} channels to notify`);

        // Send alert to all configured channels
        for (const [guildId, channelId] of Object.entries(channels)) {
          try {
            const channel = await client.channels.fetch(channelId);
            if (channel) {
              const magnitude = earthquake.properties.mag.toFixed(1);
              const location = earthquake.properties.place;
              const time = formatTime(earthquake.properties.time);
              const coordinates = earthquake.geometry.coordinates;
              const depth = coordinates[2].toFixed(1);
              
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
                    value: `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`,
                    inline: true
                  }
                ],
                thumbnail: {
                  url: `https://earthquake.usgs.gov/images/globes/${Math.round(coordinates[1])}${Math.round(coordinates[0])}/en-US.jpg`
                },
                footer: {
                  text: 'Data from USGS Earthquake Hazards Program',
                  icon_url: 'https://earthquake.usgs.gov/theme/images/logo.png'
                },
                timestamp: new Date(earthquake.properties.time).toISOString()
              };

              let alertContent = '🚨 **Earthquake Alert** 🚨';
              
              if (parseFloat(magnitude) >= 6.0) {
                alertContent = '@everyone 🚨 **Major Earthquake Alert** 🚨';
              } else if (parseFloat(magnitude) >= 5.0) {
                alertContent = '@everyone 🚨 **Earthquake Alert** 🚨';
              }

              await channel.send({
                content: alertContent,
                embeds: [embed]
              });
              console.log(`[Earthquake] Alert sent to channel ${channelId} in guild ${guildId}`);
            }
          } catch (error) {
            console.error(`[Earthquake] Error sending alert to channel ${channelId}:`, error);
          }
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

// Login to Discord
client.login(process.env.DISCORD_TOKEN);