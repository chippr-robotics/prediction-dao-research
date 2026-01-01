#!/usr/bin/env node

/**
 * Script to detect unused front-end files
 * 
 * This script runs the unimported tool to identify files that are no longer
 * referenced in the main application flows. It excludes test files, scripts,
 * and tooling-specific files.
 * 
 * Usage:
 *   node scripts/detect-unused-files.js
 *   npm run detect:unused
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function separator() {
  console.log('═'.repeat(80));
}

try {
  log('\n🔍 Detecting Unused Front-end Files', 'bright');
  separator();
  
  // Run unimported to detect unused files
  log('\n📊 Running file usage analysis...', 'cyan');
  let output;
  try {
    output = execSync('npx unimported 2>&1', {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
  } catch (error) {
    // unimported exits with status 1 when it finds issues, but still produces output
    output = error.stdout || error.output?.join('') || '';
  }
  
  console.log(output);
  
  // Parse the output to extract details
  const lines = output.split('\n');
  const summaryIndex = lines.findIndex(line => line.includes('summary'));
  
  let unimportedCount = 0;
  let unusedDepsCount = 0;
  let unresolvedCount = 0;
  
  // Extract counts from summary
  for (let i = summaryIndex; i < summaryIndex + 10 && i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('unimported files')) {
      const match = line.match(/:\s*(\d+)/);
      if (match) unimportedCount = parseInt(match[1]);
    } else if (line.includes('unused dependencies')) {
      const match = line.match(/:\s*(\d+)/);
      if (match) unusedDepsCount = parseInt(match[1]);
    } else if (line.includes('unresolved imports')) {
      const match = line.match(/:\s*(\d+)/);
      if (match) unresolvedCount = parseInt(match[1]);
    }
  }
  
  // Generate detailed report
  log('\n📋 Generating Detailed Report...', 'cyan');
  separator();
  
  const reportPath = path.resolve(__dirname, '..', 'UNUSED_FILES_REPORT.md');
  const timestamp = new Date().toISOString().split('T')[0];
  
  let report = `# Unused Front-end Files Report\n\n`;
  report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- **Unimported Files:** ${unimportedCount}\n`;
  report += `- **Unused Dependencies:** ${unusedDepsCount}\n`;
  report += `- **Unresolved Imports:** ${unresolvedCount}\n\n`;
  
  report += `## Analysis Details\n\n`;
  report += `This report was generated using the \`unimported\` tool, which analyzes the codebase to identify:\n\n`;
  report += `1. **Unimported Files**: Source files that exist but are not imported by any other file in the main application flow\n`;
  report += `2. **Unused Dependencies**: npm packages listed in package.json but not imported anywhere\n`;
  report += `3. **Unresolved Imports**: Import statements that cannot be resolved to actual files\n\n`;
  
  report += `### Exclusions\n\n`;
  report += `The analysis automatically excludes:\n`;
  report += `- Test files (\`*.test.js\`, \`*.test.jsx\`, \`*.cy.js\`)\n`;
  report += `- Test directories (\`cypress/\`, \`src/test/\`)\n`;
  report += `- Configuration files (\`vite.config.js\`, \`eslint.config.js\`, etc.)\n`;
  report += `- Build and development tools\n`;
  report += `- Entry points (\`src/main.jsx\`)\n\n`;
  
  // Get detailed list of unused files
  report += `## Unused Files\n\n`;
  
  try {
    let unusedFilesOutput;
    try {
      unusedFilesOutput = execSync('npx unimported --show-unused-files 2>&1', {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });
    } catch (error) {
      // unimported exits with status 1 when it finds issues
      unusedFilesOutput = error.stdout || error.output?.join('') || '';
    }
    
    const fileListStart = unusedFilesOutput.indexOf('unimported files');
    if (fileListStart !== -1) {
      const fileSection = unusedFilesOutput.substring(fileListStart);
      const fileLines = fileSection.split('\n');
      
      if (unimportedCount === 0) {
        report += `✅ **No unused files detected!** All source files are referenced in the main application flow.\n\n`;
      } else {
        report += `The following files were created but are no longer imported or used in the main application flow:\n\n`;
        
        // Parse and categorize files
        const categories = {
          'Components': [],
          'Utilities': [],
          'Hooks': [],
          'Constants': [],
          'IPFS/Metadata': [],
          'Other': [],
        };
        
        for (const line of fileLines) {
          const match = line.match(/\d+\s+│\s+(.+)/);
          if (match) {
            const filePath = match[1].trim();
            const relativePath = filePath.replace(/.*\/frontend\//, '');
            
            if (relativePath.includes('/components/')) {
              categories['Components'].push(relativePath);
            } else if (relativePath.includes('/utils/')) {
              categories['Utilities'].push(relativePath);
            } else if (relativePath.includes('/hooks/')) {
              categories['Hooks'].push(relativePath);
            } else if (relativePath.includes('/constants/')) {
              categories['Constants'].push(relativePath);
            } else if (relativePath.includes('ipfs') || relativePath.includes('metadata')) {
              categories['IPFS/Metadata'].push(relativePath);
            } else {
              categories['Other'].push(relativePath);
            }
          }
        }
        
        // Output categorized files
        for (const [category, files] of Object.entries(categories)) {
          if (files.length > 0) {
            report += `### ${category}\n\n`;
            for (const file of files) {
              report += `- \`${file}\`\n`;
            }
            report += `\n`;
          }
        }
      }
    }
  } catch (error) {
    report += `⚠️ Could not generate detailed file list: ${error.message}\n\n`;
  }
  
  // Get unused dependencies
  report += `## Unused Dependencies\n\n`;
  
  try {
    let unusedDepsOutput;
    try {
      unusedDepsOutput = execSync('npx unimported --show-unused-deps 2>&1', {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
      });
    } catch (error) {
      // unimported exits with status 1 when it finds issues
      unusedDepsOutput = error.stdout || error.output?.join('') || '';
    }
    
    const depsListStart = unusedDepsOutput.indexOf('unused dependencies');
    if (depsListStart !== -1) {
      const depsSection = unusedDepsOutput.substring(depsListStart);
      const depsLines = depsSection.split('\n');
      
      if (unusedDepsCount === 0) {
        report += `✅ **No unused dependencies detected!** All npm packages in package.json are being used.\n\n`;
      } else {
        report += `The following npm packages are listed in package.json but not imported anywhere:\n\n`;
        
        for (const line of depsLines) {
          const match = line.match(/\d+\s+│\s+(.+)/);
          if (match) {
            const dep = match[1].trim();
            report += `- \`${dep}\`\n`;
          }
        }
        report += `\n`;
      }
    }
  } catch (error) {
    report += `⚠️ Could not generate dependency list: ${error.message}\n\n`;
  }
  
  // Add recommendations
  report += `## Recommendations\n\n`;
  
  if (unimportedCount > 0) {
    report += `### File Cleanup\n\n`;
    report += `The identified unused files fall into several categories:\n\n`;
    report += `1. **Legacy/Replaced Components**: Files that were part of old implementations but have been replaced\n`;
    report += `2. **Test-Only Code**: Files that are only used in tests (e.g., QRScanner, IPFS utilities)\n`;
    report += `3. **Barrel Exports**: Index files that export components no longer used\n\n`;
    report += `**Action Items:**\n`;
    report += `- Review each file to confirm it's truly unused and not needed for future features\n`;
    report += `- Files only used in tests should be moved to \`src/test/\` directory or clearly marked\n`;
    report += `- Consider archiving rather than deleting if there's historical value\n`;
    report += `- Update documentation if removing documented components\n\n`;
  }
  
  if (unusedDepsCount > 0) {
    report += `### Dependency Cleanup\n\n`;
    report += `**Action Items:**\n`;
    report += `- Verify that unused dependencies are truly not needed\n`;
    report += `- Remove unused dependencies to reduce bundle size and security surface\n`;
    report += `- Run \`npm uninstall <package>\` for each unused dependency\n\n`;
  }
  
  report += `### CI Integration\n\n`;
  report += `To prevent accumulation of unused files in the future, consider:\n\n`;
  report += `1. **Pre-commit Hook**: Add a warning when committing unused files\n`;
  report += `2. **CI Check**: Add this script to CI pipeline as a non-blocking check\n`;
  report += `3. **Regular Audits**: Schedule monthly reviews of this report\n`;
  report += `4. **Documentation**: Update development guidelines to address file cleanup\n\n`;
  
  report += `## How to Run This Analysis\n\n`;
  report += `\`\`\`bash\n`;
  report += `# From the frontend directory:\n`;
  report += `npm run detect:unused\n\n`;
  report += `# Or manually:\n`;
  report += `npx unimported\n`;
  report += `npx unimported --show-unused-files\n`;
  report += `npx unimported --show-unused-deps\n`;
  report += `\`\`\`\n\n`;
  
  report += `## Configuration\n\n`;
  report += `The analysis is configured via \`.unimportedrc.json\`. Key settings:\n\n`;
  report += `- Entry point: \`src/main.jsx\`\n`;
  report += `- Ignored patterns: Test files, config files, Cypress tests\n`;
  report += `- Respects .gitignore\n\n`;
  
  report += `## Notes\n\n`;
  report += `- This analysis is based on static code analysis and may not catch dynamic imports\n`;
  report += `- Files used only via dynamic imports may appear as "unused"\n`;
  report += `- Always manually verify before deleting files\n`;
  report += `- Consider the context: some files may be intentionally kept for future use\n`;
  
  // Write report to file
  fs.writeFileSync(reportPath, report);
  
  log(`\n✅ Report generated: ${reportPath}`, 'green');
  separator();
  
  // Print summary to console
  log('\n📊 Summary:', 'bright');
  log(`   Unimported Files: ${unimportedCount}`, unimportedCount > 0 ? 'yellow' : 'green');
  log(`   Unused Dependencies: ${unusedDepsCount}`, unusedDepsCount > 0 ? 'yellow' : 'green');
  log(`   Unresolved Imports: ${unresolvedCount}`, unresolvedCount > 0 ? 'red' : 'green');
  
  if (unimportedCount > 0 || unusedDepsCount > 0) {
    log(`\n⚠️  Found ${unimportedCount + unusedDepsCount} items that may need attention.`, 'yellow');
    log(`   Review ${reportPath} for details.`, 'cyan');
  } else {
    log('\n✅ No unused files or dependencies detected!', 'green');
  }
  
  separator();
  log('');
  
} catch (error) {
  log(`\n❌ Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
}
