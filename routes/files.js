// routes/files.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const prisma = new PrismaClient();
const uploadPath = path.resolve(process.env.UPLOAD_PATH || './uploads');

// STORY 2 - Upload file with permission control
router.post('/upload', async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded' });
    }

    const file = req.files.file;
    const { folderId, permission } = req.body;
    const userId = req.user.userId;

    // Validate permission
    const validPermissions = ['private', 'friends', 'public'];
    const filePermission = validPermissions.includes(permission) ? permission : 'private';

    // Check if folder belongs to user (if specified)
    if (folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
      });

      if (!folder || folder.userId !== userId) {
        return res.status(403).json({ error: 'Folder not found or access denied' });
      }
    }

    // Create unique filename
    const fileExtension = path.extname(file.name);
    const filename = `${uuidv4()}${fileExtension}`;
    const filepath = path.join(uploadPath, filename);

    // Move file to uploads directory
    await file.mv(filepath);

    // Save file metadata to database
    const savedFile = await prisma.file.create({
      data: {
        userId,
        folderId: folderId || null,
        filename,
        originalName: file.name,
        mimeType: file.mimetype,
        size: BigInt(file.size),
        path: filepath,
        permission: filePermission,
      },
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: savedFile.id,
        originalName: savedFile.originalName,
        size: savedFile.size.toString(),
        permission: savedFile.permission,
        uploadedAt: savedFile.uploadedAt,
      },
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// STORY 2 - Get user's files
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { folderId } = req.query;

    const files = await prisma.file.findMany({
      where: {
        userId,
        ...(folderId ? { folderId } : { folderId: null }),
      },
      select: {
        id: true,
        originalName: true,
        size: true,
        mimeType: true,
        permission: true,
        uploadedAt: true,
        folderId: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      files: files.map(f => ({
        ...f,
        size: f.size.toString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// STORY 2 - Download file with permission check (MUST BE BEFORE /:fileId route)
router.get('/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        user: true,
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check permissions
    const hasAccess = await checkFileAccess(file, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have correct permissions to access this file.' });
    }

    // Check if file exists
    if (!fs.existsSync(file.path)) {
      console.error('File not found at path:', file.path);
      return res.status(404).json({ error: 'File not found on server. Storage location: ' + file.path });
    }

    // Verify file is readable
    try {
      fs.accessSync(file.path, fs.constants.R_OK);
    } catch (err) {
      console.error('File not readable:', file.path, err);
      return res.status(403).json({ error: 'File cannot be read from storage' });
    }

    // Download file with proper headers
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', file.size.toString());

    // Use sendFile instead of download for better compatibility
    res.sendFile(file.path, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download file' });
        }
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed: ' + error.message });
  }
});

// STORY 2 - View file details with permission check
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check permissions
    const hasAccess = await checkFileAccess(file, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have correct permissions to access this file.' });
    }

    res.json({
      id: file.id,
      originalName: file.originalName,
      size: file.size.toString(),
      mimeType: file.mimeType,
      permission: file.permission,
      owner: file.user,
      uploadedAt: file.uploadedAt,
    });
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// STORY 2 - Update file permission
router.patch('/:fileId/permission', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { permission } = req.body;
    const userId = req.user.userId;

    // Validate permission
    const validPermissions = ['private', 'friends', 'public'];
    if (!validPermissions.includes(permission)) {
      return res.status(400).json({ error: 'Invalid permission' });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check ownership
    if (file.userId !== userId) {
      return res.status(403).json({ error: 'You can only modify your own files' });
    }

    // Update permission
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: { permission },
    });

    res.json({
      message: 'File permission updated',
      permission: updatedFile.permission,
    });
  } catch (error) {
    console.error('Error updating file permission:', error);
    res.status(500).json({ error: 'Failed to update file permission' });
  }
});

// STORY 2 - Delete file
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check ownership
    if (file.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own files' });
    }

    // Delete physical file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // Delete from database
    await prisma.file.delete({
      where: { id: fileId },
    });

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Helper function to check file access permissions
async function checkFileAccess(file, userId) {
  // Owner always has access
  if (file.userId === userId) {
    return true;
  }

  // Check permission level
  if (file.permission === 'public') {
    return true;
  }

  if (file.permission === 'friends') {
    // Check if user is a friend
    const friendship = await prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: file.userId,
          friendId: userId,
        },
      },
    });

    if (friendship && friendship.status === 'accepted') {
      return true;
    }

    // Check reverse friendship
    const reverseFriendship = await prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId: file.userId,
        },
      },
    });

    if (reverseFriendship && reverseFriendship.status === 'accepted') {
      return true;
    }
  }

  // Check explicit share
  if (file.permission === 'private') {
    const share = await prisma.fileShare.findUnique({
      where: {
        fileId_userId: {
          fileId: file.id,
          userId,
        },
      },
    });

    return !!share;
  }

  return false;
}

module.exports = router;
