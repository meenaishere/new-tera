// Debug endpoint - api/test.js
module.exports = async (req, res) => {
  const url = req.query.url;
  
  if (!url) {
    return res.json({ 
      status: '✅ API is working!',
      timestamp: new Date().toISOString(),
      usage: 'Add ?url=TERABOX_URL to debug'
    });
  }

  try {
    const match = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    const shorturl = match[1];

    const cookieString = 'csrfToken=2fzTRpNb-HTGQgrg8iZYpt8F; browserid=6t2WAvN8Xo6f5aZEYD9XH5OajsohgdT9GaluTpOr5ZqwUQJIcwuSZ6Hpmqk=; lang=en; ndus=Y-Q-Sg3teHuiJs2mPAKP11cWWr_mWKJkOtPCFB8T; ndut_fmt=62D4B176711A137FD0FF867DF418E730576C1265986EEE56EEECEFF7AAD2E65A';

    // Get file info
    const infoRes = await fetch(
      `https://www.terabox.com/api/shorturlinfo?shorturl=${shorturl}&root=1`,
      {
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    const info = await infoRes.json();

    // Get download link
    const fsId = info.list?.[0]?.fs_id;
    const dlRes = await fetch(
      `https://www.terabox.com/api/download?fid_list=[${fsId}]&shorturl=${shorturl}&sign=&timestamp=${Date.now()}&app_id=250528`,
      {
        headers: {
          'Cookie': cookieString,
          'Referer': `https://www.terabox.com/s/${shorturl}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    const dlData = await dlRes.json();

    return res.json({
      debug: true,
      shorturl,
      fileInfo: info,
      downloadResponse: dlData
    });
  } catch (err) {
    return res.json({ error: err.message });
  }
};
