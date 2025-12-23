# Terabox API for Vercel

A backend API to get download and streaming links from Terabox (formerly Dubox).

## Deployment on Vercel

1. **Install Vercel CLI:**
```bash
npm install -g vercel


Deploy:

bash
vercel
Or connect your GitHub repository to Vercel dashboard.

API Endpoints
1. Get File Information
text
GET /api/info?url=TERABOX_SHARE_URL
Example:

bash
curl "https://your-app.vercel.app/api/info?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q"
2. Get Download Link
text
GET /api/download?url=TERABOX_SHARE_URL
Example:

bash
curl "https://your-app.vercel.app/api/download?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q"
3. Get Stream Link
text
GET /api/stream?url=TERABOX_SHARE_URL
Example:

bash
curl "https://your-app.vercel.app/api/stream?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q"
Usage with Media Players
For Streaming:
HTML5 Video Player:

html
<video controls>
  <source src="STREAM_URL_FROM_API" type="video/mp4">
</video>
VLC Media Player:

text
vlc://STREAM_URL_FROM_API
PotPlayer/MX Player:
Directly use the stream URL

For Download:
Direct Download:

bash
wget "DOWNLOAD_URL_FROM_API"
IDM/Aria2:
Add the download URL to your download manager

Features
CORS enabled

5-minute caching for better performance

Error handling and fallbacks

Support for multiple media players

Session management with cookies

Notes
Links expire after 1 hour

Make sure to use valid Terabox share URLs

The API uses cached cookies; you may need to update them periodically

For large files, consider using download managers with resume capability

text

## Usage Instructions:

1. **Create a new Vercel project** with this structure
2. **Install dependencies:**
```bash
npm install
Deploy to Vercel:

bash
vercel
Test the API:

javascript
// Example fetch request
fetch('https://your-app.vercel.app/api/download?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q')
  .then(response => response.json())
  .then(data => console.log(data));
Important Notes:
Cookie Maintenance: The cookies provided will expire. You'll need to:

Login to Terabox in a browser

Extract fresh cookies using browser dev tools

Update the getCookies() method in terabox.js

Rate Limiting: Add rate limiting in production

Error Handling: The API includes fallback mechanisms for when streaming fails

Player Integration: The API provides URLs compatible with:

VLC Media Player

PotPlayer

MX Player

HTML5 video players

Download managers

This backend API will work on Vercel Serverless Functions and provides all necessary endpoints for streaming and downloading Terabox files through external players.


