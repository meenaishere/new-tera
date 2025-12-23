# TeraBox API Backend

A serverless API for extracting download and stream links from TeraBox.

## Features

- Extract download/stream links from TeraBox share links
- Support for multiple file formats
- Video detection
- File size formatting
- CORS enabled for frontend integration

## Deployment

### Deploy to Vercel

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel --prod
```

Or click this button:
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/terabox-api)

## API Usage

### Endpoint
```
GET /api/terabox?url={TERABOX_URL}
```

### Example Request
```bash
curl "https://your-domain.vercel.app/api/terabox?url=https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q"
```

### Example Response
```json
{
  "success": true,
  "shorturl": "1n9h8b63n7v6SxCaFMfOm2Q",
  "files": [
    {
      "filename": "video.mp4",
      "size": 123456789,
      "sizeFormatted": "117.74 MB",
      "thumbnail": "https://...",
      "isVideo": true,
      "downloadLink": "https://d3.terabox.com/...",
      "streamLink": "https://d3.terabox.com/...",
      "md5": "abc123..."
    }
  ]
}
```

## Frontend Integration

### JavaScript/Fetch
```javascript
const url = 'https://1024terabox.com/s/1n9h8b63n7v6SxCaFMfOm2Q';
const response = await fetch(`https://your-domain.vercel.app/api/terabox?url=${encodeURIComponent(url)}`);
const data = await response.json();

if (data.success) {
  data.files.forEach(file => {
    console.log('Download Link:', file.downloadLink);
    console.log('Stream Link:', file.streamLink);
  });
}
```

### Using with Video Players

#### Video.js
```html
<video id="player" class="video-js" controls></video>

<script>
const player = videojs('player');
player.src({
  src: data.files[0].streamLink,
  type: 'video/mp4'
});
</script>
```

#### Plyr
```html
<video id="player" playsinline controls></video>

<script>
const player = new Plyr('#player', {
  controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen']
});
player.source = {
  type: 'video',
  sources: [{
    src: data.files[0].streamLink,
    type: 'video/mp4'
  }]
};
</script>
```

## Supported URL Formats

- `https://terabox.com/s/1xxxxx`
- `https://1024terabox.com/s/1xxxxx`
- `https://teraboxapp.com/s/1xxxxx`
- `https://terasharelink.com/s/1xxxxx`

## Error Handling

The API returns appropriate HTTP status codes:

- `200`: Success
- `400`: Bad request (invalid URL)
- `404`: File not found
- `405`: Method not allowed
- `500`: Internal server error

## Rate Limiting

TeraBox may have rate limits. Consider implementing caching or rate limiting on your end if you expect high traffic.

## Notes

- The download links are temporary and may expire after some time
- Some files may require authentication depending on the share settings
- Large files might take longer to process

## License

MIT
