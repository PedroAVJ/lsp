import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Rpc,locate} from '../scripts/query.mjs';
function fake(){
 const child=new EventEmitter(),sent=[];
 child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.stdin={write(data){sent.push(JSON.parse(data.split('\r\n\r\n')[1]));}};
 return {rpc:new Rpc(child,{python:{analysis:{diagnosticMode:'openFilesOnly'}}},process.cwd(),100),child,sent};
}
function frame(msg){const text=JSON.stringify(msg);return Buffer.from('Content-Length: '+Buffer.byteLength(text)+'\r\n\r\n'+text);}
test('symbol locator handles UTF-16, CRLF, ambiguity, bounds',()=>{
 assert.deepEqual(locate('const x = "😀"; foo();',{symbol:'foo'}),{line:0,character:16});
 assert.throws(()=>locate('foo(); foo();',{symbol:'foo'}),/Ambiguous/);
 assert.deepEqual(locate('foo();\r\nfoo();',{symbol:'foo',occurrence:2}),{line:1,character:0});
 assert.throws(()=>locate('a',{line:0,column:1}),/Invalid/);
 assert.throws(()=>locate('longfoo();',{symbol:'foo'}),/missing/);
});
test('RPC parses split/coalesced UTF-8 frames and matches request IDs',async()=>{
 const {rpc}=fake(),a=rpc.request('one',{}),b=rpc.request('two',{});
 const bytes=Buffer.concat([frame({jsonrpc:'2.0',id:2,result:'😀'}),frame({jsonrpc:'2.0',id:1,result:1})]);
 for(let i=0;i<bytes.length;i+=3)rpc.feed(bytes.subarray(i,i+3));
 assert.deepEqual(await Promise.all([a,b]),[1,'😀']);
});
test('RPC answers configuration, denies edits, reports unsupported methods',()=>{
 const {rpc,sent}=fake();
 rpc.receive({id:7,method:'workspace/configuration',params:{items:[{section:'python.analysis'},{section:'missing'}]}});
 assert.deepEqual(sent.at(-1).result,[{diagnosticMode:'openFilesOnly'},null]);
 rpc.receive({id:8,method:'workspace/applyEdit',params:{edit:{}}});
 assert.equal(sent.at(-1).result.applied,false);
 rpc.receive({id:9,method:'evil/execute',params:{}});
 assert.equal(sent.at(-1).error.code,-32601);
});
test('RPC timeout cancels; server errors propagate',async()=>{
 const {rpc,sent}=fake();
 await assert.rejects(rpc.request('slow',{},20),/timeout/);
 assert.equal(sent.at(-1).method,'$/cancelRequest');
 const pending=rpc.request('bad',{});
 rpc.receive({id:2,error:{code:-32602,message:'Bad params'}});
 await assert.rejects(pending,/Bad params/);
});
test('project loading must finish before workspaceReady; diagnostics preserve absence',()=>{
 const {rpc}=fake();
 assert.equal(rpc.workspaceReady,false);assert.equal(rpc.diagnostics.has('file:///a'),false);
 rpc.receive({method:'$/progress',params:{token:1,value:{kind:'begin',title:'Loading 1 project(s)...'}}});
 assert.equal(rpc.workspaceReady,false);
 rpc.receive({method:'$/progress',params:{token:1,value:{kind:'end',message:'OK, 1 project file(s) loaded'}}});
 assert.equal(rpc.workspaceReady,true);
 rpc.receive({method:'textDocument/publishDiagnostics',params:{uri:'file:///a',diagnostics:[]}});
 assert.deepEqual(rpc.diagnostics.get('file:///a'),[]);
});
