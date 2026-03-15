// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const folderRoutes = require('./routes/folders');
const friendRoutes = require('./routes/friends');
const profileRoutes = require('./routes/profile');

// Middleware
const { authenticateToken } = require('./middleware/auth');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Create uploads directory if it doesn't exist
const uploadPath = path.resolve(process.env.UPLOAD_PATH || './uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 },
  createParentPath: true,
  abortOnLimit: true,
}));

// Serve uploaded files
app.use('/uploads', express.static(uploadPath));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', authenticateToken, fileRoutes);
app.use('/api/folders', authenticateToken, folderRoutes);
app.use('/api/friends', authenticateToken, friendRoutes);
app.use('/api/profile', authenticateToken, profileRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Socket.IO events (for real-time features)
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Message events can be added here later
  socket.on('send_message', (data) => {
    io.emit('receive_message', data);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Qnect server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = { app, httpServer, io };
