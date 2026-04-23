// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const folderRoutes = require('./routes/folders');
const friendRoutes = require('./routes/friends');
const profileRoutes = require('./routes/profile');

// Middleware
const { authenticateToken } = require('./middleware/auth');

const app = express();
const httpServer = createServer(app);

//CORS CONFIG (Unified)

const allowedOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: allowedOrigin,
  credentials: allowedOrigin !== '*',
}));

//SOCKET.IO SETUP

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: allowedOrigin !== '*',
  },
});

//UPLOADS DIRECTORY

const uploadPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

//MIDDLEWARE

app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 },
  createParentPath: true,
  abortOnLimit: true,
}));

app.use('/uploads', express.static(uploadPath));

//API ROUTES

app.use('/api/auth', authRoutes);
app.use('/api/files', authenticateToken, fileRoutes);
app.use('/api/folders', authenticateToken, folderRoutes);
app.use('/api/friends', authenticateToken, friendRoutes);
app.use('/api/profile', authenticateToken, profileRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

//SOCKET AUTH (JWT)

const channelUsers = {};      // channel -> Map(socketId -> user)
const messageHistory = {};   // channel -> last 50 messages

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

//SOCKET EVENTS

io.on('connection', (socket) => {
  console.log('Authenticated client connected:', socket.id, 'userId:', socket.userId);

  socket.on('set_user_info', (info) => {
    socket.userName = info?.name || 'User';
  });

  socket.on('join_channel', (channel) => {
    // Leave all previous channels
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });

    socket.join(channel);
    socket.currentChannel = channel;

    // Send history
    socket.emit('channel_history', {
      channel,
      messages: messageHistory[channel] || [],
    });

    // Track users
    if (!channelUsers[channel]) channelUsers[channel] = new Map();
    channelUsers[channel].set(socket.id, {
      id: socket.userId,
      name: socket.userName || 'User',
    });

    io.to(channel).emit(
      'online_users',
      Array.from(channelUsers[channel].values())
    );
  });

  socket.on('send_message', (data) => {
    const channel = data.channel;
    if (!channel) return;

    const message = {
      ...data,
      userId: socket.userId,
      id: `${socket.userId}_${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    if (!messageHistory[channel]) messageHistory[channel] = [];
    messageHistory[channel].push(message);
    if (messageHistory[channel].length > 50) {
      messageHistory[channel] = messageHistory[channel].slice(-50);
    }

    io.to(channel).emit('receive_message', message);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const channel = socket.currentChannel;
    if (channel && channelUsers[channel]) {
      channelUsers[channel].delete(socket.id);
      io.to(channel).emit(
        'online_users',
        Array.from(channelUsers[channel].values())
      );
    }
  });
});

//ERROR HANDLING

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

//START SERVER

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Qnect server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`CORS origin: ${allowedOrigin}`);
});

module.exports = { app, httpServer, io };