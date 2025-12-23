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
                example: '/api/stream?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q'
            });
        }

        const result = await terabox.getStreamLink(url);
        
        res.status(200).json({
            success: true,
            data: {
                filename: result.filename,
                size: result.size,
                stream_url: result.stream_url,
                download_url: result.download_url,
                is_direct_stream: result.is_direct_stream || false,
                formats: result.formats || [],
                expires_at: result.expires_at,
                timestamp: result.timestamp
            },
            player_integration: {
                html5_video: `<video controls><source src="${result.stream_url}" type="video/mp4"></video>`,
                vlc: `vlc://${result.stream_url}`,
                potplayer: result.stream_url,
                note: 'Use any media player that supports direct URL streaming'
            }
        });

    } catch (error) {
        console.error('Stream API Error:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get stream link',
            tip: 'Try using the download endpoint if streaming fails'
        });
    }
};
