const { exec } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Looking for Vercel deployments...');

// First check if Vercel CLI is installed
exec('vercel --version', { cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error('Vercel CLI is not installed or not in the PATH.');
    console.log('\nPlease do one of the following:');
    console.log('1. Install Vercel CLI globally: npm install -g vercel');
    console.log('2. Log in to Vercel: vercel login');
    console.log('3. Deploy manually: vercel');
    console.log('\nAlternatively, you can set up the domain directly in the Vercel dashboard:');
    console.log('1. Go to https://vercel.com/dashboard');
    console.log('2. Select your "vercel-proxy" project');
    console.log('3. Go to Settings > Domains');
    console.log('4. Add your custom domain and follow the instructions');
    rl.close();
    return;
  }
  
  // Next, get the deployment URL
  console.log('Getting deployment URL...');
  exec('vercel ls', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error getting deployments: ${error.message}`);
      console.log('Please make sure you are logged in to Vercel with "vercel login"');
      rl.close();
      return;
    }
    
    try {
      // Parse text output from vercel ls
      const lines = stdout.split('\n').filter(line => line.trim() !== '');
      
      // Skip header lines
      const deploymentLines = lines.slice(3); // Skip header rows
      
      if (deploymentLines.length === 0) {
        console.error('No deployments found. Please deploy the project first with:');
        console.log('\ncd vercel-proxy');
        console.log('vercel');
        rl.close();
        return;
      }
      
      // Parse deployment information
      const deployments = [];
      for (const line of deploymentLines) {
        // Try to extract URL and name from the line
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const name = parts[0]; // First column is usually the name
          const url = parts[parts.length - 1]; // Last column is usually the URL
          deployments.push({ name, url });
        }
      }
      
      if (deployments.length === 0) {
        console.log('Failed to parse deployment information.');
        console.log('Raw output:');
        console.log(stdout);
        promptForManualEntry();
        return;
      }
      
      // Filter for deployments that might be the proxy
      const proxyDeployments = deployments.filter(d => 
        d.name === 'vercel-proxy' || 
        d.name === 'Website-vercel-proxy' ||
        d.name === 'vercel-Website' ||
        d.url.includes('vercel-proxy') ||
        d.url.includes('proxy'));
      
      if (proxyDeployments.length === 0) {
        console.log('Could not automatically find your proxy deployment.');
        console.log('Available deployments:');
        
        // List deployments with numbers
        deployments.forEach((d, i) => console.log(`${i+1}. ${d.name} (${d.url})`));
        
        // Prompt user to select a deployment
        rl.question('\nEnter the number of the deployment to use (or "m" for manual entry): ', (choice) => {
          if (choice.toLowerCase() === 'm') {
            promptForManualEntry();
            return;
          }
          
          const index = parseInt(choice) - 1;
          if (isNaN(index) || index < 0 || index >= deployments.length) {
            console.error('Invalid selection. Exiting.');
            rl.close();
            return;
          }
          
          const selectedDeployment = deployments[index];
          promptForDomain(selectedDeployment.url);
        });
        
        return;
      }
      
      // Just use the first proxy deployment found
      const selectedDeployment = proxyDeployments[0];
      
      console.log(`Proxy deployment found: ${selectedDeployment.name} (${selectedDeployment.url})`);
      promptForDomain(selectedDeployment.url);
    } catch (e) {
      console.error(`Error processing deployments: ${e.message}`);
      console.log('Raw output:', stdout);
      promptForManualEntry();
    }
  });
});

function promptForManualEntry() {
  rl.question('Enter your deployment URL manually (e.g., vercel-proxy-abc123.vercel.app): ', (url) => {
    if (!url) {
      console.error('No URL provided. Exiting.');
      rl.close();
      return;
    }
    
    promptForDomain(url);
  });
}

function promptForDomain(deploymentUrl) {
  // Ask for the custom domain
  rl.question('Enter your custom domain (e.g., blyrha.cloud): ', (domain) => {
    if (!domain) {
      console.error('No domain provided. Exiting.');
      rl.close();
      return;
    }
    
    console.log(`Assigning domain ${domain} to deployment ${deploymentUrl}...`);
    
    // Try both alias syntax variations
    exec(`vercel alias set ${deploymentUrl} ${domain}`, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.log('Trying alternative alias command syntax...');
        exec(`vercel alias ${deploymentUrl} ${domain}`, { cwd: __dirname }, (error2, stdout2, stderr2) => {
          if (error2) {
            console.error(`Error assigning domain: ${error2.message}`);
            console.log(stderr2 || stderr);
            console.log('\nYou can try setting up the domain manually in the Vercel dashboard:');
            console.log('1. Go to https://vercel.com/dashboard');
            console.log('2. Select your project');
            console.log('3. Go to Settings > Domains');
            console.log('4. Add your custom domain and follow the instructions');
            rl.close();
            return;
          }
          
          handleSuccess(stdout2, domain);
        });
        return;
      }
      
      handleSuccess(stdout, domain);
    });
  });
}

function handleSuccess(output, domain) {
  console.log(output);
  console.log(`\nSuccess! Your custom domain ${domain} is now assigned to your deployment.`);
  console.log('\nIf this is your first time setting up this domain with Vercel:');
  console.log('1. Vercel will guide you through the DNS setup process');
  console.log('2. You might need to verify domain ownership');
  console.log('3. Configure DNS settings as instructed by Vercel');
  
  rl.close();
} 