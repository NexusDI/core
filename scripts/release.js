#!/usr/bin/env node

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get current version
const currentVersion = packageJson.version;
console.log(`Current version: ${currentVersion}`);

// Parse version components
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Determine release type from command line argument
const releaseType = process.argv[2] || 'patch';
const isFirstRelease = process.argv.includes('--first-release');
const shouldCreateBranch = process.argv.includes('--create-branch');

let newVersion;

if (isFirstRelease) {
  newVersion = currentVersion; // Keep current version for first release
  console.log(`First release - keeping version: ${newVersion}`);
} else {
  switch (releaseType) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }
  console.log(`New version: ${newVersion}`);
}

// Confirm release
const readline = require('node:readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Proceed with release? (y/N): ', (answer) => {
  rl.close();
  
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('Release cancelled.');
    process.exit(0);
  }

  try {
    // Create release branch if requested
    if (shouldCreateBranch) {
      console.log('Creating release branch...');
      const branchName = `release/v${newVersion}`;
      execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
      console.log(`Created branch: ${branchName}`);
    }

    // Update package.json version
    console.log(`Updating version to ${newVersion}...`);
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

    // Run tests
    console.log('Running tests...');
    execSync('npm test', { stdio: 'inherit' });

    // Build the project
    console.log('Building project...');
    execSync('npm run build', { stdio: 'inherit' });

    // Commit changes
    console.log('Committing changes...');
    execSync(`git add .`, { stdio: 'inherit' });
    execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' });

    // Create git tag
    console.log('Creating git tag...');
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

    // Push changes and tags
    console.log('Pushing changes and tags...');
    execSync('git push', { stdio: 'inherit' });
    execSync('git push --tags', { stdio: 'inherit' });

    // Publish to npm (only for local releases)
    if (!shouldCreateBranch) {
      console.log('Publishing to npm...');
      execSync('npm publish --access public', { stdio: 'inherit' });
    }

    console.log(`✅ Successfully prepared release v${newVersion}!`);
    
    if (shouldCreateBranch) {
      console.log(`\n📋 Next steps:`);
      console.log(`1. Create a Pull Request for branch: release/v${newVersion}`);
      console.log(`2. Merge the PR to trigger GitHub Actions release`);
      console.log(`3. GitHub Actions will publish to both npm and GitHub Packages`);
      console.log(`4. Your package will appear in GitHub Packages sidebar! 🎉`);
    } else {
      console.log(`\n📦 Package published directly to npm!`);
    }
  } catch (error) {
    console.error('❌ Release failed:', error.message);
    process.exit(1);
  }
}); 