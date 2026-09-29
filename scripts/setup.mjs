import {mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {languages,language,emit} from './common.mjs';
// Usage: node scripts/setup.mjs [typescript|python|bash|csharp ...]; no argument installs every language.
function install(server){
 const {config,runtime,binary,runtimeSource}=server;
 mkdirSync(runtime,{recursive:true});
 if(!existsSync(binary)){
  let command,args;
  if(config.dotnet){command='dotnet';args=['tool','install',config.dotnet,'--version',config.version,'--tool-path',join(runtime,'tools')];}
  else{
   for(const f of ['package.json','package-lock.json'])copyFileSync(join(runtimeSource,f),join(runtime,f));
   command='npm';args=['ci','--prefix',runtime,'--no-audit','--no-fund','--ignore-scripts'];
  }
  const run=spawnSync(command,args,{stdio:['ignore','inherit','inherit'],timeout:180000});
  if(run.error||run.status!==0)throw run.error??Error('Runtime installation failed: '+run.status);
 }
 if(!existsSync(binary))throw Error('Expected runtime binary missing: '+binary);
 return {language:server.id,ready:true,binary,runtime};
}
const requested=process.argv.slice(2);
const results=[];
for(const id of requested.length?requested:Object.keys(languages)){
 try{results.push(install(language(id)));}
 catch(e){results.push({language:id,ready:false,error:e.message});}
}
emit({plugin:'lsp',results});
if(results.some(r=>!r.ready))process.exitCode=1;
