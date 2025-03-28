# Earthquake Alert Discord Bot

## 🌍 What is this?
A real-time earthquake monitoring and alert system for Discord that focuses on Thailand and Southeast Asia but tracks significant global seismic events. This bot fetches data from USGS (United States Geological Survey) and sends timely, informative alerts to your Discord server.

## 🎯 Purpose
This bot was created to:
- Provide real-time earthquake notifications to Thai communities and those in Southeast Asia
- Help with early awareness of seismic events that may affect Thailand
- Deliver accurate information in an easy-to-understand format
- Support emergency awareness during significant seismic events

## ⚙️ Technical Overview
### Built With
- **Node.js** - Server-side JavaScript runtime
- **Discord.js** - Library for interacting with Discord API
- **USGS Earthquake API** - Real-time earthquake data source

### Features
- **Real-time Monitoring**: Checks for new earthquakes every 30 seconds
- **Smart Filtering**: Focuses on earthquakes relevant to Thailand and Southeast Asia
- **Alert Levels**: Categorizes earthquakes by severity and proximity to Thailand
- **Distance Calculation**: Shows how far earthquakes are from Bangkok
- **Interactive Commands**: Allows users to query recent earthquake data
- **Custom Channel Setup**: Configurable notification channel for each server

## 📋 Commands
- `/setup [channel]` - Configure where to send earthquake alerts
- `/data-latest [count] [region]` - View latest earthquakes with optional filters
  - `count`: Number of earthquakes to display (1-5)
  - `region`: Filter by region (Global, Thailand Region, Southeast Asia)

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v16.9.0 or higher)
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- npm or pnpm package manager

### Step 1: Clone the repository
```bash
git clone https://github.com/yourusername/earthquake-bot-discord.git
cd earthquake-bot-discord
```

### Step 2: Install dependencies
Using npm:
```bash
npm install
```
Or using pnpm:
```bash
pnpm install
```

### Step 3: Set up environment variables
Create a `.env` file in the root directory with:
```
DISCORD_TOKEN=your_discord_bot_token
WEBHOOK_URL=optional_webhook_url
```

### Step 4: Register your bot with Discord
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Add a bot to your application
4. Enable MESSAGE CONTENT INTENT in the Bot section
5. Generate an invite URL with bot and applications.commands scopes
6. Invite the bot to your server

### Step 5: Start the bot
```bash
npm start
```
Or:
```bash
node index.js
```

## 📡 How It Works
1. The bot connects to USGS earthquake data feeds
2. Every 30 seconds, it checks for new earthquakes
3. When a relevant earthquake is detected:
   - It calculates the distance from Bangkok
   - Determines the alert level based on magnitude and proximity
   - Sends a detailed embed message to configured channels
4. For earthquakes near Thailand or of high magnitude, the bot can tag @everyone for immediate attention

## 🔒 Privacy & Data Usage
- This bot only processes publicly available USGS earthquake data
- No user data is collected or stored
- Server configurations (only channel IDs) are stored in a local JSON file

## 🏠 Hosting Options
### Hosting on Replit (Free Forever)
Replit offers a free plan that's perfect for Discord bots:

1. **Create a Replit Account**:
   - Go to [Replit](https://replit.com/) and sign up for a free account

2. **Create a New Repl**:
   - Click "Create Repl"
   - Select "Import from GitHub"
   - Paste your GitHub repository URL or upload your files directly

3. **Set Up Environment Variables**:
   - Click on "Secrets" (lock icon) in the left sidebar
   - Add your environment variables:
     - Key: `DISCORD_TOKEN`, Value: `your_discord_bot_token`
     - Key: `WEBHOOK_URL`, Value: `optional_webhook_url`

4. **Configure for 24/7 Running**:
   - Create a file called `keep_alive.js` in your project with:
   ```javascript
   const express = require('express');
   const server = express();
   
   server.all('/', (req, res) => {
     res.send('Bot is running!');
   });
   
   function keepAlive() {
     server.listen(3000, () => {
       console.log("Server is ready!");
     });
   }
   
   module.exports = keepAlive;
   ```
   - Import it in your `index.js`:
   ```javascript
   const keepAlive = require('./keep_alive');
   keepAlive();
   // Rest of your bot code...
   ```
   
5. **Set Up an Uptime Monitor**:
   - Use a service like [UptimeRobot](https://uptimerobot.com/) (free)
   - Create a new monitor and point it to your Repl URL (e.g., `https://your-repl-name.yourusername.repl.co`)
   - Set it to ping every 5 minutes to keep your bot online

6. **Run Your Bot**:
   - Click "Run" and your bot should start
   - The console will show if your bot connected successfully

### Other Free Hosting Options
- **Railway**: Offers 5 USD credit per month (free tier)
- **Render**: Free tier for web services with some limitations
- **Oracle Cloud Free Tier**: Provides free VM instances that never expire
- **Fly.io**: Has a generous free tier suitable for small applications

## 📜 License
This project is open source and available under the MIT License.

## 👥 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check issues page.

## 🙏 Acknowledgements
- [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/) for providing open access to earthquake data
- [Discord.js](https://discord.js.org/) for their excellent API wrapper

---

*Note: This bot is intended for informational purposes only. In case of an actual earthquake emergency, please follow official government guidance and emergency protocols.*