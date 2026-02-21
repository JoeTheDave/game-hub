#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createInterface } from 'readline';

// Color functions for console output
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`, 
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
};

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function execCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    return result ? result.trim() : '';
  } catch (error) {
    if (options.allowError) {
      return null;
    }
    throw error;
  }
}

function createReadlineInterface() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function getAppNameFromFlyToml() {
  try {
    const flyToml = readFileSync('fly.toml', 'utf8');
    const appMatch = flyToml.match(/^app\s*=\s*"([^"]+)"/m);
    
    if (!appMatch) {
      log('❌', colors.red('Could not find app name in fly.toml'));
      process.exit(1);
    }
    
    return appMatch[1];
  } catch (error) {
    log('❌', colors.red('Could not read fly.toml'));
    process.exit(1);
  }
}

async function promptUser(question) {
  const rl = createReadlineInterface();
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}


async function checkPrerequisites() {
  log('🔍', 'Checking deployment prerequisites...');
  
  // Check if Fly CLI is installed
  try {
    execCommand('fly version', { silent: true });
    log('✅', colors.green('Fly CLI detected'));
  } catch (error) {
    log('❌', colors.red('Fly CLI not found'));
    log('📖', 'Install Fly CLI: https://fly.io/docs/getting-started/installing-flyctl/');
    process.exit(1);
  }
  
  // Check if user is logged in
  try {
    const whoami = execCommand('fly auth whoami', { silent: true });
    log('✅', colors.green(`Logged in as ${whoami}`));
  } catch (error) {
    log('❌', colors.red('Not logged into Fly.io'));
    log('🔑', 'Please login first: fly auth login');
    process.exit(1);
  }
}

async function getDatabaseUrl() {
  // Check if .env.production exists
  if (existsSync('.env.production')) {
    try {
      const envContent = readFileSync('.env.production', 'utf8');
      const databaseMatch = envContent.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
      if (databaseMatch) {
        log('✅', colors.green('Production DATABASE_URL found in .env.production'));
        return databaseMatch[1];
      }
    } catch (error) {
      // File exists but couldn't read it
    }
  }
  
  // Check if DATABASE_URL is already set as a Fly secret (use app from fly.toml)
  try {
    const appName = getAppNameFromFlyToml();
    const secrets = execCommand(`fly secrets list -a ${appName}`, { silent: true });
    if (secrets && secrets.includes('DATABASE_URL')) {
      log('✅', colors.green('DATABASE_URL already set as Fly secret'));
      return 'ALREADY_SET';
    }
  } catch (error) {
    // Fly secrets command failed (e.g. app doesn't exist yet), continue
  }
  
  // Prompt user for PostgreSQL instance and create database
  log('❓', colors.yellow('Production database URL not found'));
  return await setupDatabaseOnExistingInstance();
}

async function setupDatabaseOnExistingInstance() {
  console.log('Enter your PostgreSQL instance connection details:');
  console.log('Example: postgres://postgres:password@your-host.flycast:5432');
  const baseUrl = await promptUser(': ');
  
  if (!baseUrl) {
    log('❌', colors.red('PostgreSQL URL is required'));
    process.exit(1);
  }
  
  // Basic validation
  if (!baseUrl.startsWith('postgresql://') && !baseUrl.startsWith('postgres://')) {
    log('❌', colors.red('URL should start with postgresql:// or postgres://'));
    process.exit(1);
  }
  
  // Get app name for database name
  const appName = getAppNameFromFlyToml();
  const dbName = appName.replace(/-/g, '_'); // Database names prefer underscores
  
  // Construct the full database URL with SSL parameters for production
  let databaseUrl = baseUrl.endsWith('/postgres') ? 
    baseUrl.replace('/postgres', `/${dbName}`) : 
    `${baseUrl}/${dbName}`;
  
  // Add SSL parameters for Fly.io PostgreSQL connections
  // Fly.io internal network is already encrypted, so disable SSL to avoid double encryption
  if (databaseUrl.includes('.flycast:')) {
    databaseUrl += '?sslmode=disable';
  }
  
  log('🗄️', `Creating database "${dbName}" in PostgreSQL instance...`);
  
  try {
    // Try to create the database
    const createDbCommand = `psql "${baseUrl}/postgres" -c "CREATE DATABASE ${dbName};"`;
    execCommand(createDbCommand, { silent: true, allowError: true });
    
    log('✅', colors.green(`Database "${dbName}" created successfully`));
    log('🔗', colors.blue(`Full DATABASE_URL: ${databaseUrl}`));
    
    return databaseUrl;
    
  } catch (error) {
    log('⚠️', colors.yellow(`Database "${dbName}" may already exist or creation failed`));
    log('🔗', colors.blue(`Using DATABASE_URL: ${databaseUrl}`));
    return databaseUrl;
  }
}

async function createFlyApp() {
  log('🚀', 'Creating Fly.io application...');
  
  const appName = getAppNameFromFlyToml();
  
  try {
    execCommand(`fly apps create ${appName}`);
    log('✅', colors.green(`Fly app "${appName}" created successfully`));
  } catch (error) {
    // Check if app already exists and user owns it
    try {
      const userApps = execCommand('fly apps list', { silent: true });
      if (userApps.includes(appName)) {
        log('✅', colors.green(`Fly app "${appName}" already exists and is owned by you`));
        return;
      }
    } catch (listError) {
      // Ignore error checking ownership
    }
    
    // If we get here, either the app creation failed or it's owned by someone else
    log('❌', colors.red('Failed to create Fly app'));
    log('💡', colors.yellow('If the app name is taken, change the "app" name in fly.toml and try again'));
    throw error;
  }
}

async function setDatabaseUrl(databaseUrl) {
  if (!databaseUrl || databaseUrl === 'ALREADY_SET') {
    return;
  }
  
  log('🔗', 'Setting DATABASE_URL secret...');
  
  try {
    execCommand(`fly secrets set DATABASE_URL="${databaseUrl}"`, { silent: true });
    log('✅', colors.green('DATABASE_URL secret set successfully'));
  } catch (error) {
    log('❌', colors.red('Failed to set DATABASE_URL secret'));
    throw error;
  }
}

function isFlyAlreadySetUp() {
  try {
    const appName = getAppNameFromFlyToml();
    const appsList = execCommand('fly apps list', { silent: true, allowError: true });
    if (!appsList || !appsList.includes(appName)) {
      return false;
    }
    const secrets = execCommand(`fly secrets list -a ${appName}`, { silent: true, allowError: true });
    return Boolean(secrets && secrets.includes('DATABASE_URL'));
  } catch {
    return false;
  }
}

async function main() {
  // Skip setup if Fly app already exists and has DATABASE_URL secret (source of truth)
  // Set FORCE_FLY_SETUP=1 to run setup again (e.g. to change database or recreate app)
  if (!process.env.FORCE_FLY_SETUP && isFlyAlreadySetUp()) {
    process.exit(0);
  }

  // First-time deployment setup
  console.log(colors.bold(colors.blue('🚀 First-time deployment setup')));
  
  try {
    await checkPrerequisites();
    const databaseUrl = await getDatabaseUrl();
    await createFlyApp();
    await setDatabaseUrl(databaseUrl);
    
    log('✅', colors.green('Deployment setup completed!'));
    console.log('\n' + colors.green('🎉 Setup complete! Proceeding with deployment...'));
    
  } catch (error) {
    log('❌', colors.red('Setup failed'));
    console.error(error.message);
    process.exit(1);
  }
}

main().catch(console.error);