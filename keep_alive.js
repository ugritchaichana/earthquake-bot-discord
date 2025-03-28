const express = require('express');
const server = express();

server.all('/', (req, res) => {
  res.send('Earthquake Bot is running!');
});

function keepAlive() {
  server.listen(3000, () => {
    console.log("Server is ready on port 3000!");
  });
}

module.exports = keepAlive;