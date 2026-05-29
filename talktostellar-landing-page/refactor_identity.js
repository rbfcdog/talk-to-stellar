import fs from 'fs';
import path from 'path';

const componentsDir = path.join(process.cwd(), 'src/components');
const appFile = path.join(process.cwd(), 'src/App.tsx');
const indexCss = path.join(process.cwd(), 'src/index.css');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Base backgrounds
  content = content.replace(/bg-\[#0C1421\]/g, 'bg-[#080808]');
  // Secondary background
  content = content.replace(/bg-\[#162032\]/g, 'bg-[#121212]');
  
  // Cyan to Mustard
  content = content.replace(/(text|bg|border|fill|stroke|shadow|from|to|via)-\[#00D2FF\]/g, '$1-[#E59E25]');
  content = content.replace(/(text|bg|border|fill|stroke|shadow|from|to|via)-\[#4CA1EF\]/g, '$1-[#D48C1C]');
  
  // Green to Mustard for consistency (WhatsApp icons etc can stay green if hardcoded or change to yellow)
  // Let's leave green alone for WhatsApp (#25D366) 
  content = content.replace(/(text|bg|border)-\[#00D87A\]/g, '$1-[#E59E25]');

  // Subtle borders 
  content = content.replace(/border-white\/\[0\.03\]/g, 'border-white/[0.05]');

  fs.writeFileSync(filePath, content, 'utf-8');
}

if (fs.existsSync(componentsDir)) {
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));
  files.forEach(f => replaceInFile(path.join(componentsDir, f)));
}
if (fs.existsSync(appFile)) replaceInFile(appFile);

// Also add the dotted background pattern to index.css
const cssAddition = `
@layer utilities {
  .bg-dotted-pattern {
    background-image: radial-gradient(rgba(0,0,0,0.1) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .dark .bg-dotted-pattern {
    background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
  }
}
`;
if (fs.existsSync(indexCss)) {
  let cssContent = fs.readFileSync(indexCss, 'utf-8');
  if (!cssContent.includes('.bg-dotted-pattern')) {
    fs.writeFileSync(indexCss, cssContent + cssAddition, 'utf-8');
  }
}

console.log('Identity refactored!');
