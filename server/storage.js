import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import path from 'node:path';

export function jsonStore(dir,name,initial={}) {
  let queue=Promise.resolve();
  const load=async()=>{try{return JSON.parse(await readFile(path.join(dir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return structuredClone(initial);throw e;}};
  const update=fn=>{
    const operation=queue.then(async()=>{const data=await load();const result=await fn(data);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,name+'.tmp'),JSON.stringify(data),{mode:0o600});await rename(path.join(dir,name+'.tmp'),path.join(dir,name));return result;});
    queue=operation.catch(()=>{});return operation;
  };
  return {load,update};
}

export function secretStore(dir,env={}) {
  let keyPromise,queue=Promise.resolve();
  async function key() {
    if(env.VAULT_KEY){const bytes=Buffer.from(env.VAULT_KEY,'base64');if(bytes.length!==32)throw Error('VAULT_KEY must be 32 bytes in base64');return bytes;}
    if(!keyPromise)keyPromise=(async()=>{
      await mkdir(dir,{recursive:true});const file=path.join(dir,'vault.key');
      try{return await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
      const bytes=randomBytes(32);
      try{await writeFile(file,bytes,{flag:'wx',mode:0o600});return bytes;}catch(e){if(e.code==='EEXIST')return readFile(file);throw e;}
    })();return keyPromise;
  }
  async function load() {
    let raw;try{raw=JSON.parse(await readFile(path.join(dir,'vault.enc'),'utf8'));}catch(e){if(e.code==='ENOENT')return {settings:{},tokens:{}};throw e;}
    const decipher=createDecipheriv('aes-256-gcm',await key(),Buffer.from(raw.iv,'base64'));
    decipher.setAuthTag(Buffer.from(raw.tag,'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw.data,'base64')),decipher.final()]).toString());
  }
  const update=fn=>{
    const operation=queue.then(async()=>{
      const data=await load();const result=await fn(data);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',await key(),iv);
      const encrypted=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);
      const output=JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
      await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'vault.tmp'),output,{mode:0o600});await rename(path.join(dir,'vault.tmp'),path.join(dir,'vault.enc'));return result;
    });queue=operation.catch(()=>{});return operation;
  };return {load,update};
}
