import fs from 'fs';
import path from 'path';

const componentsDir = path.join(process.cwd(), 'src/components');
const appFile = path.join(process.cwd(), 'src/App.tsx');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Replace background deep navy
  content = content.replace(/bg-\[#(02050b|020813|07111f|0b141a|0a101a)\]/g, 'bg-[#0C1421]');
  // Replace card navy
  content = content.replace(/bg-\[#(0f172a|1e293b|111827|202c33|111b21|162032|2a3942|182229|334155)\]/g, 'bg-[#162032]');
  // Replace cyan tech
  content = content.replace(/(text|bg|border|shadow)-\[#(22d3ee)\]/g, '$1-[#00D2FF]');
  content = content.replace(/cyan-400/g, '[#00D2FF]');
  // Replace stellar green
  content = content.replace(/(text|bg|border)-\[#(00A884|005c4b|00755f|d9fdd3|004d3f)\]/g, '$1-[#00D87A]');
  content = content.replace(/green-500/g, '[#00D87A]');
  // Replace telegram blue
  content = content.replace(/(text|bg|border)-\[#(4CA1EF|818cf8|53bdeb|2775ca|2775CA)\]/g, '$1-[#4CA1EF]');
  content = content.replace(/indigo-400/g, '[#4CA1EF]');
  content = content.replace(/indigo-500/g, '[#4CA1EF]');
  // Replace secondary text
  content = content.replace(/(text|border)-\[#(8696a0|54656f|667781)\]/g, '$1-[#9BA4B5]');
  content = content.replace(/slate-(300|400|500)/g, '[#9BA4B5]');
  
  // Replace subtle borders
  content = content.replace(/border-white\/(5|10|20)/g, 'border-white/[0.03]');
  
  // Replace rounded borders -> rounded-2xl
  content = content.replace(/rounded-\[2\.5rem\]|rounded-\[3rem\]|rounded-\[2rem\]/g, 'rounded-2xl');
  content = content.replace(/rounded-(3xl|4xl)/g, 'rounded-2xl');
  
  // Actually wait, retaining rounded-full for avatars/icons is important.
  // The rule says "botões, inputs, cards e painéis". 
  
  // Replace shadow
  content = content.replace(/shadow-(xl|2xl|lg|md)/g, 'shadow-[0_4px_24px_rgba(0,0,0,0.2)]');
  
  fs.writeFileSync(filePath, content, 'utf-8');
}

const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));
files.forEach(f => replaceInFile(path.join(componentsDir, f)));
replaceInFile(appFile);
console.log('Done replacement');
