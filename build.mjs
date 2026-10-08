import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const files=['index.html','style.css','app.js','sim.js','challenge.js','evolution.js','zombie-policy.js','persistence.js','timeline.js','history-db.js','worker.js'];
await mkdir('dist',{recursive:true});
await Promise.all(files.map(file=>copyFile(file,`dist/${file}`)));
await writeFile('dist/.nojekyll','');
console.log(`Built ${files.length} static files into dist/`);
