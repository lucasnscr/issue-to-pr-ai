import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const directory=new URL('../docs/product/',import.meta.url);
let html=readFileSync(new URL('index.html',directory),'utf8');
html=html.replace('<link rel="stylesheet" href="product.css">','<style>'+readFileSync(new URL('product.css',directory),'utf8')+'</style>');
for(const name of ['phases.js','product.js','guide.js','guide-ui.js']){
  const source=readFileSync(new URL(name,directory),'utf8');
  html=html.replace('<script src="'+name+'" defer></script>','<script defer>'+source.replaceAll('</script','<\\/script')+'</script>');
}
// Inline classic scripts execute immediately; move them after the document body.
const scripts=[...html.matchAll(/<script defer>[\s\S]*?<\/script>/g)].map(match=>match[0].replace('<script defer>','<script>'));
html=html.replace(/<script defer>[\s\S]*?<\/script>/g,'').replace('</body>',scripts.join('\n')+'</body>');
const output=resolve(process.argv[2]||new URL('../artifacts/product-guide.html',import.meta.url).pathname);
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,html);console.log(output);
