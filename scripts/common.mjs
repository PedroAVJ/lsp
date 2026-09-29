import {readFileSync, readdirSync, realpathSync, existsSync} from 'node:fs';
import {dirname, resolve, relative, isAbsolute, join, extname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const pluginRoot=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serversDir=join(pluginRoot,'servers');
export const languages=Object.fromEntries(readdirSync(serversDir).filter(f=>f.endsWith('.json')).sort().map(f=>[f.slice(0,-5),JSON.parse(readFileSync(join(serversDir,f),'utf8'))]));
// The runtime directory is keyed by each server's historical name and a hash of
// its exact configuration, so runtimes installed by the former per-language
// plugins stay valid.
export function language(id){
 const config=languages[id];
 if(!config)throw Error('Unknown language: '+id+'. Supported: '+Object.keys(languages).join(', '));
 const runtime=join(homedir(),'.local','share','code-navigation',config.name,createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0,12));
 const binary=join(runtime,config.dotnet?'tools':'node_modules/.bin',config.bin);
 return {id,config,runtime,binary,runtimeSource:join(pluginRoot,'runtime',id)};
}
export function languageForExtension(ext){
 const matches=Object.entries(languages).filter(([,config])=>config.extensions.includes(ext)).map(([id])=>id);
 return matches.length===1?matches[0]:undefined;
}
export function options(args=process.argv.slice(2)){
 const opts={};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--help'){opts.help=true;continue;}
  if(!['--root','--queries','--timeout','--limit','--settings','--language'].includes(args[i]))throw Error('Unknown option: '+args[i]);
  if(args[i+1]===undefined)throw Error('Missing option value');
  const key=args[i].slice(2);if(key in opts)throw Error('Duplicate option: '+key);opts[key]=args[++i];
 }
 if(opts.help)return opts;
 if(!opts.root||!opts.queries)throw Error('--root and --queries are required');
 opts.root=realpathSync(opts.root);
 opts.queries=JSON.parse(opts.queries);
 if(!Array.isArray(opts.queries)||!opts.queries.length||opts.queries.length>20)throw Error('Supply 1–20 queries');
 opts.timeout=Number(opts.timeout??90000);opts.limit=Number(opts.limit??40);
 if(!Number.isInteger(opts.timeout)||opts.timeout<100||opts.timeout>180000)throw Error('timeout must be 100–180000 ms');
 if(!Number.isInteger(opts.limit)||opts.limit<1||opts.limit>200)throw Error('limit must be 1–200');
 opts.settings=opts.settings?JSON.parse(opts.settings):{};
 if(opts.language!==undefined)language(opts.language);
 return opts;
}
// One batch runs one language server. Use --language when given; otherwise
// infer it from the queried files' extensions, which must agree.
export function resolveLanguage(opts){
 if(opts.language)return opts.language;
 const inferred=new Set();
 for(const q of opts.queries){
  if(q&&typeof q.file==='string'){
   const id=languageForExtension(extname(q.file));
   if(!id)throw Error('Cannot infer language for '+q.file+'; pass --language ('+Object.keys(languages).join(', ')+')');
   inferred.add(id);
  }
 }
 if(inferred.size>1)throw Error('One batch uses one language server; split the batch by language: '+[...inferred].join(', '));
 if(!inferred.size)throw Error('Pass --language for a batch without files ('+Object.keys(languages).join(', ')+')');
 return [...inferred][0];
}
export function scoped(root,file){
 if(typeof file!=='string'||!file)throw Error('A file/path is required');
 const full=realpathSync(resolve(root,file)), rel=relative(root,full);
 if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw Error('Path escapes project root');
 return full;
}
export function requireBinary(server){if(!existsSync(server.binary))throw Error('Runtime missing for '+server.id+'. Run: node '+join(pluginRoot,'scripts','setup.mjs')+' '+server.id);}
export function bounded(value,limit){
 let clipped=0;
 function walk(v){
  if(typeof v==='string'&&v.length>1800){clipped++;return v.slice(0,1800)+' … [truncated]';}
  if(Array.isArray(v)){if(v.length>limit)clipped+=v.length-limit;return v.slice(0,limit).map(walk);}
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]));
  return v;
 }
 let result=walk(value);
 if(JSON.stringify(result).length>24000){result={summary:'Result exceeds 24000 characters; narrow the query or reduce --limit',sample:JSON.stringify(result).slice(0,1800)};clipped++;}
 return {result,truncated:clipped>0,omittedOrClipped:clipped};
}
export function emit(value){process.stdout.write(JSON.stringify(value)+'\n');}
