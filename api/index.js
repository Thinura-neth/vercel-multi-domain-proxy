// Custom HTTP proxy for Website to ngrok using Edge Function approach
export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Get the host from the request
  const requestHost = request.headers.get('host');
  
  // Get the target URL for this domain
  const targetUrl = getTargetUrlForDomain(requestHost);
  
  if (!targetUrl) {
    return new Response(`No target URL configured for domain: ${requestHost}. Please check your environment variables.`, { status: 503 });
  }
  
  // Normalize the target URL
  let targetUrlBase = normalizeTargetUrl(targetUrl);
  
  // Get request URL and create target URL
  const url = new URL(request.url);
  const target = new URL(
    `${url.pathname}${url.search}`, 
    targetUrlBase
  );
  
  console.log(`Proxying ${requestHost} to: ${target.toString()}`);
  
  // Check for redirect loops
  const loopCount = parseInt(request.headers.get('x-proxy-loop') || '0', 10);
  if (loopCount > 5) {
    return new Response('Redirect loop detected. Please check your configuration.', { 
      status: 508,
      headers: {
        'Content-Type': 'text/html',
      }
    });
  }
  
  // Forward headers, stripping hop-by-hop headers
  const headers = new Headers(request.headers);
  headers.delete('host');
  [
    'connection', 
    'keep-alive', 
    'proxy-authorization', 
    'proxy-authenticate', 
    'te', 
    'trailers', 
    'transfer-encoding', 
    'upgrade',
    'x-forwarded-host',
    'content-length' // Let the runtime calculate this
  ].forEach(h => headers.delete(h));
  
  // Add host header for the target
  headers.set('host', target.host);
  
  // Increment loop counter
  headers.set('x-proxy-loop', String(loopCount + 1));
  
  // Set CORS headers for preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, *',
      }
    });
  }
  
  try {
    // Clone the request to create a new request with the modified headers and body
    const requestInit = {
      method: request.method,
      headers,
      redirect: 'manual', // Important: Handle redirects manually
    };
    
    // Add body for non-GET/HEAD requests
    if (!['GET', 'HEAD'].includes(request.method)) {
      requestInit.body = request.body;
    }
    
    // Make the fetch request
    const response = await fetch(target.toString(), requestInit);
    
    // Create response headers
    const responseHeaders = new Headers(response.headers);
    
    // Add CORS headers to the response
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, *');
    
    // Handle redirects by rewriting the Location header
    if (response.status >= 300 && response.status < 400 && responseHeaders.has('location')) {
      const location = responseHeaders.get('location');
      console.log(`Handling redirect to: ${location}`);
      
      try {
        // If it's a relative URL, keep it relative
        if (location.startsWith('/')) {
          // No change needed, keep as is
        } else {
          // For absolute URLs, rewrite to maintain our domain
          const originalHost = request.headers.get('host');
          
          // Handle different redirect scenarios
          let rewrittenLocation;
          
          if (location.includes(target.host)) {
            // If redirecting to the same target domain, maintain our original domain
            rewrittenLocation = location.replace(new RegExp(`https?://${target.host.replace(/\./g, '\\.')}`, 'i'), `https://${originalHost}`);
          } else if (location.includes('ngrok') || targetUrlContainsKeywords(targetUrl)) {
            // If redirecting to a target domain or another domain that should be proxied, 
            // still maintain our original domain
            rewrittenLocation = new URL(location).pathname + new URL(location).search;
          } else {
            // For external redirects, pass through unmodified
            rewrittenLocation = location;
          }
          
          // Update the location header
          responseHeaders.set('location', rewrittenLocation);
        }
      } catch (e) {
        console.error('Error handling redirect:', e);
        // If there's an error, just use the original location
      }
    }
    
    // Remove problematic headers
    ['transfer-encoding', 'connection'].forEach(h => responseHeaders.delete(h));
    
    // Return the response
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`
      <html>
        <head>
          <title>Proxy Error</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
            .error { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1 class="error">Proxy Error</h1>
          <p>The proxy could not connect to your backend instance.</p>
          <p>Error: ${error.message}</p>
          <p>Make sure your target service is running and accessible.</p>
        </body>
      </html>
    `, {
      status: 502,
      headers: {
        'Content-Type': 'text/html',
      }
    });
  }
}

// Function to get the target URL for a given domain
function getTargetUrlForDomain(domain) {
  // First, check if there's a specific environment variable for this domain
  // Format: PROXY_DOMAIN_{normalized domain} = target URL
  // Example: PROXY_DOMAIN_EXAMPLE_COM = https://target-url.com
  const normalizedDomain = domain.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const specificTargetEnvVar = `PROXY_DOMAIN_${normalizedDomain}`;
  
  if (process.env[specificTargetEnvVar]) {
    return process.env[specificTargetEnvVar];
  }
  
  // Fall back to domain map if available
  if (process.env.PROXY_DOMAIN_MAP) {
    try {
      const domainMap = JSON.parse(process.env.PROXY_DOMAIN_MAP);
      if (domainMap[domain]) {
        return domainMap[domain];
      }
    } catch (e) {
      console.error('Error parsing PROXY_DOMAIN_MAP:', e);
    }
  }
  
  // Fall back to legacy NGROK_URL for backward compatibility
  return process.env.NGROK_URL;
}

// Function to normalize target URL
function normalizeTargetUrl(url) {
  if (!url) return null;
  
  // Add protocol if missing
  let normalizedUrl = url;
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'http://' + normalizedUrl;
  }
  
  // Always use HTTP to avoid SSL issues with ngrok and similar tunnels
  normalizedUrl = normalizedUrl.replace(/^https:\/\//i, 'http://');
  
  // Remove trailing slash
  normalizedUrl = normalizedUrl.replace(/\/$/, '');
  
  return normalizedUrl;
}

// Function to check if target URL contains specific keywords for special handling
function targetUrlContainsKeywords(url) {
  if (!url) return false;
  
  const keywords = ['ngrok', 'serveo', 'localhost.run', 'localtunnel'];
  return keywords.some(keyword => url.includes(keyword));
} 