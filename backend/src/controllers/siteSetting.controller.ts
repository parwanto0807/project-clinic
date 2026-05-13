import { Request, Response } from 'express';
import { SiteSettingService } from '../services/siteSetting.service';

const siteSettingService = new SiteSettingService();

export class SiteSettingController {
  async getSettings(req: Request, res: Response) {
    try {
      const settings = await siteSettingService.getAllSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  }

  async updateSetting(req: Request, res: Response) {
    const { key, value, description } = req.body;
    if (!key || !value) {
      return res.status(400).json({ error: 'Key and Value are required' });
    }

    try {
      const setting = await siteSettingService.updateSetting(key, value, description);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update setting' });
    }
  }

  async uploadDisplayVideo(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    try {
      const key = 'display_videos';
      const setting = await siteSettingService.getSettingByKey(key);
      let videos = Array.isArray(setting?.value) ? setting.value : [];
      
      const videoPath = `/uploads/videos/${req.file.filename}`;
      
      if (videos.length >= 5) {
        return res.status(400).json({ error: 'Maximum 5 videos reached. Delete one before uploading more.' });
      }

      videos.push({
        id: req.file.filename,
        url: videoPath,
        name: req.file.originalname,
        uploadedAt: new Date().toISOString()
      });

      const updated = await siteSettingService.updateSetting(key, videos, 'Videos for waiting room monitor');
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload video' });
    }
  }

  async deleteDisplayVideo(req: Request, res: Response) {
    const { filename } = req.params;
    try {
      const key = 'display_videos';
      const setting = await siteSettingService.getSettingByKey(key);
      let videos = Array.isArray(setting?.value) ? setting.value : [];
      
      const updatedVideos = videos.filter((v: any) => v.id !== filename);
      
      // Physically delete the file
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'public/uploads/videos', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      const updated = await siteSettingService.updateSetting(key, updatedVideos, 'Videos for waiting room monitor');
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete video' });
    }
  }

  async uploadWebsiteImage(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    try {
      const fs = require('fs');
      const path = require('path');
      
      const fileName = `website-${Date.now()}${path.extname(req.file.originalname)}`;
      const uploadDir = path.join(process.cwd(), 'public/uploads/website');
      
      // Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const filePath = path.join(uploadDir, fileName);
      
      // Write buffer to file (since multer is using memoryStorage)
      fs.writeFileSync(filePath, req.file.buffer);
      
      const imageUrl = `/uploads/website/${fileName}`;
      res.json({ url: imageUrl });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  }
}
