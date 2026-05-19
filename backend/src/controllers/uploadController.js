const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const uploaded = req.files.map((file) => ({
      originalName: file.originalname,
      filename: file.filename,           
      mimetype: file.mimetype,
      size: file.size,
      url: file.path,                    
    }));

    res.json({ success: true, data: uploaded });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { uploadFiles };