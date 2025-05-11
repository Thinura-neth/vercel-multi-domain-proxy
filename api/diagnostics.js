// Proxy diagnostics endpoint
const http = require('http');
const https = require('https');

// Main handler function for the diagnostics API
module.exports = async (req, res) => {
  // Start time for performance measurement
  const startTime = Date.now();
  
  // Get the host from the request
  const requestHost = req.headers.host;
  
  // Get the target URL for this domain
  const targetUrl = getTargetUrlForDomain(requestHost);
  
  // Basic validation of the target URL
  const targetUrlValidation = validateTargetUrl(targetUrl);
  
  // Check if this is a ngrok URL
  const isNgrokUrl = targetUrl && targetUrl.includes('ngrok');
  
  // Collect diagnostics data
  try {
    // Run all tests in parallel
    const [reachabilityCheck, redirectTest, directConnectivity, dnsCheck, tlsTest, internetTest] = await Promise.all([
      checkUrlReachability(targetUrl),
      testRedirects(targetUrl),
      testDirectConnectivity(targetUrl),
      testDns(targetUrl ? new URL(targetUrl.startsWith('http') ? targetUrl : `http://${targetUrl}`).hostname : null),
      testTlsConnection(),
      testInternetAccess()
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
      connectivity: {
        reachability: reachabilityCheck,
        redirectTest,
        direct: directConnectivity,
        dns: dnsCheck,
        tls: tlsTest,
        internet: internetTest
      },
      environment: {
        nodeVersion: process.version,
        vercelEnv: process.env.VERCEL_ENV,
        region: process.env.VERCEL_REGION
      },
      requestInfo: {
        url: req.url,
        method: req.method,
        headers: req.headers
      }
    };
    
    // Generate suggestions
    const suggestions = [];
    
    if (!targetUrl) {
      suggestions.push(`No target URL found for domain '${requestHost}'. Configure a target URL using environment variables.`);
    } else if (!targetUrlValidation.valid) {
      suggestions.push(targetUrlValidation.suggestion || 'Fix the target URL format in your environment variable');
    }
    
    if (!reachabilityCheck.reachable) {
      suggestions.push('Target is not reachable. Make sure your target server is running and accessible.');
      
      if (isNgrokUrl) {
        suggestions.push('Make sure your ngrok tunnel is running and the URL is up-to-date.');
      }
      
      if (directConnectivity && directConnectivity.error && directConnectivity.error.includes('ECONNREFUSED')) {
        suggestions.push('Connection was refused. The target server may not be running or accepting connections on the specified port.');
      }
      
      if (dnsCheck && !dnsCheck.success) {
        suggestions.push('DNS resolution failed. Check the hostname in your target URL.');
      }
    }
    
    if (redirectTest.isLoop) {
      suggestions.push('Redirect loop detected. This could be due to misconfiguration in your application, proxy settings, or browser cookies.');
    }
    
    // Add suggestions to the diagnostic info
    diagnosticInfo.suggestions = suggestions;
    
    // Send the response
    if (req.url.includes('format=json')) {
      // Send JSON response if format=json parameter is present
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(JSON.stringify(diagnosticInfo, null, 2));
    } else {
      // Default to HTML response
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(generateHtmlReport(diagnosticInfo));
    }
  } catch (error) {
    // Handle errors
    const errorResponse = {
      error: 'Diagnostics error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    
    if (req.url.includes('format=json')) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).send(JSON.stringify(errorResponse, null, 2));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.status(500).send(`
        <html>
          <head>
            <title>Diagnostics Error</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
              pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
              .error { color: #d32f2f; }
            </style>
          </head>
          <body>
            <h1 class="error">Diagnostics Error</h1>
            <p>${error.message}</p>
            ${process.env.NODE_ENV === 'development' ? `<pre>${error.stack}</pre>` : ''}
          </body>
        </html>
      `);
    }
  }
};

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

