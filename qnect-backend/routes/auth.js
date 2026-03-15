// routes/auth.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { hashPassword, comparePasswords, generateToken, verifyToken } = require('../utils/authUtils');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// STORY 4 - User registration
router.post('/signup', async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // Validation
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    // Create session with 2 week expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const token = generateToken(user.id);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    res.status(201).json({
      message: 'User created successfully',
      user: { id: user.id, email: user.email, name: user.name },
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// STORY 4 - User login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Log failed attempt
      await prisma.loginAttempt.create({
        data: {
          userId: email, // Store email as reference
          ipAddress,
          success: false,
        },
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await comparePasswords(password, user.password);

    if (!isPasswordValid) {
      // Log failed attempt
      await prisma.loginAttempt.create({
        data: {
          userId: user.id,
          ipAddress,
          success: false,
        },
      });

      // Check for suspicious activity (more than 5 failed attempts in 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const failedAttempts = await prisma.loginAttempt.count({
        where: {
          userId: user.id,
          success: false,
          createdAt: { gte: fifteenMinutesAgo },
        },
      });

      if (failedAttempts > 5) {
        return res.status(429).json({
          error: 'Too many failed login attempts. Account temporarily locked. Check your email for security alerts.',
        });
      }

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Log successful attempt
    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        ipAddress,
        success: true,
      },
    });

    // Create session with 2 week expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const token = generateToken(user.id);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, name: user.name },
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// STORY 4 - Check if session is still valid and refresh if needed
router.post('/verify-session', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find active session
    const session = await prisma.session.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() }, // Not expired
      },
    });

    if (!session) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // If session expires in less than 3 days, refresh it
    const threeQuarters = new Date();
    threeQuarters.setDate(threeQuarters.getDate() + 10.5); // 3/4 of 14 days

    if (session.expiresAt < threeQuarters) {
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 14);

      const newToken = generateToken(userId);

      await prisma.session.update({
        where: { id: session.id },
        data: { token: newToken, expiresAt: newExpiresAt },
      });

      return res.json({
        message: 'Session refreshed',
        token: newToken,
        expiresAt: newExpiresAt,
      });
    }

    res.json({
      message: 'Session valid',
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Session verification failed' });
  }
});

// STORY 4 - Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Delete all sessions for this user
    await prisma.session.deleteMany({
      where: { userId },
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
