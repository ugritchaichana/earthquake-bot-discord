// Import required modules
import 'dotenv/config';
import fetch from 'node-fetch';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { keepAlive } from './keep_alive.js';

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
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour12: true
  });
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
      if (!processedEarthquakes.has(earthquake.id) && earthquake.properties.mag >= 4.0) {
        processedEarthquakes.add(earthquake.id);
        
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);
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
    console.error('Error checking earthquakes:', error);
  }
}

// Register slash commands when bot starts
client.once(Events.ClientReady, async c => {
  console.log(`Bot is ready! Logged in as ${c.user.tag}`);
  
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    console.log('Refreshing application (/) commands...');
    
    await rest.put(
      Routes.applicationCommands(c.user.id),
      { body: commands },
    );
    
    console.log('Successfully refreshed application (/) commands.');
  } catch (error) {
    console.error(error);
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
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    
    if (interaction.replied) {
      await interaction.followUp({ 
        content: 'An error occurred while executing this command. Please try again.', 
        flags: 64
      }).catch(e => console.error('Error sending followUp:', e));
    } else if (interaction.deferred) {
      await interaction.editReply({ 
        content: 'An error occurred while executing this command. Please try again.' 
      }).catch(e => console.error('Error sending editReply:', e));
    } else {
      await interaction.reply({ 
        content: 'An error occurred while executing this command. Please try again.', 
        flags: 64
      }).catch(e => console.error('Error sending reply:', e));
    }
  }
});

// Login to Discord with the bot token
client.login(process.env.DISCORD_TOKEN);