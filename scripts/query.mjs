import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {extname,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {options,resolveLanguage,language,languages,scoped,requireBinary,bounded,emit} from './common.mjs';

export function locate(text,q){
 const lines=text.split(/\r?\n/);
 let line=q.line,column=q.column;
 if(q.symbol!==undefined){
  if(typeof q.symbol!=='string'||!q.symbol)throw Error('symbol must be nonempty');
  const hits=[];
  for(let l=0;l<lines.length;l++){
   let from=0,index;
   while((index=lines[l].indexOf(q.symbol,from))!==-1){
    // Reject identifier substrings, while permitting operators/member expressions.
    const before=lines[l][index-1]??'',after=lines[l][index+q.symbol.length]??'';
    if(!/[\p{L}\p{N}_$]/u.test(before)&&!/[\p{L}\p{N}_$]/u.test(after))hits.push({line:l+1,column:index+1});
    from=index+q.symbol.length;
   }
  }
  if(q.occurrence===undefined&&hits.length!==1)throw Error('Ambiguous/missing symbol; supply occurrence (1-based) or line/column. Hits: '+JSON.stringify(hits.slice(0,20)));
  const hit=hits[(q.occurrence??1)-1];if(!hit)throw Error('Symbol occurrence not found');
  ({line,column}=hit);
 }
 if(!Number.isInteger(line)||!Number.isInteger(column)||line<1||line>lines.length||column<1||column>lines[line-1].length+1)throw Error('Invalid 1-based line/column (UTF-16 code units)');
 return {line:line-1,character:column-1};
}
export class Rpc {
 constructor(child,settings,root,timeout){
  this.child=child;this.settings=settings;this.root=root;this.timeout=timeout;
  this.progress=new Map();this.workspaceReady=false;this.messages=[];
  this.buffer=Buffer.alloc(0);this.pending=new Map();this.diagnostics=new Map();this.next=0;this.stderr='';
  child.stdout.on('data',b=>{try{this.feed(b);}catch(e){this.fail(e);}});
  child.stderr.on('data',b=>{this.stderr=(this.stderr+b).slice(-3000);});
  child.on('error',e=>this.fail(e));
  child.on('exit',(code,signal)=>this.fail(Error('Language server exited: '+(signal??code)+' '+this.stderr)));
 }
 fail(error){this.error=error;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
 send(body){this.child.stdin.write('Content-Length: '+Buffer.byteLength(JSON.stringify(body))+'\r\n\r\n'+JSON.stringify(body));}
 notify(method,params){this.send({jsonrpc:'2.0',method,params});}
 request(method,params,timeout=this.timeout){
  if(this.error)return Promise.reject(this.error);
  const id=++this.next;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);this.notify('$/cancelRequest',{id});reject(Error('LSP timeout: '+method));},timeout);
   this.pending.set(id,{resolve,reject,timer});this.send({jsonrpc:'2.0',id,method,params});
  });
 }
 feed(bytes){
  this.buffer=Buffer.concat([this.buffer,bytes]);
  if(this.buffer.length>32*1024*1024)throw Error('LSP frame exceeds 32 MB');
  while(true){
   const end=this.buffer.indexOf('\r\n\r\n');if(end<0)return;
   const match=/Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0,end).toString());
   if(!match)throw Error('Invalid LSP framing');
   const length=Number(match[1]);if(length>32*1024*1024)throw Error('LSP frame exceeds 32 MB');
   if(this.buffer.length<end+4+length)return;
   const msg=JSON.parse(this.buffer.subarray(end+4,end+4+length).toString());
   this.buffer=this.buffer.subarray(end+4+length);this.receive(msg);
  }
 }
 receive(msg){
  if(msg.method==='$/progress'){
   const {token,value}=msg.params;
   if(value.kind==='begin')this.progress.set(token,value.title);
   if(value.kind==='end'&&/Loading (?:solution|\d+ project)/.test(this.progress.get(token)??'')){
    if(/could not|failed/i.test(value.message??''))this.fail(Error(value.message));
    else this.workspaceReady=true;
   }
   return;
  }
  if(['window/logMessage','window/showMessage'].includes(msg.method)){
   if(msg.params.type<=2||/msbuildWorkspace.Diagnostics|could not|no or .csproj/i.test(msg.params.message??''))this.messages.push(msg.params.message);
   if(this.messages.length>12)this.messages.shift();
   return;
  }
  if(msg.method&&msg.id!==undefined){
   let result=null;
   if(msg.method==='workspace/configuration')result=(msg.params.items??[]).map(x=>x.section?x.section.split('.').reduce((v,k)=>v?.[k],this.settings)??null:this.settings);
   else if(msg.method==='workspace/workspaceFolders')result=[{uri:pathToFileURL(this.root).href,name:this.root.split('/').at(-1)}];
   else if(msg.method==='workspace/applyEdit')result={applied:false,failureReason:'Read-only navigation client'};
   else if(!['client/registerCapability','client/unregisterCapability','window/workDoneProgress/create','window/showMessageRequest'].includes(msg.method)){
    this.send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Client method not supported'}});return;
   }
   this.send({jsonrpc:'2.0',id:msg.id,result});return;
  }
  if(msg.method==='textDocument/publishDiagnostics'){this.diagnostics.set(msg.params.uri,msg.params.diagnostics);return;}
  if(msg.id!==undefined){
   const p=this.pending.get(msg.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(msg.id);
   msg.error?p.reject(Error(msg.error.message+' (LSP '+msg.error.code+')')):p.resolve(msg.result);
  }
 }
}
function display(value,root){
 if(Array.isArray(value))return value.map(x=>display(x,root));
 if(value&&typeof value==='object'){
  const out={};
  for(const [k,v]of Object.entries(value)){
   if((k==='uri'||k==='targetUri')&&typeof v==='string'&&v.startsWith('file:')){const p=fileURLToPath(v),r=relative(root,p);out[k]=(r.startsWith('../')?p:r);}
   else if(k==='line'&&typeof v==='number')out.line=v+1;
   else if(k==='character'&&typeof v==='number')out.column=v+1;
   else out[k]=display(v,root);
  }
  return out;
 }
 return value;
}
const methodMap={definition:['textDocument/definition','definitionProvider'],references:['textDocument/references','referencesProvider'],hover:['textDocument/hover','hoverProvider'],implementation:['textDocument/implementation','implementationProvider'],typeDefinition:['textDocument/typeDefinition','typeDefinitionProvider'],symbols:['textDocument/documentSymbol','documentSymbolProvider'],workspaceSymbols:['workspace/symbol','workspaceSymbolProvider']};
export async function main(){
 const opts=options();
 if(opts.help){emit({usage:'node scripts/query.mjs --root PROJECT --queries JSON [--language LANGUAGE] [--timeout 90000] [--limit 40] [--settings JSON]',languages:Object.fromEntries(Object.entries(languages).map(([id,c])=>[id,c.extensions])),language:'Inferred from the queried file extensions; required for a batch of only workspaceSymbols. One batch runs one language server.',queries:[{op:'symbols',file:'relative/file'},{op:'inspect',file:'relative/file',symbol:'exactIdentifier',occurrence:1},{op:'definition',file:'relative/file',line:1,column:1},{op:'workspaceSymbols',query:'Name'},{op:'diagnostics',file:'relative/file'}],operations:[...Object.keys(methodMap),'inspect','diagnostics'],coordinates:'1-based UTF-16; symbol occurrence avoids counting columns',limits:'1–20 queries; timeout per LSP request; total batch deadline 180 seconds',readOnly:true});return;}
 const server=language(resolveLanguage(opts)),{config,binary}=server;
 requireBinary(server);
 // Validate every query before launching a language server.
 const prepared=opts.queries.map(q=>{
  if(!q||!['inspect','diagnostics',...Object.keys(methodMap)].includes(q.op))throw Error('Unsupported operation');
  if(q.op==='workspaceSymbols'){if(typeof q.query!=='string'||!q.query)throw Error('workspaceSymbols requires a nonempty query');return q;}
  const file=scoped(opts.root,q.file);
  if(!config.extensions.includes(extname(file)))throw Error('File extension not supported by the '+server.id+' server');
  const text=readFileSync(file,'utf8');if(Buffer.byteLength(text)>2*1024*1024)throw Error('Document exceeds 2 MB');
  return {...q,file,text,uri:pathToFileURL(file).href,position:['symbols','diagnostics'].includes(q.op)?null:locate(text,q)};
 });
 const settings={...opts.settings};
 if(config.name==='python-lsp')settings.python={analysis:{diagnosticMode:'openFilesOnly',autoSearchPaths:true,...settings.python?.analysis},...settings.python};
 if(config.name==='bash-lsp')settings.bashIde={...settings.bashIde,shellcheckPath:'',shfmt:{path:''}};
 const child=spawn(binary,config.args,{cwd:opts.root,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',env:{...process.env,NODE_OPTIONS:'--max-old-space-size=768',DOTNET_CLI_TELEMETRY_OPTOUT:'1'}});
 child.stdin.on('error',()=>{});
 const rpc=new Rpc(child,settings,opts.root,opts.timeout);
 function kill(signal){try{process.platform==='win32'?child.kill(signal):process.kill(-child.pid,signal);}catch{}}
 const interrupt=()=>{kill('SIGKILL');process.exit(130);};
 process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
 const deadline=setTimeout(()=>{rpc.fail(Error('180-second batch deadline exceeded'));kill('SIGKILL');},180000);
 const started=Date.now(),results=[];
 try{
  const rootUri=pathToFileURL(opts.root).href;
  const initialized=await rpc.request('initialize',{processId:process.pid,rootUri,rootPath:opts.root,workspaceFolders:[{uri:rootUri,name:opts.root.split('/').at(-1)}],capabilities:{window:{workDoneProgress:true},general:{positionEncodings:['utf-16']},workspace:{configuration:true,workspaceFolders:true},textDocument:{hover:{contentFormat:['plaintext']},documentSymbol:{hierarchicalDocumentSymbolSupport:true},publishDiagnostics:{versionSupport:true}}}});
  const capabilities=initialized.capabilities??{};
  if(capabilities.positionEncoding&&capabilities.positionEncoding!=='utf-16')throw Error('Unsupported server position encoding: '+capabilities.positionEncoding);
  rpc.notify('initialized',{});rpc.notify('workspace/didChangeConfiguration',{settings});
  async function waitUntil(predicate,label){
   const end=Date.now()+opts.timeout;
   while(!predicate()&&Date.now()<end){if(rpc.error)throw rpc.error;await new Promise(r=>setTimeout(r,50));}
   if(!predicate())throw Error('Timed out waiting for '+label+'. '+rpc.messages.join('; '));
  }
  if(config.name==='csharp-lsp')await waitUntil(()=>rpc.workspaceReady,'C# project loading');
  const opened=new Set();
  for(const q of prepared){
   if(q.uri&&!opened.has(q.uri)){
    const ext=extname(q.file),languageId=ext==='.tsx'?'typescriptreact':ext==='.jsx'?'javascriptreact':['.js','.mjs','.cjs'].includes(ext)?'javascript':config.languageId;
    rpc.notify('textDocument/didOpen',{textDocument:{uri:q.uri,languageId,version:1,text:q.text}});opened.add(q.uri);
    if(config.name==='bash-lsp')await waitUntil(()=>rpc.diagnostics.has(q.uri),'Bash document analysis');
   }
  }
  async function execute(q,op){
   if(op==='diagnostics'){
    const end=Date.now()+Math.min(opts.timeout,15000);
    while(!rpc.diagnostics.has(q.uri)&&Date.now()<end){if(rpc.error)throw rpc.error;await new Promise(r=>setTimeout(r,100));}
    return rpc.diagnostics.has(q.uri)?{status:'received',items:rpc.diagnostics.get(q.uri)}:{status:'not-received',items:null,note:'No diagnostic publication before timeout; this is not a clean bill of health.'};
   }
   const [method,cap]=methodMap[op];
   if(!capabilities[cap])return {status:'unsupported',operation:op};
   const params=op==='workspaceSymbols'?{query:q.query}:{textDocument:{uri:q.uri},...(q.position?{position:q.position}:{}),...(op==='references'?{context:{includeDeclaration:true}}:{})};
   return rpc.request(method,params);
  }
  for(let index=0;index<prepared.length;index++){
   const q=prepared[index];
   try{
    let value;
    if(q.op==='inspect'){
     value={};
     for(const op of ['definition','references','hover']){try{value[op]=await execute(q,op);}catch(e){value[op]={error:e.message};}}
    }else value=await execute(q,q.op);
    results.push({index,op:q.op,...bounded(display(value,opts.root),opts.limit)});
   }catch(e){results.push({index,op:q.op,error:e.message});}
  }
  emit({plugin:'lsp',language:server.id,root:opts.root,coordinates:'1-based UTF-16',elapsedMs:Date.now()-started,...(rpc.messages.length?{serverWarnings:rpc.messages}:{}),results});
  if(results.some(x=>x.error||JSON.stringify(x.result).includes('"error":')))process.exitCode=1;
 }finally{
  clearTimeout(deadline);
  try{await rpc.request('shutdown',null,1500);rpc.notify('exit');}catch{}
  kill('SIGTERM');
  await new Promise(r=>setTimeout(r,100));
  kill('SIGKILL');
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(e=>{emit({error:e.message});process.exitCode=1;});
