<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terabox Link Downloader</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="bg-gray-100 font-sans">

    <div class="container mx-auto max-w-4xl p-4">
        <div class="bg-white rounded-lg shadow-lg p-6">
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-4">Terabox Downloader</h1>

            <div class="mb-4">
                <label for="terabox-url" class="block text-gray-700 text-sm font-bold mb-2">Enter Terabox URL:</label>
                <input type="text" id="terabox-url" class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" placeholder="https://www.terabox.com/s/...">
            </div>

            <div class="flex items-center justify-center mb-4">
                <button id="get-files-btn" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
                    Get Files
                </button>
            </div>

            <div id="loading" class="text-center hidden">
                <p class="text-gray-600">Loading, please wait...</p>
            </div>

            <div id="error-message" class="text-center hidden bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            </div>

            <div id="results" class="hidden">
                <h2 class="text-2xl font-bold text-gray-800 mb-3">Files:</h2>
                <ul id="file-list" class="list-disc list-inside bg-gray-50 p-4 rounded">
                </ul>
            </div>
        </div>

        <div class="bg-white rounded-lg shadow-lg p-6 mt-6">
            <h2 class="text-2xl font-bold text-gray-800 mb-3">Backend Setup</h2>
            <p class="text-gray-700 mb-4">The backend logic for this application needs to be deployed as a serverless function on a platform like Vercel or Netlify. The code you provided seems to be having issues due to changes in the Terabox website layout. You may need to update the scraping logic in the code below.</p>
            <p class="text-gray-700 mb-4"><strong>Deployment Steps:</strong></p>
            <ol class="list-decimal list-inside text-gray-700 mb-4">
                <li>Copy the code below into a file named <code>index.js</code> inside an <code>api</code> directory (<code>api/index.js</code>).</li>
                <li>Deploy the project to a serverless hosting provider (e.g., Vercel, Netlify).</li>
                <li>Once deployed, you will get a URL for your serverless function.</li>
                <li>Update the <code>API_ENDPOINT</code> variable in the script of this HTML file to your serverless function URL.</li>
            </ol>
            <h3 class="text-xl font-bold text-gray-800 mb-2">Backend Code (api/index.js)</h3>
            <pre class="bg-gray-900 text-white p-4 rounded-md overflow-x-auto"><code class="language-javascript">
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
            </code></pre>
        </div>
    </div>

    <script>
        const getFilesBtn = document.getElementById('get-files-btn');
        const teraboxUrlInput = document.getElementById('terabox-url');
        const loadingDiv = document.getElementById('loading');
        const errorMessageDiv = document.getElementById('error-message');
        const resultsDiv = document.getElementById('results');
        const fileListUl = document.getElementById('file-list');

        // !!! IMPORTANT !!!
        // Replace this with the URL of your deployed serverless function.
        // You can use one from your logs like 'https://new-tera.vercel.app/api' or your own deployment.
        const API_ENDPOINT = 'https://new-tera-l2q0a41z2-stranges-projects-b281d749.vercel.app/api';

        getFilesBtn.addEventListener('click', async () => {
            const url = teraboxUrlInput.value.trim();
            if (!url) {
                showError('Please enter a Terabox URL.');
                return;
            }

            hideError();
            hideResults();
            showLoading();

            try {
                const response = await fetch(`${API_ENDPOINT}?url=${encodeURIComponent(url)}`);
                const data = await response.json();

                if (!response.ok || data.error) {
                    let errorMessage = data.error || 'An unknown error occurred.';
                    if(data.reason === 'Layout Changed') {
                        errorMessage += ' The backend scraping logic is likely outdated. Please check the backend code and update the regex.';
                    }
                    if(data.reason === 'IP Blocked by TeraBox') {
                        errorMessage += ' The server IP is blocked by Terabox. Try redeploying the backend function to get a new IP.';
                    }
                    showError(errorMessage);
                    return;
                }
                
                displayFiles(data.list);

            } catch (error) {
                showError('Failed to fetch data. Make sure the API endpoint is correct and the backend is running.');
                console.error('Fetch Error:', error);
            } finally {
                hideLoading();
            }
        });

        function displayFiles(files) {
            fileListUl.innerHTML = '';
            if (files && files.length > 0) {
                files.forEach(file => {
                    const li = document.createElement('li');
                    li.textContent = `${file.filename} (${formatBytes(file.size)})`;
                    li.className = 'text-gray-800';
                    fileListUl.appendChild(li);
                });
                resultsDiv.classList.remove('hidden');
            } else {
                showError('No files found in the provided URL.');
            }
        }

        function showError(message) {
            errorMessageDiv.textContent = message;
            errorMessageDiv.classList.remove('hidden');
        }

        function hideError() {
            errorMessageDiv.classList.add('hidden');
        }

        function showLoading() {
            loadingDiv.classList.remove('hidden');
        }

        function hideLoading() {
            loadingDiv.classList.add('hidden');
        }
        
        function hideResults() {
            resultsDiv.classList.add('hidden');
        }

        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
    </script>

</body>
</html>
