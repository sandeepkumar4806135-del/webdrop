// Import the libraries we need
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// 1. Create the Express app, enable CORS, and build an HTTP server from it
const app = express();
app.use(cors()); // allow requests from other origins (our frontend)
const server = http.createServer(app);

// 2. Attach Socket.io to the HTTP server. CORS is read from an environment
//    variable so we can lock it down to our real frontend once deployed.
//    If ALLOWED_ORIGIN isn't set, we allow all origins (fine for local dev).
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const io = new Server(server, {
  cors: { origin: allowedOrigin }, // restrict connections to OUR frontend domain
});

// 3. In-memory object that stores active 4-digit pairing codes.
//    Each code maps to the creator's socket id, e.g. rooms['3841'] = 'socketId123'
const rooms = {};

// 4. When a client asks to create a new room
io.on('connection', (socket) => {
  // Generate a random 4-digit code as a string, e.g. "3841"
  socket.on('create-room', () => {
    const code = String(Math.floor(1000 + Math.random() * 9000)); // always 4 digits

    // Save this socket under the generated code
    rooms[code] = socket.id;

    // Send the code back to the socket that requested it
    socket.emit('room-created', code);
  });

  // 5. When a client tries to join a room with a 4-digit code
  socket.on('join-room', (code) => {
    if (rooms[code]) {
      // The creator of this room is the socket id stored under the code
      const creatorId = rooms[code];

      // Get the actual Socket.io socket object for the creator
      const creatorSocket = io.sockets.sockets.get(creatorId);

      if (creatorSocket) {
        // Put both the creator and the joiner into a Socket.io room named after the code
        creatorSocket.join(code);
        socket.join(code);

        // Let both peers know they are now connected to each other
        io.to(code).emit('peer-joined');
      }
    } else {
      // The code doesn't exist, notify the joiner
      socket.emit('room-not-found');
    }
  });

  // 6. Relay signaling data between the two peers in a room, unchanged
  socket.on('signal', ({ code, data }) => {
    // Send the data to every other socket in that room (the peer) using a 'signal' event
    socket.to(code).emit('signal', data);
  });

  // 7. When a socket disconnects, clean up the room it created and notify the peer
  socket.on('disconnect', () => {
    // Find the code whose creator is this socket
    for (const code in rooms) {
      if (rooms[code] === socket.id) {
        // Tell the other peer in that room that their peer left
        socket.to(code).emit('peer-left');

        // Remove the room from our in-memory object
        delete rooms[code];
        break; // a socket can only create one room
      }
    }
  });
});

// 8. Simple GET route at "/" for a health/status check
app.get('/', (req, res) => {
  res.send('WebDrop signaling server is running');
});

// 9. Start the server on the given PORT (or 4000 by default)
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`WebDrop signaling server listening on port ${PORT}`);
});
