// routes/profile.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Get current user's profile
router.get('/me', async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        bio: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get public user profile
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        bio: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.patch('/me', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, bio, avatar } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(bio && { bio }),
        ...(avatar && { avatar }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        bio: true,
        avatar: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user's file stats
router.get('/me/stats', async (req, res) => {
  try {
    const userId = req.user.userId;

    const [fileCount, totalSize, folderCount] = await Promise.all([
      prisma.file.count({ where: { userId } }),
      prisma.file.aggregate({
        where: { userId },
        _sum: { size: true },
      }),
      prisma.folder.count({ where: { userId } }),
    ]);

    res.json({
      stats: {
        totalFiles: fileCount,
        totalSize: totalSize._sum.size?.toString() || '0',
        totalFolders: folderCount,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
// Search users
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
      },
      take: 20
    });

    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user profile with friend status
router.get('/:userId/with-status', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        bio: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: {
            files: true,
            folders: true,
            friendships: true,
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already friends or pending request
    let friendStatus = 'none';
    if (currentUserId && currentUserId !== userId) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userId: currentUserId, friendId: userId },
            { userId: userId, friendId: currentUserId }
          ]
        }
      });

      if (friendship) {
        friendStatus = friendship.status;
      }
    }

    res.json({
      user: {
        ...user,
        stats: {
          files: user._count.files,
          folders: user._count.folders,
          friends: user._count.friendships,
        }
      },
      friendStatus
    });
  } catch (error) {
    console.error('Error fetching profile with status:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;


