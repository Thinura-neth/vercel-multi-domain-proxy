const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Setting up Vercel Multi-Domain proxy...');

// Install dependencies if they don't exist
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.log('Installing dependencies...');
  exec('npm install', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error installing dependencies: ${error.message}`);
      return;
    }
    deployToVercel();
  });
} else {
  deployToVercel();
}

function deployToVercel() {
  console.log('Deploying to Vercel...');
  console.log('Please log in to Vercel when prompted...');
  
  // Deploy to Vercel using the CLI
  exec('vercel --yes', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error deploying to Vercel: ${error.message}`);
      console.log('\nPlease try running "vercel login" first, then run "npm run setup" again.');
      return;
    }
    
    console.log(stdout);
    console.log('\nDeployment complete!');
    console.log('\nNext steps:');
    console.log('1. Set up domain mapping environment variables:');
    console.log('   - For Website: Run "yarn update-ngrok" to set NGROK_URL');
    console.log('   - For multiple domains: Run "yarn migrate" for guided setup');
    console.log('2. Set up your custom domain(s) in the Vercel dashboard or use "yarn assign-domain"');
    console.log('3. Visit your domain with /diagnostics path to check configuration');
  });
} 