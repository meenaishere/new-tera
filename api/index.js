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
      // Try share/list endpoint - this sometimes has download links
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
      
      // If share/list doesn't work, try the same endpoint but with different parameters
      if (!shareListData?.list || shareListData.errno !== 0) {
        try {
          const altShareListRes = await fetch(
            `https://www.terabox.com/api/share/list?app_id=250528&web=1&channel=chunlei&clienttype=0&shorturl=${shorturl}&root=1`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': `https://www.terabox.com/s/${shorturl}`,
                'Cookie': cookieString
              }
            }
          );
          const altData = await altShareListRes.json();
          if (altData.list && altData.errno === 0) {
            shareListData = altData;
          }
        } catch (altErr) {
          // Ignore alternative endpoint failure
        }
      }
      // #region agent log
      console.log('[HYPOTHESIS-A] share/list response:', JSON.stringify({
        hasData: !!shareListData,
        errno: shareListData?.errno,
        errmsg: shareListData?.errmsg,
        hasList: !!shareListData?.list,
        listLength: shareListData?.list?.length,
        listKeys: shareListData?.list?.[0] ? Object.keys(shareListData.list[0]) : [],
        firstItemSample: shareListData?.list?.[0] ? Object.fromEntries(Object.entries(shareListData.list[0]).slice(0, 10)) : null,
        responseKeys: Object.keys(shareListData || {}).slice(0, 20)
      }));
      // #endregion
    } catch (shareErr) {
      console.error('Share list fetch failed:', shareErr.message);
      // #region agent log
      console.log('[HYPOTHESIS-A] share/list fetch error:', shareErr.message);
      // #endregion
    }

    // Get download links for all files
    const files = await Promise.all(
      info.list.map(async (file) => {
        try {
          let dlink = null;
          const debugInfo = {
            method1_shareList: { tried: false, found: false, data: null },
            method2_fileObject: { tried: false, found: false, data: null },
            method3_downloadAPI: { tried: false, found: false, error: null, data: null },
            method4_streamDownload: { tried: false, found: false, error: null, data: null }
          };
          // #region agent log
          console.log('[HYPOTHESIS-B] processing file:', JSON.stringify({
            fsId: file.fs_id,
            filename: file.server_filename,
            fileKeys: Object.keys(file).slice(0, 20),
            hasDlink: !!file.dlink,
            hasDownloadLink: !!file.download_link,
            hasUrl: !!file.url,
            fileSample: Object.fromEntries(Object.entries(file).slice(0, 10))
          }));
          // #endregion
          
          // Method 1: Try share/list endpoint first (often has download links)
          // Log why method1 might not run
          if (!shareListData || !shareListData.list || shareListData.list.length === 0) {
            debugInfo.method1_shareList.data = {
              hasShareListData: !!shareListData,
              shareListErrno: shareListData?.errno,
              shareListErrmsg: shareListData?.errmsg,
              hasList: !!shareListData?.list,
              listLength: shareListData?.list?.length,
              shareListKeys: shareListData ? Object.keys(shareListData).slice(0, 20) : []
            };
          }
          if (shareListData && shareListData.list && shareListData.list.length > 0) {
            debugInfo.method1_shareList.tried = true;
            const shareFile = shareListData.list.find(f => f.fs_id === file.fs_id);
            debugInfo.method1_shareList.data = {
              found: !!shareFile,
              keys: shareFile ? Object.keys(shareFile).slice(0, 20) : [],
              hasDlink: !!shareFile?.dlink,
              dlinkValue: shareFile?.dlink,
              hasDownloadLink: !!shareFile?.download_link,
              sample: shareFile ? Object.fromEntries(Object.entries(shareFile).slice(0, 5)) : null
            };
            // #region agent log
            console.log('[HYPOTHESIS-A] Method 1 - share/list check:', JSON.stringify(debugInfo.method1_shareList.data));
            // #endregion
            if (shareFile) {
              dlink = shareFile.dlink || shareFile.download_link || shareFile.direct_link || 
                      shareFile.download_url || shareFile.url || null;
              debugInfo.method1_shareList.found = !!dlink;
              // #region agent log
              console.log('[HYPOTHESIS-A] Method 1 result - dlink:', dlink?.substring(0, 100) || 'null');
              // #endregion
            }
          }
          
          // Method 2: Check if file object already has download link
          if (!dlink) {
            debugInfo.method2_fileObject.tried = true;
            debugInfo.method2_fileObject.data = {
              hasDlink: !!file.dlink,
              dlinkValue: file.dlink, // Check actual value even if falsy
              dlinkType: typeof file.dlink,
              hasDownloadLink: !!file.download_link,
              hasDirectLink: !!file.direct_link,
              hasDownloadUrl: !!file.download_url,
              hasUrl: !!file.url,
              keys: Object.keys(file).slice(0, 20)
            };
            dlink = file.dlink || file.download_link || file.direct_link || 
                    file.download_url || file.url || null;
            debugInfo.method2_fileObject.found = !!dlink;
            // #region agent log
            console.log('[HYPOTHESIS-B] Method 2 result - dlink:', dlink?.substring(0, 100) || 'null');
            // #endregion
          }
          
          // Method 3: Try download API endpoint (if share/list didn't work)
          // Try GET first, then POST if GET fails
          if (!dlink) {
            debugInfo.method3_downloadAPI.tried = true;
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
              debugInfo.method3_downloadAPI.data = {
                method: 'GET',
                errno: dlData.errno,
                errmsg: dlData.errmsg || dlData.error_msg,
                hasList: !!dlData.list,
                listLength: dlData.list?.length,
                listKeys: dlData.list?.[0] ? Object.keys(dlData.list[0]).slice(0, 15) : [],
                hasDlink: !!dlData.dlink,
                responseKeys: Object.keys(dlData).slice(0, 15)
              };
              // #region agent log
              console.log('[HYPOTHESIS-C] Method 3 GET - download API response:', JSON.stringify(debugInfo.method3_downloadAPI.data));
              // #endregion
              
              // If GET fails with error 2, try POST method
              if ((dlData.errno === 2 || dlData.errno !== 0) && dlData.errno !== undefined) {
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
                  debugInfo.method3_downloadAPI.data.method = 'POST';
                  debugInfo.method3_downloadAPI.data.errno = dlData.errno;
                  debugInfo.method3_downloadAPI.data.errmsg = dlData.errmsg || dlData.error_msg;
                  debugInfo.method3_downloadAPI.data.hasList = !!dlData.list;
                  debugInfo.method3_downloadAPI.data.listLength = dlData.list?.length;
                  // #region agent log
                  console.log('[HYPOTHESIS-C] Method 3 POST - download API response:', JSON.stringify({
                    errno: dlData.errno,
                    errmsg: dlData.errmsg || dlData.error_msg,
                    hasList: !!dlData.list,
                    listLength: dlData.list?.length
                  }));
                  // #endregion
                } catch (postErr) {
                  console.error('Download API POST failed:', postErr.message);
                }
              }
              
              // Only use this if no error
              if (dlData.errno === 0 || dlData.errno === undefined) {
                if (dlData.list && dlData.list.length > 0) {
                  dlink = dlData.list[0].dlink || dlData.list[0].download_link || 
                          dlData.list[0].direct_link || null;
                } else if (dlData.dlink) {
                  dlink = dlData.dlink;
                }
                debugInfo.method3_downloadAPI.found = !!dlink;
                // #region agent log
                console.log('[HYPOTHESIS-C] Method 3 result - dlink:', dlink?.substring(0, 100) || 'null');
                // #endregion
              } else {
                debugInfo.method3_downloadAPI.error = `errno: ${dlData.errno}, errmsg: ${dlData.errmsg || dlData.error_msg || 'unknown'}`;
                console.error('Download API error:', dlData.errno, dlData.errmsg || dlData.error_msg);
              }
            } catch (dlErr) {
              debugInfo.method3_downloadAPI.error = dlErr.message;
              console.error('Download API request failed:', dlErr.message);
            }
          }
          
          // Method 4: Try streamdownload endpoint for videos
          const isVideo = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m3u8)$/i.test(file.server_filename);
          if (!dlink && (isVideo || file.isvideo === 1)) {
            debugInfo.method4_streamDownload.tried = true;
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
              debugInfo.method4_streamDownload.data = {
                status: streamRes.status,
                contentType: contentType,
                isJSON: contentType.includes('json'),
                responsePreview: responseText.substring(0, 200)
              };
              // #region agent log
              console.log('[HYPOTHESIS-D] Method 4 - streamdownload raw response:', JSON.stringify(debugInfo.method4_streamDownload.data));
              // #endregion
              let streamData;
              try {
                streamData = JSON.parse(responseText);
                debugInfo.method4_streamDownload.data.parsed = {
                  errno: streamData?.errno,
                  hasDlink: !!streamData?.dlink,
                  keys: Object.keys(streamData).slice(0, 15)
                };
              } catch (parseErr) {
                debugInfo.method4_streamDownload.error = `JSON parse failed: ${parseErr.message}`;
                // #region agent log
                console.log('[HYPOTHESIS-D] Method 4 - JSON parse failed:', parseErr.message);
                // #endregion
                throw parseErr;
              }
              // #region agent log
              console.log('[HYPOTHESIS-D] Method 4 - streamdownload parsed:', JSON.stringify(debugInfo.method4_streamDownload.data.parsed));
              // #endregion
              if (streamData.errno === 0 || streamData.errno === undefined) {
                dlink = streamData.dlink || streamData.url || streamData.stream_url || null;
                debugInfo.method4_streamDownload.found = !!dlink;
              }
            } catch (streamErr) {
              if (!debugInfo.method4_streamDownload.error) {
                debugInfo.method4_streamDownload.error = streamErr.message;
              }
              console.error('Streamdownload API failed:', streamErr.message);
              // #region agent log
              console.log('[HYPOTHESIS-D] Method 4 - streamdownload error:', streamErr.message);
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
            path: file.path,
            _debug: debugInfo
          };
          // #region agent log
          console.log('[HYPOTHESIS-E] Final result for file:', JSON.stringify({
            filename: result.filename,
            hasDownloadLink: !!result.downloadLink,
            downloadLinkPreview: result.downloadLink?.substring(0, 100) || 'null',
            debug: debugInfo
          }));
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
