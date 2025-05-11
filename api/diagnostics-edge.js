// Edge Runtime diagnostics for the Vercel proxy
export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Start time for performance measurement
  const startTime = Date.now();
  
  // Get the host from the request
  const requestHost = request.headers.get('host');
  
  // Get the target URL for this domain
  const targetUrl = getTargetUrlForDomain(requestHost);
  
  // Basic validation of the target URL
  const targetUrlValidation = validateTargetUrl(targetUrl);
  
  // Check if this is a ngrok URL
  const isNgrokUrl = targetUrl && targetUrl.includes('ngrok');
  
  // Fetch request headers
  const headers = Object.fromEntries(request.headers.entries());
  
  // Check redirect chain if URL is valid
  const redirectTest = targetUrlValidation.valid ? 
    await testRedirects(targetUrl) : 
    { error: 'Invalid URL format' };
  
  // Run connectivity checks
  const connectivityChecks = await Promise.all([
    testInternetAccess(),
    testTlsConnection()
  ]);
  
  // End time for performance measurement
  const endTime = Date.now();
  
  // Format diagnostics data
  const diagnosticInfo = {
    timestamp: new Date().toISOString(),
    checkDuration: `${endTime - startTime}ms`,
    domainConfiguration: {
      requestDomain: requestHost,
      targetUrl: {
        configured: targetUrl,
        validation: targetUrlValidation
      },
      configType: getConfigurationType(requestHost, targetUrl)
    },
    redirect: redirectTest,
    connectivity: {
      internetAccess: connectivityChecks[0],
      tls: connectivityChecks[1]
    },
    environment: {
      vercelEnv: process.env.VERCEL_ENV,
      region: process.env.VERCEL_REGION
    },
    requestInfo: {
      url: request.url,
      method: request.method,
      headers
    }
  };
  
  // Generate suggestions
  const suggestions = [];
  
  if (!targetUrl) {
    suggestions.push(`No target URL found for domain '${requestHost}'. Configure a target URL using environment variables.`);
  } else if (!targetUrlValidation.valid) {
    suggestions.push(targetUrlValidation.suggestion || 'Fix the target URL format in your environment variable');
  }
  
  if (redirectTest.hasLoop) {
    suggestions.push('Redirect loop detected. This could be due to misconfiguration in your application, proxy settings, or browser cookies.');
    suggestions.push('Try clearing your browser cookies and cache.');
    suggestions.push('Check your application for any problematic redirect rules.');
  }
  
  if (connectivityChecks[1] && !connectivityChecks[1].working) {
    suggestions.push('There appears to be an issue with TLS/SSL connectivity. Consider using HTTP instead of HTTPS for your target URL.');
  }
  
  // Add domain-specific configuration suggestions
  if (isNgrokUrl) {
    suggestions.push('You are using ngrok. Make sure your tunnel is running and the URL is up-to-date.');
    suggestions.push('If using the free tier of ngrok, be aware of connection limitations.');
  }
  
  // Add suggestions to the diagnostic info
  diagnosticInfo.suggestions = suggestions;
  
  // Return JSON or HTML response based on request headers
  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('text/html')) {
    return new Response(generateHtmlReport(diagnosticInfo), {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      }
    });
  }
  
  // Default to JSON response
  return new Response(JSON.stringify(diagnosticInfo, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
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

// Get configuration type for the domain
function getConfigurationType(domain, targetUrl) {
  if (!targetUrl) {
    return 'not_configured';
  }
  
  const normalizedDomain = domain.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const specificTargetEnvVar = `PROXY_DOMAIN_${normalizedDomain}`;
  
  if (process.env[specificTargetEnvVar]) {
    return 'domain_specific_env_var';
  }
  
  if (process.env.PROXY_DOMAIN_MAP && JSON.parse(process.env.PROXY_DOMAIN_MAP)[domain]) {
    return 'domain_map';
  }
  
  if (process.env.NGROK_URL) {
    return 'legacy_ngrok_url';
  }
  
  return 'unknown';
}

// Function to validate target URL format
function validateTargetUrl(url) {
  if (!url) return { valid: false, error: 'URL is empty' };
  
  try {
    // Check for port in URL for ngrok addresses
    if (url.includes('ngrok') && url.match(/:\d+($|\/)/)) {
      return {
        valid: false,
        error: 'ngrok URL contains a port number',
        suggestion: 'Remove the port number (e.g., :3000) from your ngrok URL in the environment variable'
      };
    }
    
    // Try to parse as URL
    const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    
    return {
      valid: true,
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      formatted: parsedUrl.toString()
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message,
      suggestion: 'Make sure your URL is properly formatted (e.g., https://example.com)'
    };
  }
}

// Test for redirect loops
async function testRedirects(url) {
  if (!url) return { error: 'No URL provided' };
  
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  
  const visited = new Set();
  const redirectChain = [];
  let currentUrl = url;
  let hasLoop = false;
  
  // Follow up to 5 redirects to check for loops
  for (let i = 0; i < 5; i++) {
    if (visited.has(currentUrl)) {
      hasLoop = true;
      break;
    }
    
    visited.add(currentUrl);
    
    try {
      // Make request with manual redirect handling
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Vercel-Proxy-Diagnostics/1.0'
        }
      });
      
      // Add to redirect chain
      redirectChain.push({
        url: currentUrl,
        status: response.status,
        location: response.headers.get('location')
      });
      
      // If not a redirect, we're done
      if (response.status < 300 || response.status >= 400) {
        break;
      }
      
      // Get the next URL in the redirect chain
      const location = response.headers.get('location');
      if (!location) break;
      
      // Update current URL, resolving relative URLs
      currentUrl = new URL(location, currentUrl).toString();
      
    } catch (error) {
      redirectChain.push({
        url: currentUrl,
        error: error.message
      });
      break;
    }
  }
  
  return {
    hasLoop,
    redirectChain,
    visitedUrls: Array.from(visited)
  };
}

