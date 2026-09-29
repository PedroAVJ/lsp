import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {languages,pluginRoot} from '../scripts/common.mjs';
const extension={typescript:'.ts',python:'.py',bash:'.sh',csharp:'.cs'};
for(const [id,config] of Object.entries(languages)){
 test(id+' server resolves definition and references in one batch',{skip:process.env.CODE_NAV_LIVE_TEST!=='1',timeout:180000},()=>{
  const root=resolve(pluginRoot,'tests','fixtures'),file='fixture'+extension[id];
  if(config.dotnet){
   const restore=spawnSync('dotnet',['restore',root+'/Fixture.csproj','--nologo'],{encoding:'utf8',timeout:60000});
   assert.equal(restore.status,0,restore.stderr+restore.stdout);
  }
  const before=readFileSync(resolve(root,file),'utf8');
  const queries=[{op:'inspect',file,symbol:'greet',occurrence:2},{op:'symbols',file}];
  const run=spawnSync(process.execPath,[resolve(pluginRoot,'scripts','query.mjs'),'--root',root,'--queries',JSON.stringify(queries),'--timeout','60000'],{encoding:'utf8',timeout:175000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const out=JSON.parse(run.stdout),inspection=out.results[0].result;
  assert.equal(out.language,id);
  assert.ok(inspection.definition?.length>0,run.stdout);
  assert.ok(inspection.references?.length>=2,run.stdout);
  assert.ok(out.results[1].result?.length>0,run.stdout);
  assert.equal(readFileSync(resolve(root,file),'utf8'),before,'navigation must not edit source');
 });
}