// Function to check if a URL is reachable with multiple paths
async function checkUrlReachability(url) {
  if (!url) return { reachable: false, error: 'No URL provided' };
  
  // Try multiple paths to find one that works
  const pathsToTry = [
    '/',                     // Root path
    '/api/system/health-check', // Default health check
    '/api/ping',             // Common health endpoint
    '/api',                  // API root
    '/health'                // Another common health endpoint
  ];
  
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  
  // Function to check a single path
  const checkPath = (path) => {
    return new Promise((resolve) => {
      try {
        const fullUrl = new URL(path, url);
        const requestLib = fullUrl.protocol === 'https:' ? https : http;
        
        console.log(`Checking reachability: ${fullUrl.toString()}`);
        
        const req = requestLib.request({
          method: 'GET', // Use GET instead of HEAD for more reliable results
          hostname: fullUrl.hostname,
          port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
          path: fullUrl.pathname,
          timeout: 5000, // 5 second timeout
          headers: {
            'User-Agent': 'Vercel-Proxy-Diagnostics/1.0'
          }
        }, (res) => {
          // Collect response data to check for potential issues
          let responseData = '';
          
          res.on('data', (chunk) => {
            // Limit the amount of data we collect to avoid memory issues
            if (responseData.length < 10000) {
              responseData += chunk.toString();
            }
          });
          
          res.on('end', () => {
            resolve({
              path,
              reachable: true,
              statusCode: res.statusCode,
              headers: res.headers,
              // Include a snippet of the response for inspection
              responseSnippet: responseData.length > 200 
                ? responseData.substring(0, 200) + '...' 
                : responseData
            });
          });
        });
        
        req.on('error', (err) => {
          resolve({
            path,
            reachable: false,
            error: err.message
          });
        });
        
        req.on('timeout', () => {
          req.destroy();
          resolve({
            path,
            reachable: false,
            error: 'Request timed out'
          });
        });
        
        req.end();
      } catch (e) {
        resolve({
          path,
          reachable: false,
          error: e.message
        });
      }
    });
  };
  
  // Check all paths in parallel
  const results = await Promise.all(pathsToTry.map(checkPath));
  
  // Find first success or return the most meaningful error
  const success = results.find(r => r.reachable);
  if (success) {
    return {
      reachable: true,
      ...success
    };
  }
  
  // If all failed, return comprehensive results
  return {
    reachable: false,
    attempts: results,
    error: 'All connection attempts failed'
  };
}

// Check for redirect loop issues
async function testRedirects(url) {
  if (!url) return { error: 'No URL provided' };
  
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  
  const baseUrl = new URL(url);
  const results = [];
  let isLoop = false;
  let currentUrl = baseUrl.toString();
  const visitedUrls = new Set();
  
  // Follow up to 10 redirects to detect loops
  for (let i = 0; i < 10; i++) {
    try {
      // Skip if we've already visited this URL (indicates a loop)
      if (visitedUrls.has(currentUrl)) {
        isLoop = true;
        break;
      }
      
      visitedUrls.add(currentUrl);
      
      // Make the request and check for redirects
      const result = await new Promise((resolve) => {
        const parsedUrl = new URL(currentUrl);
        const requestLib = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = requestLib.request({
          method: 'GET',
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          timeout: 5000,
          headers: {
            'User-Agent': 'Vercel-Proxy-Diagnostics/1.0'
          }
        }, (res) => {
          resolve({
            url: currentUrl,
            statusCode: res.statusCode,
            headers: res.headers
          });
          
          // Consume the response data
          res.resume();
        });
        
        req.on('error', (err) => {
          resolve({
            url: currentUrl,
            error: err.message
          });
        });
        
        req.on('timeout', () => {
          req.destroy();
          resolve({
            url: currentUrl,
            error: 'Request timed out'
          });
        });
        
        req.end();
      });
      
      results.push(result);
      
      // If not a redirect, we're done
      if (!result.statusCode || result.statusCode < 300 || result.statusCode >= 400) {
        break;
      }
      
      // If no location header, we're done
      if (!result.headers || !result.headers.location) {
        break;
      }
      
      // Update the current URL to the redirect location
      currentUrl = new URL(result.headers.location, currentUrl).toString();
      
    } catch (e) {
      results.push({
        url: currentUrl,
        error: e.message
      });
      break;
    }
  }
  
  return {
    hasLoop: isLoop,
    redirectChain: results,
    visitedUrls: Array.from(visitedUrls)
  };
}

