import express from 'express';
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Earthquake Bot is running!');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`Server is ready on port ${port}!`);
});

export function keepAlive() {
  // This function is called from index.js
  console.log('Keep-alive server started');
}