// Test internet connectivity
async function testInternetAccess() {
  const testSites = ['https://www.google.com', 'https://www.cloudflare.com'];
  const results = [];
  
  for (const site of testSites) {
    try {
      const response = await fetch(site, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Vercel-Proxy-Diagnostics/1.0'
        }
      });
      
      results.push({
        site,
        reachable: response.ok,
        status: response.status
      });
    } catch (error) {
      results.push({
        site,
        reachable: false,
        error: error.message
      });
    }
  }
  
  return {
    working: results.some(r => r.reachable),
    results
  };
}

// Test TLS connection
async function testTlsConnection() {
  try {
    // Test TLS by making a request to a known HTTPS endpoint
    const response = await fetch('https://www.cloudflare.com', {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Vercel-Proxy-Diagnostics/1.0'
      }
    });
    
    return {
      working: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      working: false,
      error: error.message
    };
  }
}

// Generate HTML report
function generateHtmlReport(data) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Vercel Proxy Diagnostics</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
            margin-top: 30px;
          }
          .section {
            margin-bottom: 30px;
            background: #f9f9f9;
            border-radius: 6px;
            padding: 15px;
          }
          .error { color: #e53935; }
          .success { color: #43a047; }
          .warning { color: #fb8c00; }
          pre {
            background: #f1f1f1;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #f3f3f3;
          }
          .button {
            display: inline-block;
            background: #0070f3;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            margin-top: 10px;
          }
          .button:hover {
            background: #0051cc;
          }
        </style>
      </head>
      <body>
        <h1>Vercel Proxy Diagnostics</h1>
        <p>Timestamp: ${data.timestamp}</p>
        <p>Check Duration: ${data.checkDuration}</p>
        
        <div class="section">
          <h2>Domain Configuration</h2>
          <p><strong>Request Domain:</strong> ${data.domainConfiguration.requestDomain}</p>
          <p><strong>Configuration Type:</strong> ${data.domainConfiguration.configType}</p>
          <p><strong>Target URL:</strong> ${data.domainConfiguration.targetUrl.configured || 'Not configured'}</p>
          
          ${data.domainConfiguration.targetUrl.validation.valid 
            ? `<p class="success">✅ Target URL is valid</p>` 
            : `<p class="error">❌ Target URL is invalid: ${data.domainConfiguration.targetUrl.validation.error}</p>`
          }
        </div>
        
        <div class="section">
          <h2>Redirect Test</h2>
          ${data.redirect.error 
            ? `<p class="error">❌ Error: ${data.redirect.error}</p>` 
            : (data.redirect.hasLoop 
                ? `<p class="error">❌ Redirect loop detected!</p>` 
                : `<p class="success">✅ No redirect loops detected</p>`)
          }
          
          ${data.redirect.redirectChain ? `
            <h3>Redirect Chain</h3>
            <pre>${JSON.stringify(data.redirect.redirectChain, null, 2)}</pre>
          ` : ''}
        </div>
        
        <div class="section">
          <h2>Connectivity Checks</h2>
          <h3>Internet Access</h3>
          ${data.connectivity.internetAccess.working 
            ? `<p class="success">✅ Internet access is working</p>` 
            : `<p class="error">❌ Internet access problem detected</p>`
          }
          
          <h3>TLS Connection</h3>
          ${data.connectivity.tls.working 
            ? `<p class="success">✅ TLS connections are working</p>` 
            : `<p class="error">❌ TLS connection problem detected: ${data.connectivity.tls.error}</p>`
          }
        </div>
        
        ${data.suggestions.length > 0 ? `
          <div class="section">
            <h2>Suggestions</h2>
            <ul>
              ${data.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        <div class="section">
          <h2>Environment</h2>
          <p><strong>Vercel Environment:</strong> ${data.environment.vercelEnv}</p>
          <p><strong>Vercel Region:</strong> ${data.environment.region}</p>
        </div>
        
        <div class="section">
          <h2>Request Information</h2>
          <p><strong>URL:</strong> ${data.requestInfo.url}</p>
          <p><strong>Method:</strong> ${data.requestInfo.method}</p>
          
          <h3>Headers</h3>
          <pre>${JSON.stringify(data.requestInfo.headers, null, 2)}</pre>
        </div>
        
        <a href="/diagnostics-edge?format=json" class="button">View as JSON</a>
      </body>
    </html>
  `;
} 