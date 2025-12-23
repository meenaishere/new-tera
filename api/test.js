// Debug endpoint - api/test.js
module.exports = (req, res) => {
  res.json({ 
    status: '✅ API is working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.url,
    query: req.query,
    message: 'If you see this, your Vercel deployment is successful!'
  });
};
