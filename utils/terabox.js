const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

class Terabox {
    constructor() {
        this.baseURL = 'https://www.terabox.com';
        this.session = axios.create({
            baseURL: this.baseURL,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        });

        // Update session cookies
        this.session.defaults.headers.Cookie = this.getCookies();
    }

    getCookies() {
        const cookies = {
            'csrfToken': '2fzTRpNb-HTGQgrg8iZYpt8F',
            'browserid': '6t2WAvN8Xo6f5aZEYD9XH5OajsohgdT9GaluTpOr5ZqwUQJIcwuSZ6Hpmqk=',
            'lang': 'en',
            'ab_sr': '1.0.1_NTYwZTZkOTVmYzJmYmZlMmU1MmM3YzczZDI4YmFlZTJhZmVlNTA4ODgyMzY3MDMzOTc4NWNkNTM4NmQxNzYxMDQzMTI4ZTk4OTEyZGZhMGIxODlhM2E0ODk3MDAzZjM4MGM2MmE1N2QxM2NlZjA4NzJkY2MwYmMzNzkyMTQ5M2UyZjgyZDFlYzVlNzEwNzg2MGQzMzFkYjY0MDRlNDc2ZQ==',
            'ndus': 'Y-Q-Sg3teHuiJs2mPAKP11cWWr_mWKJkOtPCFB8T',
            'ndut_fmt': '62D4B176711A137FD0FF867DF418E730576C1265986EEE56EEECEFF7AAD2E65A',
            'g_state': '{"i_l":0,"i_ll":1766488997501,"i_b":"VBCNOXT3L4LF4wrb9ZCOgFayFJbMpNAx5x+0cBSDirA","i_e":{"enable_itp_optimization":0}}'
        };

        return Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
    }

    async extractFileInfo(shareUrl) {
        const cacheKey = `file_info_${shareUrl}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            // Get the share page
            const response = await this.session.get(shareUrl);
            const $ = cheerio.load(response.data);

            // Extract file information
            const fileData = {
                filename: $('meta[property="og:title"]').attr('content') || 'Unknown',
                size: $('span.size').text() || 'Unknown',
                timestamp: $('span.timestamp').text() || 'Unknown',
                description: $('meta[property="og:description"]').attr('content') || '',
                shareid: shareUrl.split('/s/')[1] || '',
                uk: $('meta[name="uk"]').attr('content') || '',
                shareid: $('meta[name="shareid"]').attr('content') || '',
                sign: $('meta[name="sign"]').attr('content') || '',
                timestamp: $('meta[name="timestamp"]').attr('content') || ''
            };

            // Extract direct links if available
            const scripts = $('script').text();
            const videoRegex = /"video_url":"([^"]+)"/;
            const videoMatch = scripts.match(videoRegex);
            
            if (videoMatch) {
                fileData.direct_url = videoMatch[1].replace(/\\\//g, '/');
            }

            cache.set(cacheKey, fileData);
            return fileData;

        } catch (error) {
            console.error('Error extracting file info:', error.message);
            throw new Error('Failed to extract file information');
        }
    }

    async getDownloadLink(shareUrl) {
        const cacheKey = `download_${shareUrl}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const fileInfo = await this.extractFileInfo(shareUrl);
            
            // Construct API request for download
            const payload = {
                shareid: fileInfo.shareid,
                uk: fileInfo.uk,
                sign: fileInfo.sign,
                timestamp: fileInfo.timestamp,
                web: 1,
                app_id: 250528,
                clienttype: 0
            };

            const response = await this.session.post('/api/shorturlinfo', payload, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Origin': this.baseURL,
                    'Referer': shareUrl
                }
            });

            if (response.data && response.data.dlink) {
                const result = {
                    ...fileInfo,
                    download_url: response.data.dlink,
                    expires_at: Date.now() + (3600 * 1000) // 1 hour expiration
                };
                
                cache.set(cacheKey, result);
                return result;
            }

            throw new Error('No download link found');

        } catch (error) {
            console.error('Error getting download link:', error.message);
            throw new Error('Failed to get download link');
        }
    }

    async getStreamLink(shareUrl) {
        const cacheKey = `stream_${shareUrl}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const fileInfo = await this.extractFileInfo(shareUrl);
            
            // For streaming, we might need to use a different endpoint
            const payload = {
                shareid: fileInfo.shareid,
                uk: fileInfo.uk,
                sign: fileInfo.sign,
                timestamp: fileInfo.timestamp,
                web: 1,
                app_id: 250528,
                clienttype: 0,
                type: 'video' // For streaming
            };

            const response = await this.session.post('/api/shorturlinfo', payload, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Origin': this.baseURL,
                    'Referer': shareUrl
                }
            });

            if (response.data && response.data.stream_url) {
                const result = {
                    ...fileInfo,
                    stream_url: response.data.stream_url,
                    formats: response.data.formats || [],
                    expires_at: Date.now() + (3600 * 1000)
                };
                
                cache.set(cacheKey, result);
                return result;
            }

            // If no stream URL, return download URL as fallback
            const downloadInfo = await this.getDownloadLink(shareUrl);
            const streamResult = {
                ...downloadInfo,
                stream_url: downloadInfo.download_url,
                is_direct_stream: true
            };
            
            cache.set(cacheKey, streamResult);
            return streamResult;

        } catch (error) {
            console.error('Error getting stream link:', error.message);
            
            // Fallback to download link
            try {
                const downloadInfo = await this.getDownloadLink(shareUrl);
                return {
                    ...downloadInfo,
                    stream_url: downloadInfo.download_url,
                    is_direct_stream: true,
                    note: 'Using download URL as stream fallback'
                };
            } catch (fallbackError) {
                throw new Error('Failed to get stream link');
            }
        }
    }

    async getFileInfo(shareUrl) {
        return this.extractFileInfo(shareUrl);
    }
}

module.exports = new Terabox();
