# Vercel Multi-Domain Proxy

This directory contains a Vercel proxy setup that allows you to use custom domains with various backend services, including locally running applications with ngrok tunnels.

## Key Features

- 🌐 **Multi-Domain Support**: Map different domains to different backend services
- 🔄 **Backward Compatible**: Still works with existing Website ngrok setup
- 🛡️ **Edge Runtime**: Fast, secure proxy using Vercel Edge Functions
- 🔍 **Diagnostics**: Built-in tools to troubleshoot connectivity issues

## How it works

1. Deploy this proxy to Vercel
2. Configure environment variables to map domains to target URLs
3. Add your custom domains in Vercel
4. All requests from your custom domains will be forwarded to their configured targets

## Configuration Options

You have three ways to configure domain mappings:

### Option 1: Individual domain variables (recommended for a few domains)

```
PROXY_DOMAIN_EXAMPLE_COM=https://backend1.example.org
PROXY_DOMAIN_ANOTHER_EXAMPLE_COM=https://backend2.example.org
```

### Option 2: Domain map (recommended for many domains)

```
PROXY_DOMAIN_MAP={"example.com":"https://backend1.example.org","another-example.com":"https://backend2.example.org"}
```

### Option 3: Legacy ngrok URL (backward compatibility)

```
NGROK_URL=https://a858-136-158-79-183.ngrok-free.app
```

## Setup instructions

### 1. Deploy to Vercel (Quick Setup)

First, make sure you're logged in to Vercel:

```bash
vercel login
```

Then deploy the proxy:

```bash
cd vercel-proxy
npm install  # Install dependencies
npm run setup  # Deploy to Vercel
```

This script will automatically:
1. Install necessary dependencies
2. Deploy the proxy to Vercel
3. Provide instructions for next steps

### 2. Configure domain mappings

After deploying to Vercel, you need to set up your domain mappings using environment variables.

#### Option 1: Using Vercel Dashboard

1. Go to your Vercel project dashboard
2. Go to Settings → Environment Variables
3. Add your domain mapping variables using one of the formats above
4. Redeploy your project to apply the changes

#### Option 2: Using Vercel CLI

```bash
# For individual domain mappings
vercel env add PROXY_DOMAIN_EXAMPLE_COM
# Enter the target URL when prompted

# For domain map (for multiple domains)
vercel env add PROXY_DOMAIN_MAP
# Enter the JSON map when prompted

# Deploy the changes
vercel --prod
```

### 3. Set up your custom domains

You have two options for setting up your custom domains:

#### Option 1: Use our helper script (Recommended)

After deploying to Vercel, run:

```bash
# Make sure you're logged in first
vercel login

# Then assign your domain
cd vercel-proxy
yarn assign-domain
```

The script will:
1. Find your latest deployment
2. Ask you for your custom domain
3. Assign the domain to your deployment

Follow the instructions in the terminal and from Vercel to complete the domain setup.

#### Option 2: Manual setup in Vercel dashboard

1. Go to your Vercel dashboard
2. Select your deployed project
3. Go to the "Domains" tab
4. Add your custom domain (e.g., example.com)
5. Follow Vercel's instructions to verify domain ownership

## Using with Website and ngrok

If you're using this with Website, you can still use the original ngrok setup:

1. Start Website with an authenticated ngrok tunnel:
   ```bash
   yarn dev:all:ngrok
   ```

2. Update the NGROK_URL environment variable in Vercel:
   ```bash
   yarn auto-update
   ```

This will maintain backward compatibility with the original functionality.

## Diagnostics

This proxy includes built-in diagnostics tools to help you troubleshoot connectivity issues:

- `/diagnostics` - Detailed diagnostics report for your proxy configuration (Server-side)
- `/diagnostics-edge` - Edge runtime diagnostics for your proxy configuration (Edge runtime)

These tools provide valuable information about your proxy setup, connectivity status, and suggestions for fixing issues.

## Troubleshooting

If you're experiencing errors when using the proxy, try these solutions:

