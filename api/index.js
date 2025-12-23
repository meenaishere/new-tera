// TeraBox API - api/index.js
module.exports = async (req, res) => {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url || req.body?.url;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // 1. Fetch the HTML page content (More reliable than /api/shorturlinfo on serverless)
    // We scrape the HTML to get the Auth Keys (sign, timestamp) which are REQUIRED for client-side download.
    const cookieString = buildCookieString();
    
    const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': cookieString
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();

    // 2. Extract window.yunData (Contains all file info + Auth keys)
    const match = html.match(/window\.yunData\s*=\s*({.+?});/);
    
    if (!match) {
        return res.status(500).json({ error: 'Could not extract data from TeraBox. Link might be invalid or password protected.' });
    }

    const data = JSON.parse(match[1]);
    
    // Check if files exist
    if (!data.file_list || data.file_list.length === 0) {
      return res.status(404).json({ error: 'No files found' });
    }

    // 3. Format the response for the Client
    // We do NOT call /api/download here. We send the ingredients to the client.
    const files = data.file_list.map((file) => {
        return {
          filename: file.server_filename,
          size: file.size,
          sizeFormatted: formatBytes(file.size),
          // Thumbs are usually safe to fetch directly
          thumbnail: file.thumbs?.url3 || file.thumbs?.url2 || null,
          fs_id: file.fs_id, // CRITICAL: Client needs this
          category: file.category,
          isDir: file.isdir
        };
    });

    // 4. Send keys + File list to Client
    res.json({
      success: true,
      share_data: {
        shorturl: url.split('/').pop(), // extract shorturl code
        uk: data.uk,
        shareid: data.shareid,
        sign: data.sign,
        timestamp: data.timestamp,
        jsToken: data.jsToken // Often required for the download API
      },
      totalFiles: files.length,
      files: files
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
};

function buildCookieString() {
  const cookies = {
    'csrfToken': '2fzTRpNb-HTGQgrg8iZYpt8F',
    'browserid': '6t2WAvN8Xo6f5aZEYD9XH5OajsohgdT9GaluTpOr5ZqwUQJIcwuSZ6Hpmqk=',
    'lang': 'en',
    'ndus': 'Y-Q-Sg3teHuiJs2mPAKP11cWWr_mWKJkOtPCFB8T',
    // 'ndut_fmt': '...' // Add if necessary
  };
  
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}
