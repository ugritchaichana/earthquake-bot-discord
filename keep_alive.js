import express from 'express';
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Earthquake Bot is running!');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/ping', (req, res) => {
  res.status(200).send('PONG');
});

app.listen(port, () => {
  console.log(`Server is ready on port ${port}!`);
});

export function keepAlive() {
  // Set up interval to ping the server every 14 minutes
  setInterval(async () => {
    try {
      const response = await fetch('http://localhost:3000/ping');
      if (response.ok) {
        console.log('Keep-alive ping successful');
      }
    } catch (error) {
      console.error('Keep-alive ping failed:', error);
    }
  }, 14 * 60 * 1000); // 14 minutes

  console.log('Keep-alive server started');
}