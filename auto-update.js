const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to the file containing the last detected ngrok URL
const lastNgrokUrlFile = path.join(__dirname, 'last-ngrok-url.txt');

console.log('Checking for last detected ngrok URL...');

// Check if the file exists
if (!fs.existsSync(lastNgrokUrlFile)) {
  console.error('No last-ngrok-url.txt file found.');
  console.error('Please start the tunnel first with: yarn start');
  process.exit(1);
}

// Read the ngrok URL from the file
const ngrokUrl = fs.readFileSync(lastNgrokUrlFile, 'utf8').trim();

if (!ngrokUrl) {
  console.error('Empty ngrok URL found in last-ngrok-url.txt');
  process.exit(1);
}

try {
  // Validate the URL format
  new URL(ngrokUrl);
  
  console.log(`Found ngrok URL: ${ngrokUrl}`);
  console.log('Updating Vercel environment variable...');
  
  // Update Vercel environment variable using Vercel CLI
  exec(`vercel env add NGROK_URL ${ngrokUrl} --yes`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      console.error('Please try running "vercel login" first, then try again.');
      return;
    }
    
    console.log('Environment variable updated successfully.');
    console.log('Redeploying...');
    
    // Redeploy the project
    exec('vercel --prod', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      
      console.log('Redeployment complete!');
      console.log(`Your custom domain is now pointing to: ${ngrokUrl}`);
    });
  });
} catch (error) {
  console.error(`Invalid URL format: ${ngrokUrl}`);
  console.error('Please restart the tunnel with: yarn start');
} 