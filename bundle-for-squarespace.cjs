const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  console.error("Error: dist/index.html not found. Make sure you run 'npm run build' first.");
  process.exit(1);
}

let htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

// Find all CSS links
const cssRegex = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g;
htmlContent = htmlContent.replace(cssRegex, (match, href) => {
  // href is usually like /_astro/index.xxxxx.css
  const filePath = path.join(distDir, href);
  if (fs.existsSync(filePath)) {
    const cssContent = fs.readFileSync(filePath, 'utf-8');
    return `<style>\n${cssContent}\n</style>`;
  }
  return match;
});

// Find all JS modules
const jsRegex = /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g;
htmlContent = htmlContent.replace(jsRegex, (match, src) => {
  const filePath = path.join(distDir, src);
  if (fs.existsSync(filePath)) {
    const jsContent = fs.readFileSync(filePath, 'utf-8');
    return `<script type="module">\n${jsContent}\n</script>`;
  }
  return match;
});

// Find any preloads and remove them (since we inline)
const preloadRegex = /<link[^>]+rel="modulepreload"[^>]*>/g;
htmlContent = htmlContent.replace(preloadRegex, '');

// Output the standalone HTML
const outputPath = path.join(__dirname, 'squarespace-showcase.html');
fs.writeFileSync(outputPath, htmlContent, 'utf-8');

console.log(`Success! Created standalone file at: ${outputPath}`);
