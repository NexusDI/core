#!/usr/bin/env node

/**
 * Simple script to check npm package name availability
 * Usage: node check-npm-names.js
 */

const https = require('https');

const packageNames = [
  '@nexusdi/core',
  '@nexusdi/container',
  '@nexusdi/di',
  '@nexusdi/framework',
  '@nexusdi/nexus',
  '@nexusdi/injector'
];

function checkPackageName(name) {
  return new Promise((resolve) => {
    const url = `https://registry.npmjs.org/${name}`;
    
    https.get(url, (res) => {
      if (res.statusCode === 404) {
        console.log(`✅ ${name} - AVAILABLE`);
        resolve({ name, available: true });
      } else {
        console.log(`❌ ${name} - TAKEN`);
        resolve({ name, available: false });
      }
    }).on('error', (err) => {
      console.log(`❓ ${name} - ERROR: ${err.message}`);
      resolve({ name, available: false, error: err.message });
    });
  });
}

async function checkAllNames() {
  console.log('Checking npm package name availability...\n');
  
  const results = [];
  
  for (const name of packageNames) {
    const result = await checkPackageName(name);
    results.push(result);
    // Small delay to be nice to npm registry
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 Summary:');
  const available = results.filter(r => r.available);
  const taken = results.filter(r => !r.available);
  
  console.log(`Available: ${available.length}`);
  console.log(`Taken: ${taken.length}`);
  
  if (available.length > 0) {
    console.log('\n🎉 Available names:');
    available.forEach(r => console.log(`  - ${r.name}`));
  }
  
  if (taken.length > 0) {
    console.log('\n🚫 Taken names:');
    taken.forEach(r => console.log(`  - ${r.name}`));
  }
}

checkAllNames().catch(console.error); 