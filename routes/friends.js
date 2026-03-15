// routes/friends.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Send friend request
router.post('/request/:userId', async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user.userId;

    if (userId === targetUserId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if friendship already exists
    const existingFriendship = await prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId: targetUserId,
        },
      },
    });

    if (existingFriendship) {
      return res.status(400).json({ error: 'Friendship request already exists' });
    }

    // Create friendship request
    const friendship = await prisma.friendship.create({
      data: {
        userId,
        friendId: targetUserId,
        status: 'pending',
      },
    });

    res.status(201).json({
      message: 'Friend request sent',
      friendship: {
        id: friendship.id,
        status: friendship.status,
      },
    });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
router.post('/:friendshipId/accept', async (req, res) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user.userId;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship request not found' });
    }

    // Verify user is the recipient
    if (friendship.friendId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedFriendship = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'accepted' },
    });

    res.json({
      message: 'Friend request accepted',
      friendship: {
        id: updatedFriendship.id,
        status: updatedFriendship.status,
      },
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Decline friend request
router.post('/:friendshipId/decline', async (req, res) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user.userId;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship request not found' });
    }

    // Verify user is the recipient
    if (friendship.friendId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    res.json({ message: 'Friend request declined' });
  } catch (error) {
    console.error('Error declining friend request:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// Get user's friends
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get friends where user initiated the request
    const friendsInitiated = await prisma.friendship.findMany({
      where: {
        userId,
        status: 'accepted',
      },
      include: {
        friend: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    // Get friends where user received the request
    const friendsReceived = await prisma.friendship.findMany({
      where: {
        friendId: userId,
        status: 'accepted',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    // Combine and deduplicate
    const allFriends = [
      ...friendsInitiated.map(f => ({ ...f.friend, friendshipId: f.id })),
      ...friendsReceived.map(f => ({ ...f.user, friendshipId: f.id })),
    ];

    res.json({ friends: allFriends });
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Get pending friend requests
router.get('/requests/pending', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get pending requests sent to user
    const pendingRequests = await prisma.friendship.findMany({
      where: {
        friendId: userId,
        status: 'pending',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    res.json({
      requests: pendingRequests.map(r => ({
        friendshipId: r.id,
        from: r.user,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// Remove friend
router.delete('/:friendId', async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user.userId;

    // Find and delete friendship in either direction
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
        status: 'accepted',
      },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    await prisma.friendship.delete({
      where: { id: friendship.id },
    });

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

module.exports = router;
