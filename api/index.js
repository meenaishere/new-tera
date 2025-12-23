// TeraBox API with Cookie Authentication - api/index.js
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.query.url || req.body?.url;

  if (!url) {
    return res.status(400).json({ 
      error: 'URL parameter is required',
      usage: 'GET /api?url=YOUR_TERABOX_URL',
      example: '/api?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q'
    });
  }

  try {
    // Extract shorturl
    const match = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid TeraBox URL format' });
    }
    const shorturl = match[1];

    // Build cookie string from your cookies
    const cookieString = buildCookieString();

    // Get file info
    const infoRes = await fetch(
      `https://www.terabox.com/api/shorturlinfo?shorturl=${shorturl}&root=1`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.terabox.com/',
          'Origin': 'https://www.terabox.com',
          'Cookie': cookieString
        }
      }
    );
    
    const info = await infoRes.json();
    
    if (info.errno !== 0) {
      return res.status(404).json({ 
        error: 'File not found or link expired',
        errno: info.errno 
      });
    }

    if (!info.list || info.list.length === 0) {
      return res.status(404).json({ error: 'No files found in this link' });
    }

    // Get download links for all files
    const files = await Promise.all(
      info.list.map(async (file) => {
        try {
          const timestamp = Date.now();
          
          // Try GET request first
          let dlRes = await fetch(
            `https://www.terabox.com/api/download?fid_list=[${file.fs_id}]&shorturl=${shorturl}&sign=&timestamp=${timestamp}&app_id=250528`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': `https://www.terabox.com/s/${shorturl}`,
                'Origin': 'https://www.terabox.com',
                'Cookie': cookieString
              }
            }
          );
          
          let dlData = await dlRes.json();
          
          // If GET fails, try POST method
          if ((dlData.errno !== 0 && dlData.errno !== undefined) || (!dlData.list || dlData.list.length === 0)) {
            try {
              const postParams = new URLSearchParams({
                'fid_list': `[${file.fs_id}]`,
                'shorturl': shorturl,
                'sign': '',
                'timestamp': timestamp.toString(),
                'app_id': '250528'
              });
              
              dlRes = await fetch(
                `https://www.terabox.com/api/download`,
                {
                  method: 'POST',
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': `https://www.terabox.com/s/${shorturl}`,
                    'Origin': 'https://www.terabox.com',
                    'Cookie': cookieString
                  },
                  body: postParams.toString()
                }
              );
              
              dlData = await dlRes.json();
            } catch (postErr) {
              console.error('POST method also failed:', postErr.message);
            }
          }
          
          // Check for API errors
          if (dlData.errno !== 0 && dlData.errno !== undefined) {
            console.error('Download API error:', dlData.errno, dlData.errmsg || dlData.error_msg);
            return {
              filename: file.server_filename,
              size: file.size,
              sizeFormatted: formatBytes(file.size),
              thumbnail: file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1 || null,
              isVideo: /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m3u8)$/i.test(file.server_filename),
              isAudio: /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.server_filename),
              downloadLink: null,
              streamLink: null,
              md5: file.md5,
              path: file.path,
              error: `API error: ${dlData.errno} - ${dlData.errmsg || dlData.error_msg || 'Unknown error'}`
            };
          }
          
          // Try different possible response structures
          let dlink = null;
          if (dlData.list && dlData.list.length > 0) {
            dlink = dlData.list[0].dlink || dlData.list[0].download_link || dlData.list[0].direct_link || null;
          } else if (dlData.dlink) {
            dlink = dlData.dlink;
          } else if (dlData.download_link) {
            dlink = dlData.download_link;
          } else if (dlData.direct_link) {
            dlink = dlData.direct_link;
          }
          
          // If no direct link found, try alternative method using share info
          if (!dlink && file.shareid) {
            try {
              const altRes = await fetch(
                `https://www.terabox.com/share/list?app_id=250528&web=1&channel=chunlei&clienttype=0&shorturl=${shorturl}&root=1`,
                {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Cookie': cookieString,
                    'Referer': `https://www.terabox.com/s/${shorturl}`
                  }
                }
              );
              const altData = await altRes.json();
              if (altData.list && altData.list.length > 0) {
                const fileData = altData.list.find(f => f.fs_id === file.fs_id);
                if (fileData && (fileData.dlink || fileData.download_link)) {
                  dlink = fileData.dlink || fileData.download_link;
                }
              }
            } catch (altErr) {
              console.error('Alternative method failed:', altErr.message);
            }
          }

          return {
            filename: file.server_filename,
            size: file.size,
            sizeFormatted: formatBytes(file.size),
            thumbnail: file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1 || null,
            isVideo: /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m3u8)$/i.test(file.server_filename),
            isAudio: /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.server_filename),
            downloadLink: dlink,
            streamLink: dlink,
            md5: file.md5,
            path: file.path
          };
        } catch (err) {
          console.error('Error processing file:', file.server_filename, err.message);
          return {
            filename: file.server_filename,
            size: file.size,
            sizeFormatted: formatBytes(file.size),
            thumbnail: file.thumbs?.url3 || file.thumbs?.url2 || file.thumbs?.url1 || null,
            isVideo: /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m3u8)$/i.test(file.server_filename),
            isAudio: /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file.server_filename),
            downloadLink: null,
            streamLink: null,
            md5: file.md5,
            path: file.path,
            error: `Failed to get download link: ${err.message}`
          };
        }
      })
    );

    res.json({
      success: true,
      shorturl,
      totalFiles: files.length,
      files
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
  // Using your provided cookies
  const cookies = {
    'csrfToken': '2fzTRpNb-HTGQgrg8iZYpt8F',
    'browserid': '6t2WAvN8Xo6f5aZEYD9XH5OajsohgdT9GaluTpOr5ZqwUQJIcwuSZ6Hpmqk=',
    'lang': 'en',
    'ndus': 'Y-Q-Sg3teHuiJs2mPAKP11cWWr_mWKJkOtPCFB8T',
    'ndut_fmt': '62D4B176711A137FD0FF867DF418E730576C1265986EEE56EEECEFF7AAD2E65A'
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
