const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting Website with ngrok tunnel...');

// Start the dev:all:ngrok command which now includes the ngrok auth token
const child = spawn('yarn', ['dev:all:ngrok'], {
  cwd: path.join(__dirname, '..'),
  shell: true,
  stdio: 'pipe'
});

// Function to extract ngrok URL from output and update Vercel
function extractNgrokUrlAndUpdate(data) {
  const output = data.toString();
  // Match ngrok URL format
  const match = output.match(/https:\/\/[a-z0-9-]+\.ngrok(-free)?\.io/i);
  if (match) {
    const url = match[0];
    console.log(`\n========================================`);
    console.log(`Ngrok URL detected: ${url}`);
    console.log(`Automatically updating Vercel...`);
    console.log(`========================================\n`);
    
    // Save URL to a file for easy access
    fs.writeFileSync(path.join(__dirname, 'last-ngrok-url.txt'), url);
    
    // Update Vercel environment variable
    exec(`vercel env add NGROK_URL ${url} --yes`, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error updating Vercel environment: ${error.message}`);
        console.error('Please try running "vercel login" first, then try again.');
        return;
      }
      
      console.log('Environment variable updated successfully.');
      console.log('Redeploying Vercel project...');
      
      // Redeploy the project
      exec('vercel --prod', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error redeploying: ${error.message}`);
          return;
        }
        
        console.log('Redeployment complete!');
        console.log(`Your custom domain is now pointing to: ${url}`);
      });
    });
  }
}

// Process stdout and stderr to find ngrok URL
child.stdout.on('data', (data) => {
  process.stdout.write(data);
  extractNgrokUrlAndUpdate(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
  extractNgrokUrlAndUpdate(data);
});

// Handle process exit
child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});

// Handle CTRL+C
process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit(0);
}); 