// Test for direct connectivity
async function testDirectConnectivity() {
  const testResults = {
    dns: await testDns(),
    internetAccess: await testInternetAccess(),
    tlsCheck: await testTlsConnection(),
    corsSupport: true // Assuming CORS is supported
  };
  
  return testResults;
}

// Helper to test DNS resolution
async function testDns() {
  return new Promise(resolve => {
    const dns = require('dns');
    dns.lookup('ngrok.com', (err) => {
      resolve({
        working: !err,
        error: err ? err.message : null
      });
    });
  });
}

// Helper to test TLS connection
async function testTlsConnection() {
  return new Promise(resolve => {
    try {
      const tls = require('tls');
      const socket = tls.connect(443, 'ngrok.com', {
        timeout: 3000,
        // Adding more secure TLS options
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      });
      
      socket.on('secureConnect', () => {
        resolve({
          working: true,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()
        });
        socket.end();
      });
      
      socket.on('error', (err) => {
        resolve({
          working: false,
          error: err.message
        });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          working: false,
          error: 'Connection timed out'
        });
      });
    } catch (err) {
      resolve({
        working: false,
        error: err.message
      });
    }
  });
}

// Helper to test general internet access
async function testInternetAccess() {
  const sites = [
    'https://www.google.com',
    'https://www.cloudflare.com'
  ];
  
  const results = await Promise.all(sites.map(site => {
    return new Promise(resolve => {
      const lib = site.startsWith('https') ? https : http;
      const req = lib.get(site, { timeout: 3000 }, (res) => {
        resolve({
          site,
          reachable: res.statusCode < 400,
          statusCode: res.statusCode
        });
        res.resume(); // Consume response to free up memory
      });
      
      req.on('error', (err) => {
        resolve({
          site,
          reachable: false,
          error: err.message
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          site,
          reachable: false,
          error: 'Timeout'
        });
      });
    });
  }));
  
  return {
    working: results.some(r => r.reachable),
    results
  };
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

// Function to generate HTML report
function generateHtmlReport(data) {
  // Create a more modern HTML report with the multiple domain information
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
          <h2>Reachability Check</h2>
          ${data.connectivity.reachability.reachable 
            ? `<p class="success">✅ Target is reachable</p>` 
            : `<p class="error">❌ Target is not reachable: ${data.connectivity.reachability.error || 'Unknown error'}</p>`
          }
          
          ${data.connectivity.reachability.attempts ? `
            <h3>Connection Attempts</h3>
            <pre>${JSON.stringify(data.connectivity.reachability.attempts, null, 2)}</pre>
          ` : ''}
        </div>
        
        <div class="section">
          <h2>Redirect Test</h2>
          ${data.connectivity.redirectTest.error 
            ? `<p class="error">❌ Error: ${data.connectivity.redirectTest.error}</p>` 
            : (data.connectivity.redirectTest.isLoop 
                ? `<p class="error">❌ Redirect loop detected!</p>` 
                : `<p class="success">✅ No redirect loops detected</p>`)
          }
          
          ${data.connectivity.redirectTest.results ? `
            <h3>Redirect Chain</h3>
            <pre>${JSON.stringify(data.connectivity.redirectTest.results, null, 2)}</pre>
          ` : ''}
        </div>
        
        <div class="section">
          <h2>Connectivity Checks</h2>
          <h3>Internet Access</h3>
          ${data.connectivity.internet.working 
            ? `<p class="success">✅ Internet access is working</p>` 
            : `<p class="error">❌ Internet access problem detected</p>`
          }
          
          <h3>DNS Resolution</h3>
          ${data.connectivity.dns.success 
            ? `<p class="success">✅ DNS resolution successful</p>` 
            : `<p class="error">❌ DNS resolution failed: ${data.connectivity.dns.error || 'Unknown error'}</p>`
          }
          
          <h3>TLS Connection</h3>
          ${data.connectivity.tls.working 
            ? `<p class="success">✅ TLS connections are working</p>` 
            : `<p class="error">❌ TLS connection problem detected: ${data.connectivity.tls.error || 'Unknown error'}</p>`
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
          <p><strong>Node Version:</strong> ${data.environment.nodeVersion}</p>
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
        
        <a href="/diagnostics?format=json" class="button">View as JSON</a>
      </body>
    </html>
  `;
} 