# Vercel Edge Proxy for Website

This document explains the implementation of the Edge Function proxy for Website, which allows you to use a custom Vercel domain to access your local Website instance through an ngrok tunnel.

## How It Works

The proxy uses Vercel's Edge Runtime to create a lightweight and efficient proxy between your Vercel domain and your ngrok tunnel. This approach provides several benefits:

1. **Better Performance**: Edge Functions run closer to your users, reducing latency
2. **Improved Reliability**: Edge Functions can handle more concurrent connections
3. **Better Redirect Handling**: The proxy properly rewrites Location headers to maintain your domain
4. **Automatic Loop Detection**: Prevents infinite redirect loops that can crash browsers

## Setup Instructions

1. In your Website instance, start an ngrok tunnel:
   ```bash
   yarn dev:all:ngrok
   ```

2. Copy the ngrok URL (without the port number)

3. In Vercel, set the `NGROK_URL` environment variable to your ngrok URL

4. Deploy the proxy to Vercel

## Troubleshooting

If you encounter issues, you can use the diagnostic endpoints:

- `/diagnostics-edge` - Edge Runtime diagnostics
- `/diagnostics` - Traditional Node.js diagnostics

These endpoints will check for:
- Proper ngrok URL configuration
- Redirect loops
- Connectivity issues
- TLS/SSL problems

### Common Issues and Solutions

#### Too Many Redirects Error

This error typically occurs when:

1. There's a domain mismatch between your Vercel domain and ngrok URL
2. Your browser has corrupt cookies
3. Your application is sending redirects in a loop

**Solutions:**
- Clear your browser cookies and cache
- Make sure your ngrok URL is properly formatted (no port number)
- Use HTTP instead of HTTPS for the ngrok connection

#### SSL/TLS Errors

**Solutions:**
- Use HTTP when starting your ngrok tunnel: `ngrok http --scheme=http 3000`
- Make sure the proxy is using HTTP to connect to ngrok (this is done automatically)

#### 502 Bad Gateway or Connection Issues

**Solutions:**
- Verify your ngrok tunnel is running
- Check your firewall settings
- Ensure your local Website instance is accessible through ngrok

## Implementation Details

The proxy:
1. Receives requests at your Vercel domain
2. Rewrites them to target your ngrok tunnel
3. Handles redirects to maintain your original domain
4. Detects and prevents redirect loops
5. Manages headers to ensure proper communication

It uses the `fetch` API with manual redirect handling to maintain full control over the redirect process.

## Edge Runtime vs Server Functions

This implementation uses Vercel's Edge Runtime instead of traditional Node.js server functions. The key differences:

- **Edge Runtime**: Lightweight, fast, distributed execution close to users
- **Server Functions**: Full Node.js environment, more functionality but potentially slower

The Edge Runtime is better suited for proxy applications as it provides lower latency and better handling of streaming responses. 