import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const dir of ['server','public','extension','scripts','test'])for(const file of await readdir(new URL('../'+dir+'/',import.meta.url))){
  if(!/\.(m?js)$/.test(file))continue;
  const result=spawnSync(process.execPath,['--check',dir+'/'+file],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('All JavaScript syntax checks passed.');
