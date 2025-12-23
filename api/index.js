// api/index.js
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  let url = req.query.url || req.body?.url;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    // 1. FIX: Normalize URL to terabox.com
    // 1024terabox links often fail scraping tools.
    url = url.replace(/(1024terabox|teraboxapp|terabox)\.com/, 'terabox.com');

    // 2. Extract the Short Code (needed for fallback)
    const shortCodeMatch = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    const shortCode = shortCodeMatch ? shortCodeMatch[1] : null;

    console.log(`Fetching: ${url}`);

    // 3. Fetch HTML WITHOUT Cookies first
    // Sending 'ndus' cookies from a Vercel IP often triggers a "Security Verification" page.
    const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
    });

    // Check if we got a valid response
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const html = await response.text();

    // Debug: Check if we got the Captcha page
    if (html.includes('security-check') || html.includes('spam-protection')) {
        return res.status(403).json({ error: 'TeraBox blocked Vercel IP (Captcha triggered). Try using a residential proxy.' });
    }

    // 4. Regex: Try standard yunData
    let match = html.match(/window\.yunData\s*=\s*({.+?});/);
    
    // 4b. Regex: Fallback (Sometimes data is in 'init' function)
    if (!match) {
        match = html.match(/yunData\.setData\(({.+?})\);/);
    }

    if (!match) {
        console.log("HTML Preview:", html.substring(0, 500)); // Log for debugging
        return res.status(500).json({ error: 'Could not extract data. TeraBox layout changed or IP blocked.' });
    }

    const data = JSON.parse(match[1]);

    if (!data.file_list || data.file_list.length === 0) {
      return res.status(404).json({ error: 'No files found in this link' });
    }

    // 5. Send Data to Client
    const files = data.file_list.map((file) => ({
        filename: file.server_filename,
        size: file.size,
        sizeFormatted: formatBytes(file.size),
        thumbnail: file.thumbs?.url3 || null,
        fs_id: file.fs_id, // Vital for client-side fetch
        isDir: file.isdir
    }));

    res.json({
      success: true,
      share_data: {
        shorturl: shortCode, 
        uk: data.uk,
        shareid: data.shareid,
        sign: data.sign,
        timestamp: data.timestamp,
        jsToken: data.jsToken 
      },
      files: files
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}
