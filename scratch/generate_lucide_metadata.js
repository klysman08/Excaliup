const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const url = 'https://cdn.jsdelivr.net/npm/lucide-static@0.473.0/tags.json';
  console.log(`Fetching Lucide tags from ${url}...`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const tagsData = await response.json();
    
    const icons = [];
    for (const [name, tags] of Object.entries(tagsData)) {
      icons.push({
        n: name,
        t: tags
      });
    }
    
    // Sort icons alphabetically by name
    icons.sort((a, b) => a.n.localeCompare(b.n));
    
    const outputData = { icons };
    const outputPath = path.join(__dirname, '..', 'lucide_metadata.json');
    
    fs.writeFileSync(outputPath, JSON.stringify(outputData), 'utf8');
    console.log(`Successfully generated ${outputPath} with ${icons.length} icons!`);
  } catch (error) {
    console.error('Failed to generate Lucide metadata:', error);
    process.exit(1);
  }
}

main();
