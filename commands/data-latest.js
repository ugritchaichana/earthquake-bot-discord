import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';

// Thailand and nearby region coordinates
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

const BANGKOK_COORDS = {
  latitude: 13.7563,
  longitude: 100.5018
};

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

export default {
  data: new SlashCommandBuilder()
    .setName('data-latest')
    .setDescription('Display latest earthquake data')
    .addIntegerOption(option => 
      option.setName('count')
        .setDescription('Number of earthquakes to display (1-5)')
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(false))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Region to filter earthquakes')
        .setRequired(false)
        .addChoices(
          { name: 'Global', value: 'global' },
          { name: 'Thailand Region', value: 'thailand' },
          { name: 'Southeast Asia', value: 'sea' }
        )),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      // Get options
      const count = interaction.options.getInteger('count') || 3; // Default to 3 if not provided
      const region = interaction.options.getString('region') || 'global'; // Default to global if not provided
      
      // Fetch data
      const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'EarthquakeAlertBot/1.0'
        },
        timeout: 10000 // 10-second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter earthquakes based on region
      let filteredEarthquakes = data.features;
      
      if (region === 'thailand') {
        filteredEarthquakes = data.features.filter(quake => {
          const coords = quake.geometry.coordinates;
          const longitude = coords[0];
          const latitude = coords[1];
          const location = quake.properties.place || '';
          
          return isInThailandRegion(longitude, latitude) || 
                 calculateDistance(BANGKOK_COORDS.latitude, BANGKOK_COORDS.longitude, latitude, longitude) <= 1000;
        });
      } else if (region === 'sea') {
        filteredEarthquakes = data.features.filter(quake => {
          const coords = quake.geometry.coordinates;
          const longitude = coords[0];
          const latitude = coords[1];
          const location = quake.properties.place || '';
          
          return isInSEA(longitude, latitude) || isInNeighboringCountry(location);
        });
      }
      
      // Sort by time (newest first)
      filteredEarthquakes.sort((a, b) => b.properties.time - a.properties.time);
      
      // Limit to requested count
      const earthquakesToShow = filteredEarthquakes.slice(0, count);
      
      if (earthquakesToShow.length === 0) {
        return interaction.editReply('No earthquake data found in the specified region in the last 24 hours.');
      }
      
      // Create embeds for each earthquake
      const embeds = earthquakesToShow.map(earthquake => {
        const magnitude = earthquake.properties.mag.toFixed(1);
        const location = earthquake.properties.place || 'Unknown Location';
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
        
        let locationTag = "";
        if (inThailandRegion) locationTag = "[THAILAND AREA] ";
        else if (inNeighboringCountry) locationTag = "[NEIGHBORING COUNTRY] ";
        else if (inSEA) locationTag = "[SOUTHEAST ASIA] ";
        
        return new EmbedBuilder()
          .setTitle(`${locationTag}Magnitude ${magnitude} Earthquake ${location}`)
          .setDescription(
            `**Time (Bangkok, GMT+7):** ${time}\n` +
            `**Depth:** ${depth} km\n` +
            `**Coordinates:** [${latitude.toFixed(4)}, ${longitude.toFixed(4)}](${mapsUrl})\n` +
            `**Distance from Bangkok:** ${distanceFromBangkok} km\n\n` +
            `[View USGS Details](${url})`
          )
          .setColor(getMagnitudeColor(parseFloat(magnitude)))
          .setThumbnail(`https://earthquake.usgs.gov/images/globes/${Math.round(latitude)}${Math.round(longitude)}/en-US.jpg`)
          .addFields(
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
          )
          .setFooter({
            text: 'Data source: USGS Earthquake Hazards Program',
            iconURL: 'https://earthquake.usgs.gov/theme/images/logo.png'
          })
          .setTimestamp(new Date(earthquake.properties.time));
      });
      
      // Create a title message
      let titleMessage = '';
      if (region === 'thailand') {
        titleMessage = `🔍 **Latest ${count} Earthquakes in Thailand Region**`;
      } else if (region === 'sea') {
        titleMessage = `🔍 **Latest ${count} Earthquakes in Southeast Asia**`;
      } else {
        titleMessage = `🔍 **Latest ${count} Global Earthquakes**`;
      }
      
      // Send response
      await interaction.editReply({
        content: titleMessage,
        embeds: embeds
      });
    } catch (error) {
      console.error('Error in /data-latest command:', error);
      await interaction.editReply('Error fetching earthquake data. Please try again later.');
    }
  }
};