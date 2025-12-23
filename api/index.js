// api/index.js - Vercel Serverless Function

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = req.method === 'GET' ? req.query.url : req.body.url;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Extract shorturl from the TeraBox link
    const shorturl = extractShortUrl(url);
    if (!shorturl) {
      return res.status(400).json({ error: 'Invalid TeraBox URL' });
    }

    // Get file information
    const fileInfo = await getTeraBoxFileInfo(shorturl);
    
    if (!fileInfo || !fileInfo.list || fileInfo.list.length === 0) {
      return res.status(404).json({ error: 'File not found or invalid link' });
    }

    // Get download links for all files
    const files = await Promise.all(
      fileInfo.list.map(async (file) => {
        const downloadLink = await getDownloadLink(file.fs_id, shorturl);
        return {
          filename: file.server_filename,
          size: file.size,
          sizeFormatted: formatBytes(file.size),
          thumbnail: file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1,
          isVideo: isVideoFile(file.server_filename),
          downloadLink: downloadLink,
          streamLink: downloadLink, // Can be used for streaming
          md5: file.md5
        };
      })
    );

    return res.status(200).json({
      success: true,
      shorturl: shorturl,
      files: files
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

function extractShortUrl(url) {
  // Extract shorturl from various TeraBox URL formats
  const patterns = [
    /terabox\.com\/s\/([a-zA-Z0-9_-]+)/,
    /1024terabox\.com\/s\/([a-zA-Z0-9_-]+)/,
    /teraboxapp\.com\/s\/([a-zA-Z0-9_-]+)/,
    /terasharelink\.com\/s\/([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

async function getTeraBoxFileInfo(shorturl) {
  const apiUrl = `https://www.terabox.com/api/shorturlinfo?shorturl=${shorturl}&root=1`;
  
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.terabox.com/'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file info: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.errno !== 0) {
    throw new Error(`TeraBox API error: ${data.errno}`);
  }

  return data;
}

async function getDownloadLink(fsId, shorturl) {
  const apiUrl = `https://www.terabox.com/api/download?fid_list=[${fsId}]&shorturl=${shorturl}&sign=&timestamp=&app_id=250528`;
  
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.terabox.com/'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch download link: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.errno !== 0 || !data.list || data.list.length === 0) {
    throw new Error('Failed to get download link');
  }

  return data.list[0].dlink;
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function isVideoFile(filename) {
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
  return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}
