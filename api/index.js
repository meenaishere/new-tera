// api/index.js
module.exports = async (req, res) => {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    // 1. Extract the short code
    const shortCodeMatch = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (!shortCodeMatch) {
        return res.status(400).json({ error: 'Invalid URL format. Could not find short code.' });
    }
    const shortCode = shortCodeMatch[1];
    
    // 2. Construct clean URL
    const targetUrl = `https://www.terabox.com/s/${shortCode}`;

    // 3. Fetch with GOOGLEBOT Headers to bypass IP blocks
    const response = await fetch(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://www.google.com/'
        }
    });

    const html = await response.text();
    const pageTitleMatch = html.match(/<title>(.*?)<\/title>/);
    const pageTitle = pageTitleMatch ? pageTitleMatch[1] : 'Unknown Page';

    // Check for IP block pages
    if (pageTitle.includes('WAF') || pageTitle.includes('check') || html.includes('challenge-running')) {
        console.error("Scrape failed. Page Title:", pageTitle);
        return res.status(503).json({ 
            error: 'Scraping failed', 
            reason: 'IP Blocked by TeraBox',
            pageTitle: pageTitle 
        });
    }

    // 4. NEW SCRAPING LOGIC: Extract data from __NEXT_DATA__ script tag
    const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
    const nextDataMatch = html.match(nextDataRegex);

    if (!nextDataMatch || !nextDataMatch[1]) {
        console.error("Scrape failed. Page Title:", pageTitle);
        return res.status(503).json({ 
            error: 'Scraping failed', 
            reason: 'Layout Changed: __NEXT_DATA__ script not found.',
            pageTitle: pageTitle 
        });
    }
    
    const data = JSON.parse(nextDataMatch[1]);
    const initialData = data?.props?.pageProps?.initialData;

    if (!initialData || !initialData.file_list) {
         return res.status(503).json({ 
            error: 'Scraping failed', 
            reason: 'Layout Changed: file_list not found in __NEXT_DATA__.',
            pageTitle: pageTitle 
        });
    }
    
    // 5. Return Clean Data from the new structure
    res.json({
        success: true,
        ok: true, // Legacy support
        shareid: initialData.shareid,
        uk: initialData.uk,
        sign: initialData.sign,
        timestamp: initialData.timestamp,
        jsToken: initialData.jsToken,
        shorturl: shortCode,
        list: initialData.file_list.map(f => ({
            fs_id: f.fs_id,
            filename: f.server_filename,
            size: f.size,
            isDir: f.isdir,
            download_keys: {
                uk: initialData.uk,
                shareid: initialData.shareid,
                sign: initialData.sign,
                timestamp: initialData.timestamp,
                fs_id: f.fs_id
            }
        }))
    });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: error.message });
  }
};
