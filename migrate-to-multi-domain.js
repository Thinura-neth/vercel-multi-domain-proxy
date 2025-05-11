#!/usr/bin/env node

/**
 * Migration script to help move from single-domain to multi-domain setup
 */

const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════╗
║  Vercel Proxy Migration to Multi-Domain Support   ║
╚═══════════════════════════════════════════════════╝
${colors.reset}`);

console.log(`This script will help you migrate from the original single-domain 
setup to the new multi-domain configuration.

${colors.yellow}It will:${colors.reset}
1. Check if you have a current NGROK_URL environment variable
2. Help you set up individual domain mappings
3. Update your Vercel project with the new configuration

`);

// Function to run Vercel commands safely
function runVercelCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' });
  } catch (error) {
    console.error(`${colors.red}Error running command: ${command}${colors.reset}`);
    console.error(error.message);
    return null;
  }
}

// Function to check if the user is logged in to Vercel
function checkVercelLogin() {
  try {
    const loginCheck = execSync('vercel whoami', { encoding: 'utf8' });
    if (loginCheck && loginCheck.trim()) {
      console.log(`${colors.green}✓ Logged in to Vercel as: ${loginCheck.trim()}${colors.reset}`);
      return true;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Not logged in to Vercel.${colors.reset}`);
    return false;
  }
}

