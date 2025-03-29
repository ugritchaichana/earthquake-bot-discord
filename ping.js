import fetch from 'node-fetch';

const RENDER_URL = process.env.RENDER_URL || 'https://earthquake-bot-discord.onrender.com';
const PING_INTERVAL = 30000; // 30 seconds

async function pingServer() {
  try {
    const response = await fetch(`${RENDER_URL}/health`);
    if (response.ok) {
      console.log('Server is alive!');
    } else {
      console.log('Server health check failed');
    }
  } catch (error) {
    console.error('Error pinging server:', error);
  }
}

// Start pinging immediately
pingServer();

// Set up interval for regular pings
setInterval(pingServer, PING_INTERVAL); 