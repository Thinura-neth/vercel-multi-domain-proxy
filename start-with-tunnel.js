// start-with-tunnel.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting Website with ngrok tunnel...');

// Start the dev:all:ngrok command
const child = spawn('yarn', ['dev:all:ngrok'], {
  cwd: path.join(__dirname, '..'),
  shell: true,
  stdio: 'pipe'
});

// Function to extract ngrok URL from output
function extractNgrokUrl(data) {
  const output = data.toString();
  // Match ngrok URL formats, including newer ngrok-free.app patterns
  const match = output.match(/https:\/\/[a-z0-9-]+\.ngrok(?:-free)?\.(?:io|app)(?::\d+)?/i);
  if (match) {
    let url = match[0];
    
    // Check if the URL contains a port number and remove it
    const urlObj = new URL(url);
    if (urlObj.port) {
      console.log(`\nNOTE: Port ${urlObj.port} detected in ngrok URL. It will be removed for Vercel config.`);
      urlObj.port = '';
      url = urlObj.toString();
    }
    
    console.log(`\n========================================`);
    console.log(`Ngrok URL detected: ${url}`);
    console.log(`IMPORTANT: Use this URL WITHOUT any port numbers.`);
    console.log(`To use with Vercel proxy, update the NGROK_URL env var:`);
    console.log(`cd vercel-proxy ; node update-ngrok.js`);
    console.log(`========================================\n`);
    
    // Save URL to a file for easy access (without port)
    fs.writeFileSync(path.join(__dirname, 'last-ngrok-url.txt'), url);
    
    // Also output a reminder about how to run without the shell
    console.log(`\nALTERNATIVE: To update without shell access:`);
    console.log(`1. Go to Vercel dashboard > Settings > Environment Variables`);
    console.log(`2. Update NGROK_URL to: ${url}`);
    console.log(`3. Redeploy your project\n`);
    
    // Add the troubleshooting tips for 502 errors
    console.log(`\n===== IF YOU'RE SEEING 502 PROXY ERRORS =====`);
    console.log(`1. Make sure this dev server stays running while using the proxy`);
    console.log(`2. Check that your firewall/antivirus isn't blocking ngrok`);
    console.log(`3. Try using a different ngrok account or region`);
    console.log(`4. Verify the URL in Vercel matches EXACTLY what's shown above (without port)`);
    console.log(`5. Run the diagnostics check at YOUR-VERCEL-DOMAIN/api/diagnostics`);
    console.log(`=============================================\n`);
  }
}

// Process stdout and stderr to find ngrok URL
child.stdout.on('data', (data) => {
  process.stdout.write(data);
  extractNgrokUrl(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
  extractNgrokUrl(data);
});

// Handle process exit
child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
  
  if (code !== 0) {
    console.log(`\n===== TROUBLESHOOTING =====`);
    console.log(`If you were seeing 502 proxy errors on Vercel, this is likely why.`);
    console.log(`The local server has stopped running. The Vercel proxy needs this`);
    console.log(`server to be running to work correctly.`);
    console.log(`===========================\n`);
  }
});

// Handle CTRL+C
process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit(0);
}); 