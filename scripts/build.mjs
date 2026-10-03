import './check.mjs';
import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
for(const file of [manifest.action.default_popup,manifest.background.service_worker,...manifest.content_scripts.flatMap(c=>c.js)])await readFile('extension/'+file);
const destination='dist/build-'+Date.now();
await mkdir(destination,{recursive:true});
for(const name of ['server','public','extension','package.json','pnpm-lock.yaml','.env.example','README.md','docs'])await cp(name,destination+'/'+name,{recursive:true});
await writeFile(destination+'/BUILD.json',JSON.stringify({version:JSON.parse(await readFile('package.json')).version,extensionVersion:manifest.version,builtAt:new Date().toISOString()},null,2));
console.log('Build ready: '+destination);
