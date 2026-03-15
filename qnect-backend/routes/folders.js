// routes/folders.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// STORY 6 - Create folder
router.post('/', async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    // If parent folder specified, verify it belongs to user
    if (parentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: parentId },
      });

      if (!parentFolder || parentFolder.userId !== userId) {
        return res.status(403).json({ error: 'Parent folder not found or access denied' });
      }
    }

    // Create folder
    const folder = await prisma.folder.create({
      data: {
        userId,
        name,
        parentId: parentId || null,
      },
    });

    res.status(201).json({
      message: 'Folder created successfully',
      folder: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt,
      },
    });
  } catch (error) {
    console.error('Folder creation error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// STORY 6 - Get all folders for user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { parentId } = req.query;

    const folders = await prisma.folder.findMany({
      where: {
        userId,
        ...(parentId ? { parentId } : { parentId: null }),
      },
      include: {
        children: {
          select: {
            id: true,
            name: true,
          },
        },
        files: {
          select: {
            id: true,
            originalName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ folders });
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// STORY 6 - Get folder with nested structure
router.get('/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user.userId;

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        parent: {
          select: { id: true, name: true },
        },
        children: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
        files: {
          select: {
            id: true,
            originalName: true,
            size: true,
            mimeType: true,
            uploadedAt: true,
          },
        },
      },
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Check ownership
    if (folder.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      folder: {
        ...folder,
        childrenCount: folder.children.length,
        filesCount: folder.files.length,
      },
    });
  } catch (error) {
    console.error('Error fetching folder:', error);
    res.status(500).json({ error: 'Failed to fetch folder' });
  }
});

// STORY 6 - Update folder (rename)
router.patch('/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name } = req.body;
    const userId = req.user.userId;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Check ownership
    if (folder.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: { name },
    });

    res.json({
      message: 'Folder updated successfully',
      folder: {
        id: updatedFolder.id,
        name: updatedFolder.name,
        updatedAt: updatedFolder.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// STORY 6 - Move file to folder
router.post('/:folderId/move-file', async (req, res) => {
  try {
    const { folderId } = req.params;
    const { fileId } = req.body;
    const userId = req.user.userId;

    // Verify folder belongs to user
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder || folder.userId !== userId) {
      return res.status(403).json({ error: 'Folder not found or access denied' });
    }

    // Verify file belongs to user
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.userId !== userId) {
      return res.status(403).json({ error: 'File not found or access denied' });
    }

    // Move file to folder
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: { folderId },
    });

    res.json({
      message: 'File moved successfully',
      file: {
        id: updatedFile.id,
        originalName: updatedFile.originalName,
        folderId: updatedFile.folderId,
      },
    });
  } catch (error) {
    console.error('Error moving file:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// STORY 6 - Move folder into another folder (nested folders)
router.post('/:folderId/move-folder', async (req, res) => {
  try {
    const { folderId } = req.params;
    const { targetParentId } = req.body;
    const userId = req.user.userId;

    // Verify source folder belongs to user
    const sourceFolder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!sourceFolder || sourceFolder.userId !== userId) {
      return res.status(403).json({ error: 'Source folder not found or access denied' });
    }

    // Verify target parent folder belongs to user
    if (targetParentId) {
      const targetFolder = await prisma.folder.findUnique({
        where: { id: targetParentId },
      });

      if (!targetFolder || targetFolder.userId !== userId) {
        return res.status(403).json({ error: 'Target folder not found or access denied' });
      }

      // Prevent moving folder into itself or its children
      if (targetParentId === folderId) {
        return res.status(400).json({ error: 'Cannot move folder into itself' });
      }
    }

    // Move folder
    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: { parentId: targetParentId || null },
    });

    res.json({
      message: 'Folder moved successfully',
      folder: {
        id: updatedFolder.id,
        name: updatedFolder.name,
        parentId: updatedFolder.parentId,
      },
    });
  } catch (error) {
    console.error('Error moving folder:', error);
    res.status(500).json({ error: 'Failed to move folder' });
  }
});

// STORY 6 - Delete folder (with cascade delete)
router.delete('/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user.userId;

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Check ownership
    if (folder.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete folder (cascade will handle files and subfolders)
    await prisma.folder.delete({
      where: { id: folderId },
    });

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

module.exports = router;
