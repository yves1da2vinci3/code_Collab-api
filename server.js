const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config()
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.log('Error connecting to MongoDB:', error.message));

const codeVersionSchema = new mongoose.Schema({
  sessionId: String,
  code: String,
  version: Number,
}, { timestamps: true });

const CodeVersion = mongoose.model('CodeVersion', codeVersionSchema);

const sessions = new Map(); // to store the active sessions

app.use(express.static('./dist'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.post('/save', async (req, res) => {
  const { code } = req.body;
  const { sessionId } = req.query;
  const version = await CodeVersion.countDocuments({ sessionId });
  const codeVersion = new CodeVersion({ sessionId, code, version });
  await codeVersion.save();
  res.json({ status: 'success' });
});

app.get('/load/:id', async (req, res) => {
  const { id } = req.params;
  const codeVersion = await CodeVersion.findById(id);
  if (codeVersion) {
    res.json({ status: 'success', code: codeVersion.code });
  } else {
    res.json({ status: 'error', message: 'Code version not found' });
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join_session', async (sessionId) => {
    console.log(`User ${socket.id} joined session ${sessionId}`);
    socket.join(sessionId);
    if (!sessions.has(sessionId)) {
      const latestVersion = await CodeVersion.findOne({ sessionId }, {}, { sort: { 'createdAt': -1 } });
      const code = latestVersion ? latestVersion.code : '';
      sessions.set(sessionId, { code });
    }
    const { code } = sessions.get(sessionId);
    socket.emit('code_updated', { code });
  });

  socket.on('code_updated', async ({ code, sessionId }) => {
    console.log(`User ${socket.id} updated code in session ${sessionId}`);
    const version = await CodeVersion.countDocuments({ sessionId });
    const codeVersion = new CodeVersion({ sessionId, code, version });
    await codeVersion.save();
    sessions.set(sessionId, { code });
    socket.to(sessionId).emit('code_updated', { code });
  });

  socket.on('chat_message', ({ message, sessionId }) => {
    console.log(`User ${socket.id} sent message "${message}" in session ${sessionId}`);
    const sender = socket.id.slice(0, 6); // use the first 6 characters of the socket ID as the sender name
    socket.to(sessionId).emit('chat_message', { sender, message });
  });

  socket.on('leave_session', (sessionId) => {
    console.log(`User ${socket.id} left session ${sessionId}`);
    socket.leave(sessionId);
    if (sessions.has(sessionId) && Object.keys(io.sockets.adapter.rooms[sessionId] || {}).length === 0) {
      sessions.delete(sessionId);
      console.log(`Session ${sessionId} has no more users and was deleted`);
    }
  });
  socket.on('create_session', () => {
    // Generate a unique session ID
    const sessionId = Date.now().toString();

    // Create a new session and add it to the sessions map
    const session = {
      socketId: socket.id,
      code: ''
    };
    sessions.set(sessionId, session);

    // Send the session ID back to the client
    socket.emit('session_created', { sessionId });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    for (const [sessionId, session] of sessions) {
    if (session.socketId === socket.id) {
    console.log(User `${socket.id} disconnected from session ${sessionId}`);
    session.socketId = null;
    socket.to(sessionId).emit('user_disconnected', { userId: socket.id });
    }
    }
    });
    });
    
    http.listen(3000, () => {
    console.log('Server listening on port 3000');
    });
