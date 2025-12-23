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

    // Try to get download links from share/list endpoint first (more reliable)
    let shareListData = null;
    try {
      const shareListRes = await fetch(
        `https://www.terabox.com/share/list?app_id=250528&web=1&channel=chunlei&clienttype=0&shorturl=${shorturl}&root=1`,
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
      shareListData = await shareListRes.json();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:77',message:'share/list response received',data:{hasData:!!shareListData,errno:shareListData?.errno,hasList:!!shareListData?.list,listLength:shareListData?.list?.length,listKeys:shareListData?.list?.[0]?Object.keys(shareListData.list[0]):[],fullResponse:JSON.stringify(shareListData).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (shareErr) {
      console.error('Share list fetch failed:', shareErr.message);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:79',message:'share/list fetch error',data:{error:shareErr.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }

    // Get download links for all files
    const files = await Promise.all(
      info.list.map(async (file) => {
        try {
          let dlink = null;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:85',message:'processing file',data:{fsId:file.fs_id,filename:file.server_filename,fileKeys:Object.keys(file).slice(0,20),hasDlink:!!file.dlink,hasDownloadLink:!!file.download_link,hasUrl:!!file.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          // Method 1: Try share/list endpoint first (often has download links)
          if (shareListData && shareListData.list && shareListData.list.length > 0) {
            const shareFile = shareListData.list.find(f => f.fs_id === file.fs_id);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:90',message:'Method 1: checking share/list',data:{foundShareFile:!!shareFile,shareFileKeys:shareFile?Object.keys(shareFile).slice(0,20):[],shareFileDlink:shareFile?.dlink?.substring(0,100),shareFileDownloadLink:shareFile?.download_link?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            if (shareFile) {
              dlink = shareFile.dlink || shareFile.download_link || shareFile.direct_link || 
                      shareFile.download_url || shareFile.url || null;
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:93',message:'Method 1 result',data:{dlink:dlink?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
            }
          }
          
          // Method 2: Check if file object already has download link
          if (!dlink) {
            dlink = file.dlink || file.download_link || file.direct_link || 
                    file.download_url || file.url || null;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:102',message:'Method 2 result',data:{dlink:dlink?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
          }
          
          // Method 3: Try download API endpoint (if share/list didn't work)
          if (!dlink) {
            try {
              const timestamp = Date.now();
              const dlRes = await fetch(
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
              
              const dlData = await dlRes.json();
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:121',message:'Method 3: download API response',data:{errno:dlData.errno,errmsg:dlData.errmsg||dlData.error_msg,hasList:!!dlData.list,listLength:dlData.list?.length,listKeys:dlData.list?.[0]?Object.keys(dlData.list[0]).slice(0,15):[],listDlink:dlData.list?.[0]?.dlink?.substring(0,100),hasDlink:!!dlData.dlink,responseKeys:Object.keys(dlData).slice(0,15),fullResponse:JSON.stringify(dlData).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              
              // Only use this if no error
              if (dlData.errno === 0 || dlData.errno === undefined) {
                if (dlData.list && dlData.list.length > 0) {
                  dlink = dlData.list[0].dlink || dlData.list[0].download_link || 
                          dlData.list[0].direct_link || null;
                } else if (dlData.dlink) {
                  dlink = dlData.dlink;
                }
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:130',message:'Method 3 result',data:{dlink:dlink?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
              } else {
                console.error('Download API error:', dlData.errno, dlData.errmsg || dlData.error_msg);
              }
            } catch (dlErr) {
              console.error('Download API request failed:', dlErr.message);
            }
          }
          
          // Method 4: Try streamdownload endpoint for videos
          const isVideo = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m3u8)$/i.test(file.server_filename);
          if (!dlink && (isVideo || file.isvideo === 1)) {
            try {
              const streamRes = await fetch(
                `https://www.terabox.com/api/streamdownload?app_id=250528&channel=chunlei&clienttype=0&fs_id=${file.fs_id}&shorturl=${shorturl}&web=1`,
                {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': `https://www.terabox.com/s/${shorturl}`,
                    'Cookie': cookieString
                  }
                }
              );
              const contentType = streamRes.headers.get('content-type') || '';
              const responseText = await streamRes.text();
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:148',message:'Method 4: streamdownload raw response',data:{status:streamRes.status,contentType:contentType,isJSON:contentType.includes('json'),responsePreview:responseText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              let streamData;
              try {
                streamData = JSON.parse(responseText);
              } catch (parseErr) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:154',message:'Method 4: JSON parse failed',data:{error:parseErr.message,responseText:responseText.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                throw parseErr;
              }
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:157',message:'Method 4: streamdownload parsed',data:{errno:streamData?.errno,hasDlink:!!streamData?.dlink,streamDataKeys:Object.keys(streamData).slice(0,15),fullResponse:JSON.stringify(streamData).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              if (streamData.errno === 0 || streamData.errno === undefined) {
                dlink = streamData.dlink || streamData.url || streamData.stream_url || null;
              }
            } catch (streamErr) {
              console.error('Streamdownload API failed:', streamErr.message);
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:162',message:'Method 4: streamdownload error',data:{error:streamErr.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
            }
          }

          const result = {
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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/8d58bba6-f9fc-4abc-b43e-1b6bd01458a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/index.js:175',message:'Final result for file',data:{filename:result.filename,hasDownloadLink:!!result.downloadLink,downloadLinkPreview:result.downloadLink?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          return result;
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
