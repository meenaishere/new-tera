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
                example: '/api/download?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q'
            });
        }

        const result = await terabox.getDownloadLink(url);
        
        res.status(200).json({
            success: true,
            data: {
                filename: result.filename,
                size: result.size,
                download_url: result.download_url,
                direct_url: result.direct_url,
                expires_at: result.expires_at,
                timestamp: result.timestamp,
                note: 'Link expires in 1 hour'
            },
            player_suggestions: {
                vlc: `vlc://${result.download_url}`,
                mpv: result.download_url,
                mx_player: result.download_url
            }
        });

    } catch (error) {
        console.error('Download API Error:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get download link',
            tip: 'Make sure the URL is correct and the file is accessible'
        });
    }
};
