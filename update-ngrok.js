const { exec } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if we have a saved URL to suggest
let savedUrl = '';
try {
  const savedUrlPath = path.join(__dirname, 'last-ngrok-url.txt');
  if (fs.existsSync(savedUrlPath)) {
    savedUrl = fs.readFileSync(savedUrlPath, 'utf8').trim();
  }
} catch (error) {
  console.log('Could not read saved ngrok URL:', error.message);
}

// Initial prompt with the saved URL as suggestion
const prompt = savedUrl 
  ? `Enter your ngrok URL [${savedUrl}]: ` 
  : 'Enter your ngrok URL (without port, e.g. https://your-id.ngrok-free.app): ';

rl.question(prompt, async (input) => {
  // Use saved URL if user just presses enter
  const ngrokUrl = input.trim() || savedUrl;
  
  if (!ngrokUrl) {
    console.error('No ngrok URL provided. Aborting.');
    rl.close();
    return;
  }
  
  try {
    // Normalize and validate the URL
    let normalizedUrl = ngrokUrl;
    
    // Add https:// if missing
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    // Remove any trailing slashes
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');
    
    // Remove any port specification from the URL if present
    try {
      const urlObj = new URL(normalizedUrl);
      if (urlObj.port) {
        console.log(`\nWARNING: Port ${urlObj.port} detected in ngrok URL.`);
        console.log(`Removing port from URL as it may cause connectivity issues.`);
        urlObj.port = '';
        normalizedUrl = urlObj.toString();
      }
    } catch (e) {
      // If URL parsing fails, try a regex-based approach
      normalizedUrl = normalizedUrl.replace(/:\d+([\/]|$)/, '$1');
    }
    
    // Validate final URL format
    new URL(normalizedUrl);
    
    // Check if it looks like an ngrok URL
    if (!normalizedUrl.includes('ngrok')) {
      console.warn('\nWARNING: This doesn\'t look like an ngrok URL. Are you sure it\'s correct?');
      rl.question('Continue anyway? (y/n): ', (answer) => {
        if (answer.toLowerCase() !== 'y') {
          console.log('Aborting update.');
          rl.close();
          return;
        }
        updateVercelEnv(normalizedUrl);
      });
    } else {
      console.log(`\nNormalized URL: ${normalizedUrl}`);
      updateVercelEnv(normalizedUrl);
    }
  } catch (error) {
    console.error('Invalid URL format. Please enter a valid ngrok URL.');
    rl.close();
  }
});

function updateVercelEnv(ngrokUrl) {
    // Update Vercel environment variable using Vercel CLI
  console.log(`\nUpdating Vercel environment variable to: ${ngrokUrl}`);
  
    exec(`vercel env add NGROK_URL ${ngrokUrl} --yes`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        console.log('\nPlease try running "vercel login" first, then try again.');
      
      rl.question('\nWould you like to try logging in now? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y') {
          console.log('Running vercel login...');
          const loginProcess = exec('vercel login', (loginError, loginStdout, loginStderr) => {
            if (loginError) {
              console.error(`Login error: ${loginError.message}`);
            } else {
              console.log('Login process complete. Please run this script again.');
            }
            rl.close();
          });
          
          // Pipe the login process I/O to our console
          loginProcess.stdout.pipe(process.stdout);
          loginProcess.stderr.pipe(process.stderr);
          process.stdin.pipe(loginProcess.stdin);
        } else {
        rl.close();
        }
      });
        return;
      }
    
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
    
      console.log(`stdout: ${stdout}`);
      
      // Redeploy the project
      console.log('Redeploying...');
    const deployProcess = exec('vercel --prod', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          rl.close();
          return;
        }
      
        if (stderr) {
          console.error(`stderr: ${stderr}`);
        }
      
        console.log(`stdout: ${stdout}`);
      console.log('Done! Your Vercel project is now pointing to your ngrok URL.');
        rl.close();
      });
    
    // Pipe the deploy process I/O to our console for better visibility
    deployProcess.stdout.pipe(process.stdout);
    deployProcess.stderr.pipe(process.stderr);
  });
} 