### 1. Check Your Target URL Format
- Make sure your target URL is properly formatted (http:// or https:// prefix)
- For ngrok URLs, make sure they don't include port numbers

### 2. Verify Your Backend Service
- Make sure your backend service is running and accessible
- Check firewall settings if your backend is behind a firewall

### 3. Run the Diagnostics Tool
Visit `/diagnostics` on your Vercel domain to see detailed information about your proxy configuration.

### 4. Common Issues and Solutions

| Problem | Solution |
|---------|----------|
| Proxy error: ECONNREFUSED | Your backend server is not running or is not accessible |
| Proxy error: ECONNRESET | Connection was interrupted - check your internet connection |
| Proxy error: ETIMEDOUT | Request timeout - your backend connection may be slow or unstable |
| 503 Error: No target URL configured | Make sure you've configured the domain mapping in Vercel environment variables |

## Examples

### Example 1: Mapping multiple domains to different backends

```
PROXY_DOMAIN_MAP={"api.example.com":"https://api-backend.example.org","app.example.com":"https://app-backend.example.org"}
```

### Example 2: Using with Website

```
NGROK_URL=https://a858-136-158-79-183.ngrok-free.app
```

### Example 3: Mixed configuration

```
PROXY_DOMAIN_API_EXAMPLE_COM=https://api-backend.example.org
NGROK_URL=https://a858-136-158-79-183.ngrok-free.app
```

## Advanced Configuration

### CORS Headers

By default, the proxy adds CORS headers to allow cross-origin requests. If you need to customize these headers, you can modify the `api/index.js` file.

### Handling Redirects

The proxy automatically handles redirects from your backend service to maintain the custom domain. If you're experiencing redirect loops, check the redirect settings in your backend service.

### TLS/SSL

The proxy handles TLS/SSL termination for you, so you don't need to configure SSL in your backend service. However, if your backend service requires HTTPS, make sure to specify `https://` in your target URL.

## IMPORTANT: About ngrok URLs

When setting up your ngrok URL in Vercel:

### ✅ DO - Use the base ngrok URL without port numbers
```
https://a858-136-158-79-183.ngrok-free.app
```

### ❌ DON'T - Include any port number
```
https://a858-136-158-79-183.ngrok-free.app:3000  ← This won't work!
https://a858-136-158-79-183.ngrok-free.app:3001  ← This won't work!
```

The Vercel proxy will handle traffic routing internally and does not need port specifications. Adding ports will cause 502 errors.

## Troubleshooting 502 Proxy Errors

If you're experiencing 502 "Bad Gateway" errors when using the Vercel proxy with ngrok, try these solutions:

### 1. Check Your ngrok URL Format
Make sure your ngrok URL does NOT include any port numbers:

| ❌ Incorrect                                     | ✅ Correct                                 |
|--------------------------------------------------|-------------------------------------------|
| https://a858-136-158-79-183.ngrok-free.app:3000  | https://a858-136-158-79-183.ngrok-free.app |
| https://a858-136-158-79-183.ngrok-free.app:3001  | https://a858-136-158-79-183.ngrok-free.app |

Update your URL in Vercel dashboard (Settings → Environment Variables) if needed.

### 2. Verify Your Local Server
Make sure your local Website server is running with ngrok:
```bash
# From the root directory:
yarn dev:all:ngrok
```
The proxy will not work if your local server is not running with an active ngrok tunnel.

### 3. Run the Diagnostics Tool
Visit `/api/diagnostics` on your Vercel domain to see detailed information about your proxy configuration.

### 4. Common Issues and Solutions

| Problem | Solution |
|---------|----------|
| Proxy error: ECONNREFUSED | Your local server is not running or ngrok is not connected |
| Proxy error: ECONNRESET | Connection was interrupted - check your internet connection |
| Proxy error: ETIMEDOUT | Request timeout - your ngrok connection may be slow or unstable |
| Tunnel Unreachable | Your ngrok tunnel has expired or is not accessible |

### 5. Advanced Solutions
- Try using a different ngrok region (configure in `.ngrok.yml`)
- Check if your firewall or antivirus is blocking the connection
- Restart your ngrok connection with a fresh tunnel
- Increase the `proxyTimeout` value in `api/index.js` if connections are slow
- Check if your ngrok free tier has exceeded its connection limit
- Try using a paid ngrok account for more reliable connections

### 6. Network Requirements
- Your local machine must have outbound access on port 443 (HTTPS)
- Your ngrok domain needs to be accessible from Vercel's servers
- Corporate networks may block ngrok - try connecting from a different network 