const terabox = require('../utils/terabox');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ 
                error: 'URL parameter is required',
                example: '/api/info?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q'
            });
        }

        const result = await terabox.getFileInfo(url);
        
        res.status(200).json({
            success: true,
            data: result,
            available_endpoints: {
                download: `/api/download?url=${encodeURIComponent(url)}`,
                stream: `/api/stream?url=${encodeURIComponent(url)}`
            }
        });

    } catch (error) {
        console.error('Info API Error:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get file information',
            tip: 'Check if the URL is valid and accessible'
        });
    }
};
