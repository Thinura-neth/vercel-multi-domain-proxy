#!/usr/bin/env node
/**
 * Ngrok URL Connectivity Checker
 * 
 * This script checks if your ngrok URL is correctly configured and accessible.
 * Run this script if you're experiencing 502 errors with the Vercel proxy.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`
${colors.bright}${colors.cyan}==================================${colors.reset}
  NGROK URL CONNECTIVITY CHECKER
${colors.bright}${colors.cyan}==================================${colors.reset}
`);

// Check if we have a saved URL to suggest
let savedUrl = '';
try {
  const savedUrlPath = path.join(__dirname, 'last-ngrok-url.txt');
  if (fs.existsSync(savedUrlPath)) {
    savedUrl = fs.readFileSync(savedUrlPath, 'utf8').trim();
  }
} catch (error) {
  console.log(`${colors.yellow}Could not read saved ngrok URL:${colors.reset}`, error.message);
}

// Get ngrok URL from environment variable if exists
let envUrl = '';
try {
  // Try to get from .env file if it exists
  if (fs.existsSync(path.join(__dirname, '.env'))) {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envContent.match(/NGROK_URL=(.+)/);
    if (match && match[1]) {
      envUrl = match[1].trim();
    }
  }
  
  // Also check actual environment variables
  if (process.env.NGROK_URL) {
    envUrl = process.env.NGROK_URL;
  }
} catch (error) {
  // Ignore errors reading env file
}

// Function to check if a URL is reachable
async function checkUrlReachability(url) {
  if (!url) return { reachable: false, error: 'No URL provided' };
  
  // Try multiple paths to find one that works
  const pathsToTry = [
    '/',
    '/api/system/health-check',
    '/api/ping',
    '/api'
  ];
  
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // Function to check a single path
  const checkPath = (path) => {
    return new Promise((resolve) => {
      try {
        const fullUrl = new URL(path, url);
        const requestLib = fullUrl.protocol === 'https:' ? https : http;
        
        console.log(`  Checking ${fullUrl.toString()}...`);
        
        const req = requestLib.request({
          method: 'GET', // Use GET for more reliable results
          hostname: fullUrl.hostname,
          port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
          path: fullUrl.pathname,
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            resolve({
              path,
              reachable: true,
              statusCode: res.statusCode,
              contentLength: data.length,
              contentPreview: data.slice(0, 100)
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

// Normalize a URL
function normalizeUrl(inputUrl) {
  if (!inputUrl) return '';
  
  // Ensure URL has protocol
  if (!inputUrl.startsWith('http://') && !inputUrl.startsWith('https://')) {
    inputUrl = 'https://' + inputUrl;
  }
  
  // Remove trailing slash for consistency
  return inputUrl.replace(/\/$/, '');
}

// Remove any port specification from the URL
function removePort(inputUrl) {
  try {
    const urlObj = new URL(normalizeUrl(inputUrl));
    if (urlObj.port) {
      urlObj.port = '';
      return urlObj.toString();
    }
    return inputUrl;
  } catch (e) {
    // If URL parsing fails, try a regex-based approach
    return inputUrl.replace(/:\d+([\/]|$)/, '$1');
  }
}

// Check for running ngrok processes
async function checkNgrokProcess() {
  return new Promise((resolve) => {
    let command;
    if (process.platform === 'win32') {
      command = 'tasklist /FI "IMAGENAME eq ngrok.exe"';
    } else {
      command = 'ps aux | grep ngrok | grep -v grep';
    }
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ running: false, error: error.message });
        return;
      }
      
      const isRunning = stdout.toLowerCase().includes('ngrok');
      resolve({ running: isRunning, output: stdout });
    });
  });
}

// Check for local Website server
async function checkWebServer() {
  return new Promise((resolve) => {
    const urls = [
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    Promise.all(urls.map(url => {
      return new Promise((resolveCheck) => {
        const req = http.get(url, { timeout: 3000 }, (res) => {
          resolveCheck({ url, running: res.statusCode < 500, statusCode: res.statusCode });
        });
        
        req.on('error', () => {
          resolveCheck({ url, running: false });
        });
        
        req.on('timeout', () => {
          req.destroy();
          resolveCheck({ url, running: false, error: 'Timeout' });
        });
      });
    })).then(results => {
      const anyRunning = results.some(r => r.running);
      resolve({ 
        running: anyRunning, 
        checks: results 
      });
    });
  });
}

// Main check function
async function runChecks(ngrokUrl) {
  console.log(`\n${colors.bright}Running connectivity checks...${colors.reset}\n`);
  
  // Check if URL has port and warn about it
  const urlHasPort = ngrokUrl.match(/:\d+/);
  if (urlHasPort) {
    console.log(`${colors.yellow}⚠️  WARNING: Your ngrok URL contains a port number (${urlHasPort[0]}).${colors.reset}`);
    console.log(`${colors.yellow}Port numbers should be removed for Vercel proxy.${colors.reset}`);
    
    const cleanUrl = removePort(ngrokUrl);
    console.log(`${colors.green}✓ Suggested URL: ${cleanUrl}${colors.reset}\n`);
    
    const useClean = await askQuestion(`Use the URL without port instead? (y/n): `);
    if (useClean.toLowerCase() === 'y') {
      ngrokUrl = cleanUrl;
      console.log(`${colors.green}Using: ${ngrokUrl}${colors.reset}\n`);
    }
  }
  
  // Check URL connectivity
  console.log(`${colors.cyan}1. Checking if ngrok URL is reachable...${colors.reset}`);
  const urlCheck = await checkUrlReachability(ngrokUrl);
  
  if (urlCheck.reachable) {
    console.log(`${colors.green}✓ The ngrok URL is reachable!${colors.reset}`);
    console.log(`  Status Code: ${urlCheck.statusCode}`);
    if (urlCheck.contentLength > 0) {
      console.log(`  Received ${urlCheck.contentLength} bytes of data`);
    }
  } else {
    console.log(`${colors.red}✗ The ngrok URL is NOT reachable.${colors.reset}`);
    console.log(`  Error: ${urlCheck.error}`);
    
    // Show individual path failure details
    if (urlCheck.attempts) {
      console.log(`  Attempted paths:`);
      urlCheck.attempts.forEach(attempt => {
        console.log(`    ${attempt.path}: ${colors.red}${attempt.error || 'Failed'}${colors.reset}`);
      });
    }
  }
  
  // Check for running ngrok process
  console.log(`\n${colors.cyan}2. Checking if ngrok is running locally...${colors.reset}`);
  const ngrokProcess = await checkNgrokProcess();
  
  if (ngrokProcess.running) {
    console.log(`${colors.green}✓ ngrok is running on this machine${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ ngrok does not appear to be running on this machine${colors.reset}`);
    console.log(`  To start ngrok with Website, run: ${colors.bright}yarn dev:all:ngrok${colors.reset}`);
  }
  
  // Check for local Website server
  console.log(`\n${colors.cyan}3. Checking if Website server is running locally...${colors.reset}`);
  const serverCheck = await checkWebServer();
  
  if (serverCheck.running) {
    console.log(`${colors.green}✓ Website server is running locally${colors.reset}`);
    serverCheck.checks.forEach(check => {
      if (check.running) {
        console.log(`  ${check.url}: ${colors.green}Running (Status: ${check.statusCode})${colors.reset}`);
      }
    });
  } else {
    console.log(`${colors.red}✗ Website server does not appear to be running locally${colors.reset}`);
    console.log(`  To start the server with ngrok, run: ${colors.bright}yarn dev:all:ngrok${colors.reset}`);
  }
  
  // Provide summary and next steps
  console.log(`\n${colors.bright}${colors.cyan}==================================${colors.reset}`);
  console.log(`${colors.bright}SUMMARY${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}==================================${colors.reset}\n`);
  
  if (urlCheck.reachable && ngrokProcess.running && serverCheck.running) {
    console.log(`${colors.green}✓ All checks passed! Your setup appears to be correct.${colors.reset}`);
    console.log(`  If you're still experiencing issues with the Vercel proxy, make sure:`);
    console.log(`  1. The ngrok URL in Vercel env variables is: ${colors.bright}${ngrokUrl}${colors.reset}`);
    console.log(`  2. You've redeployed your Vercel project after updating the URL`);
  } else {
    console.log(`${colors.yellow}Some checks failed. Here's what to do:${colors.reset}\n`);
    
    if (!ngrokProcess.running || !serverCheck.running) {
      console.log(`1. Start Website with ngrok:`);
      console.log(`   ${colors.bright}yarn dev:all:ngrok${colors.reset}`);
      console.log(`   (Run this from the root folder of the project)\n`);
    }
    
    if (!urlCheck.reachable) {
      console.log(`2. The ngrok URL (${ngrokUrl}) is not reachable.`);
      console.log(`   - Check that you're using the correct, current ngrok URL`);
      console.log(`   - Make sure there are no firewalls blocking ngrok connections`);
      console.log(`   - Try restarting ngrok to get a new URL\n`);
    }
    
    console.log(`3. After fixing the issues, update your Vercel environment:`);
    console.log(`   ${colors.bright}cd vercel-proxy ; node update-ngrok.js${colors.reset}`);
    console.log(`   This will update the ngrok URL in Vercel and redeploy your project.\n`);
  }
  
  // Offer to update Vercel
  if (ngrokProcess.running && serverCheck.running) {
    console.log(`\n${colors.cyan}Would you like to update your Vercel project with the ngrok URL now?${colors.reset}`);
    const update = await askQuestion(`Update Vercel with URL: ${ngrokUrl}? (y/n): `);
    
    if (update.toLowerCase() === 'y') {
      await updateVercelEnv(ngrokUrl);
    }
  }
}

// Helper function for prompting questions
function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Update Vercel environment
async function updateVercelEnv(ngrokUrl) {
  console.log(`\n${colors.cyan}Updating Vercel environment variable...${colors.reset}`);
  
  const updateProcess = exec(`cd "${__dirname}" ; node update-ngrok.js`, (error, stdout, stderr) => {
    if (error) {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      return;
    }
    
    if (stderr) {
      console.error(`${colors.red}${stderr}${colors.reset}`);
    }
  });
  
  // Pipe the process to see real-time output
  updateProcess.stdout.pipe(process.stdout);
  updateProcess.stderr.pipe(process.stderr);
  
  // Handle user input for the child process
  process.stdin.pipe(updateProcess.stdin);
  
  // When the process exits, save the URL
  updateProcess.on('exit', () => {
    fs.writeFileSync(path.join(__dirname, 'last-ngrok-url.txt'), ngrokUrl);
    rl.close();
  });
}

// Main function
async function main() {
  // Suggest URL from environment or saved file
  const suggestedUrl = envUrl || savedUrl;
  const prompt = suggestedUrl 
    ? `Enter your ngrok URL [${suggestedUrl}]: ` 
    : 'Enter your ngrok URL (without port, e.g. https://your-id.ngrok-free.app): ';
  
  const input = await askQuestion(prompt);
  
  // Use provided input or suggested URL if empty
  const ngrokUrl = input.trim() || suggestedUrl;
  
  if (!ngrokUrl) {
    console.error(`${colors.red}No ngrok URL provided. Exiting.${colors.reset}`);
    rl.close();
    return;
  }
  
  try {
    // Validate URL format
    new URL(normalizeUrl(ngrokUrl));
    
    // Run the checks
    await runChecks(ngrokUrl);
    
  } catch (error) {
    console.error(`${colors.red}Invalid URL format. Please enter a valid ngrok URL.${colors.reset}`);
    console.error(error.message);
    rl.close();
  }
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}An error occurred:${colors.reset}`, error);
  rl.close();
}); 