// Main migration function
async function migrateToMultiDomain() {
  // Check Vercel login
  if (!checkVercelLogin()) {
    console.log(`\nPlease log in to Vercel by running ${colors.cyan}'vercel login'${colors.reset} and try again.`);
    rl.close();
    return;
  }

  // Get current project info
  try {
    console.log(`\n${colors.blue}Checking current project configuration...${colors.reset}`);
    
    // Check current NGROK_URL environment variable
    let currentNgrokUrl = '';
    try {
      console.log(`${colors.dim}Running: vercel env ls${colors.reset}`);
      const envList = execSync('vercel env ls', { encoding: 'utf8' });
      
      if (envList.includes('NGROK_URL')) {
        console.log(`${colors.green}✓ Found existing NGROK_URL environment variable${colors.reset}`);
        
        // Ask if the user wants to keep using NGROK_URL for backward compatibility
        const keepNgrokUrl = await new Promise(resolve => {
          rl.question(`\nDo you want to keep the NGROK_URL for backward compatibility? (Y/n): `, answer => {
            resolve(answer.toLowerCase() !== 'n');
          });
        });
        
        if (!keepNgrokUrl) {
          console.log(`\n${colors.yellow}You've chosen to remove the NGROK_URL environment variable.${colors.reset}`);
          console.log(`${colors.yellow}You can always add it back later if needed.${colors.reset}`);
          
          try {
            console.log(`${colors.dim}Running: vercel env rm NGROK_URL${colors.reset}`);
            execSync('vercel env rm NGROK_URL -y', { encoding: 'utf8' });
            console.log(`${colors.green}✓ Removed NGROK_URL environment variable${colors.reset}`);
          } catch (error) {
            console.error(`${colors.red}Error removing NGROK_URL: ${error.message}${colors.reset}`);
          }
        }
      } else {
        console.log(`${colors.yellow}No existing NGROK_URL environment variable found.${colors.reset}`);
      }
    } catch (error) {
      console.error(`${colors.red}Error checking environment variables: ${error.message}${colors.reset}`);
    }
    
    // Set up domain mappings
    console.log(`\n${colors.magenta}Setting up domain mappings...${colors.reset}`);
    
    // Check how many domains to configure
    const setupType = await new Promise(resolve => {
      rl.question(`\nHow would you like to configure domains?\n
1. Individual domain variables (for few domains)
2. Domain map (for many domains)

Enter your choice (1/2): `, answer => {
        resolve(parseInt(answer.trim()) || 1);
      });
    });
    
    if (setupType === 1) {
      await setupIndividualDomains();
    } else {
      await setupDomainMap();
    }
    
    // Finalize and deploy
    console.log(`\n${colors.green}Configuration complete! Deploying the changes...${colors.reset}`);
    
    try {
      console.log(`${colors.dim}Running: vercel --prod${colors.reset}`);
      execSync('vercel --prod', { stdio: 'inherit' });
      console.log(`${colors.green}✓ Deployment successful!${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error deploying: ${error.message}${colors.reset}`);
    }
    
    // Instructions for next steps
    console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════╗
║  Migration complete! Next steps:                  ║
╚═══════════════════════════════════════════════════╝${colors.reset}

1. Verify your domains are working by visiting them
2. If you need to add more domains later, run:
   ${colors.cyan}vercel env add PROXY_DOMAIN_YOUR_DOMAIN_COM${colors.reset}
3. Check your configuration with the diagnostics tool:
   ${colors.cyan}https://your-domain.com/diagnostics${colors.reset}

Thank you for using Vercel Multi-Domain Proxy!
`);
    
  } catch (error) {
    console.error(`${colors.red}An error occurred during migration: ${error.message}${colors.reset}`);
  }
  
  rl.close();
}

// Setup individual domain variables
async function setupIndividualDomains() {
  const numDomains = await new Promise(resolve => {
    rl.question(`\nHow many domains do you want to configure? `, answer => {
      resolve(parseInt(answer.trim()) || 1);
    });
  });
  
  for (let i = 0; i < numDomains; i++) {
    const domain = await new Promise(resolve => {
      rl.question(`\nEnter domain ${i+1}: `, answer => {
        resolve(answer.trim());
      });
    });
    
    if (!domain) continue;
    
    const targetUrl = await new Promise(resolve => {
      rl.question(`Enter target URL for ${domain}: `, answer => {
        resolve(answer.trim());
      });
    });
    
    if (!targetUrl) continue;
    
    const normalizedDomain = domain.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const envVarName = `PROXY_DOMAIN_${normalizedDomain}`;
    
    try {
      console.log(`${colors.dim}Running: vercel env add ${envVarName}${colors.reset}`);
      const command = `echo "${targetUrl}" | vercel env add ${envVarName}`;
      execSync(command, { stdio: 'inherit' });
      console.log(`${colors.green}✓ Added environment variable for ${domain}${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error adding environment variable: ${error.message}${colors.reset}`);
    }
  }
}

// Setup domain map
async function setupDomainMap() {
  const domainMap = {};
  let done = false;
  let counter = 1;
  
  console.log(`\nEnter domain and target URL pairs. When finished, just press Enter for the domain.`);
  
  while (!done) {
    const domain = await new Promise(resolve => {
      rl.question(`\nEnter domain ${counter} (or press Enter to finish): `, answer => {
        resolve(answer.trim());
      });
    });
    
    if (!domain) {
      done = true;
      continue;
    }
    
    const targetUrl = await new Promise(resolve => {
      rl.question(`Enter target URL for ${domain}: `, answer => {
        resolve(answer.trim());
      });
    });
    
    if (targetUrl) {
      domainMap[domain] = targetUrl;
      counter++;
    }
  }
  
  if (Object.keys(domainMap).length === 0) {
    console.log(`${colors.yellow}No domains configured in the map.${colors.reset}`);
    return;
  }
  
  const domainMapJson = JSON.stringify(domainMap);
  
  try {
    console.log(`${colors.dim}Running: vercel env add PROXY_DOMAIN_MAP${colors.reset}`);
    const command = `echo '${domainMapJson}' | vercel env add PROXY_DOMAIN_MAP`;
    execSync(command, { stdio: 'inherit' });
    console.log(`${colors.green}✓ Added domain map with ${Object.keys(domainMap).length} domains${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error adding domain map: ${error.message}${colors.reset}`);
  }
}

// Start the migration
migrateToMultiDomain(); 