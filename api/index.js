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

    // 3. Fetch with GOOGLEBOT Headers
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

    // --- HYBRID SCRAPING LOGIC ---
    let fileList = null;
    let shareData = {};

    // 1. Try the __NEXT_DATA__ method (modern layout)
    const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
    const nextDataMatch = html.match(nextDataRegex);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        const initialData = data?.props?.pageProps?.initialData;
        if (initialData && initialData.file_list) {
          console.log("Successfully parsed using __NEXT_DATA__ method.");
          fileList = initialData.file_list;
          shareData = {
            shareid: initialData.shareid,
            uk: initialData.uk,
            sign: initialData.sign,
            timestamp: initialData.timestamp,
            jsToken: initialData.jsToken,
          };
        }
      } catch (e) {
        console.warn("Could not parse __NEXT_DATA__ json", e.message);
      }
    }

    // 2. If __NEXT_DATA__ fails, fall back to window.yunData (legacy layout)
    if (!fileList) {
      console.log("Fallback: trying window.yunData method.");
      const yunDataRegex = /window\.yunData\s*=\s*(\{[\s\S]*?\});/;
      const yunDataMatch = html.match(yunDataRegex);
      if (yunDataMatch && yunDataMatch[1]) {
        try {
          const data = JSON.parse(yunDataMatch[1]);
          if (data && data.file_list) {
            console.log("Successfully parsed using window.yunData method.");
            fileList = data.file_list;
            shareData = {
              shareid: data.shareid,
              uk: data.uk,
              sign: data.sign,
              timestamp: data.timestamp,
              jsToken: data.jsToken,
            };
          }
        } catch (e) {
          console.warn("Could not parse window.yunData json", e.message);
        }
      }
    }

    // 3. If both methods fail, return an error
    if (!fileList) {
      console.error("Scrape failed. Page Title:", pageTitle);
      return res.status(503).json({
        error: 'Scraping failed',
        reason: 'Layout Changed: Could not find file data using any method.',
        pageTitle: pageTitle
      });
    }

    // 4. Return Clean Data
    res.json({
      success: true,
      ok: true, // Legacy support
      ...shareData,
      shorturl: shortCode,
      list: fileList.map(f => ({
        fs_id: f.fs_id,
        filename: f.server_filename,
        size: f.size,
        isDir: f.isdir,
        download_keys: {
          uk: shareData.uk,
          shareid: shareData.shareid,
          sign: shareData.sign,
          timestamp: shareData.timestamp,
          fs_id: f.fs_id
        }
      }))
    });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: error.message });
  }
};
