# Earthquake Bot for Discord

A Discord bot that monitors earthquake data from the USGS (United States Geological Survey) and sends real-time alerts to designated Discord channels.

## Features

- Real-time earthquake monitoring from USGS data feed
- Customizable regional focus (Global, Thailand, Southeast Asia, Asia)
- Magnitude filtering based on region
- Rich embed messages with color-coding based on earthquake severity
- Auto-creation of notification channels
- Distance calculation from Bangkok for Thailand-focused alerts
- Persistent configuration storage with MongoDB

## User Guide

### Getting Started

1. **Invite the bot to your server**
   - Click on the bot invite link (contact the bot administrator for the invite link)
   - Select the server you want to add the bot to
   - Ensure the bot has the necessary permissions (read/send messages, create/manage channels)

2. **Set up a notification channel**
   - Use the command `/setup channel:[channel_name] region:[region]`
   - Example: `/setup channel:earthquake-alerts region:thailand`
   - The bot will send earthquake alerts to the specified channel
   - If the specified channel doesn't exist, the bot will create it automatically

3. **Choose a region of interest**
   - You can select from 4 different regions to receive alerts:
     - `global`: Worldwide (earthquakes ≥ 4.0 magnitude)
     - `thailand`: Thailand and surrounding areas (within 2,200 km radius, ≥ 3.0 magnitude)
     - `sea`: Southeast Asia (≥ 3.5 magnitude)
     - `asia`: Asian continent (≥ 3.8 magnitude)

### Available Commands

- `/setup channel:[channel_name] region:[region]` - Set up a channel for earthquake alerts
- `/remove` - Disable earthquake alerts for the server
- `/data-latest` - Display the latest earthquake data from USGS

### Earthquake Notifications

The bot sends real-time notifications when earthquakes match your configured criteria:

- Earthquake details are displayed in embeds with colors varying by severity
- Information includes: location, time, magnitude, depth, coordinates
- For Thailand region, distance from Bangkok is also displayed
- Large earthquakes (≥ 5.0 magnitude) trigger @everyone mentions

### Private Chat Usage

This bot is designed for Discord servers only and does not support private chat interactions.

## Developer Guide

### Prerequisites

- Node.js version 18 or higher
- MongoDB (for storing channel settings)
- Discord Bot Token

### Environment Setup

1. Clone or download the project
   ```bash
   git clone https://github.com/yourusername/earthquake-bot-discord.git
   cd earthquake-bot-discord
   ```

2. Install Dependencies 
   ```bash
   pnpm install
   ```
   (or `npm install` if not using pnpm)

3. Create `.env` file based on `.env.example`
   ```bash
   cp .env.example .env
   ```
   Then edit the `.env` file to add your credentials:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   MONGODB_URI=your_mongodb_connection_string
   PORT=3000
   ```

### Project Structure

- `index.js` - Main bot file
- `db.js` - MongoDB connection and functions
- `keep_alive.js` - Express server to prevent the bot from sleeping on Render
- `commands/` - Folder containing bot commands (setup.js, remove.js, data-latest.js)
- `render.yaml` - Configuration file for deployment on Render

### Development

1. **Starting the bot in development mode**
   ```bash
   pnpm start
   ```
   (or `npm start` if not using pnpm)

2. **Adding new commands**
   - Create a new file in the `commands/` folder
   - Use the same structure as existing commands (data, execute)
   - The bot will automatically load new commands when restarted

3. **Customizing earthquake detection**
   - Modify values in the `REGIONS` object to adjust alert thresholds
   - Update the `getMagnitudeColor()` function to change alert colors
   - Edit the `checkEarthquakes()` function to adjust detection and notification logic

### Deployment on Render

1. **Preparation**
   - Ensure you have a `render.yaml` file in your project
   - Include `keep_alive.js` to prevent the bot from sleeping

2. **Deployment Steps**
   - Create an account on [Render](https://render.com)
   - Connect with your GitHub repository
   - Create a new Web Service by selecting "Blueprint"
   - Select your bot repository
   - Render will detect the `render.yaml` and set up automatically

3. **Configure Environment Variables on Render**
   - DISCORD_TOKEN: Discord Bot Token
   - MONGODB_URI: MongoDB Connection String
   - CHANNEL_ID: (Optional, used for setting a default channel)
   - WEBHOOK_URL: (Optional, used for Discord Webhook)

4. **Keeping the bot always on**
   - The bot has a built-in keep-alive system that prevents Render from stopping the server
   - It sends a ping every 14 minutes to keep the bot running
   - If MongoDB connection has issues, the bot will try to reconnect automatically

### Troubleshooting

#### Common Issues

1. **Bot not responding to commands**
   - Make sure your `DISCORD_TOKEN` is correct
   - Check logs for errors
   - Verify the bot has necessary permissions in the server

2. **Not receiving earthquake alerts**
   - Verify you have set up a channel using the `/setup` command
   - Check if there have been earthquakes that match your configured criteria
   - Check MongoDB connection

3. **MongoDB connection issues**
   - Verify your `MONGODB_URI` is correct
   - Check if your deployment IP is whitelisted in MongoDB Atlas

#### Viewing Error Logs

- **On Render**: Go to the Render dashboard and check "Logs" of your server
- **Local development**: Check console output

## API References

1. **Discord.js API**: 
   - [Discord.js Documentation](https://discord.js.org/)
   - Used for interacting with the Discord API

2. **USGS Earthquake API**: 
   - [USGS API Documentation](https://earthquake.usgs.gov/fdsnws/event/1/)
   - Used for fetching real-time earthquake data
   - Endpoint used: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`

3. **MongoDB API**:
   - [MongoDB Node.js Driver](https://mongodb.github.io/node-mongodb-native/)
   - Used for storing notification channel settings

---

Developed by [Ugrit Chaichana]  
For more information or to report issues, please contact ugritchaichana13@gmail.com, Discord : leidenb_ 
