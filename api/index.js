// api/index.js
module.exports = async (req, res) => {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    // 1. Extract the short code (e.g., "1n9h8b63...")
    // This handles terabox.com, 1024terabox, teraboxapp, etc.
    const shortCodeMatch = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (!shortCodeMatch) {
        return res.status(400).json({ error: 'Invalid URL format. Could not find short code.' });
    }
    const shortCode = shortCodeMatch[1];
    
    // 2. Construct clean URL (Force HTTPS and main domain)
    const targetUrl = `https://www.terabox.com/s/${shortCode}`;

    // 3. Fetch with GOOGLEBOT Headers
    // This is the key trick to bypass the "Datacenter IP" block.
    const response = await fetch(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://www.google.com/'
        }
    });

    const html = await response.text();

    // 4. Debugging: Check what page we actually got
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const pageTitle = titleMatch ? titleMatch[1] : 'Unknown Page';

    // 5. Extract Data using robust Regex (Handles multi-line JSON)
    const regex = /window\.yunData\s*=\s*(\{[\s\S]*?\});/;
    const match = html.match(regex);

    if (!match) {
        // If we fail here, we know exactly why based on the Title
        console.error("Scrape failed. Page Title:", pageTitle);
        return res.status(503).json({ 
            error: 'Scraping failed', 
            reason: pageTitle.includes('WAF') || pageTitle.includes('check') ? 'IP Blocked by TeraBox' : 'Layout Changed',
            pageTitle: pageTitle 
        });
    }

    const data = JSON.parse(match[1]);

    // 6. Return Clean Data
    res.json({
        success: true,
        ok: true, // Legacy support
        shareid: data.shareid,
        uk: data.uk,
        sign: data.sign,
        timestamp: data.timestamp,
        jsToken: data.jsToken, // Needed for API calls
        shorturl: shortCode,
        list: data.file_list.map(f => ({
            fs_id: f.fs_id,
            filename: f.server_filename,
            size: f.size,
            isDir: f.isdir,
            // Direct download link generation requires client-side fetch,
            // but we pass the keys needed to do it.
            download_keys: {
                uk: data.uk,
                shareid: data.shareid,
                sign: data.sign,
                timestamp: data.timestamp,
                fs_id: f.fs_id
            }
        }))
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
