import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {options,scoped,bounded,pluginRoot,languages,language,languageForExtension,resolveLanguage} from '../scripts/common.mjs';
const json=(...parts)=>JSON.parse(readFileSync(resolve(pluginRoot,...parts),'utf8'));
test('JSON batch validates bounds and rejects unknown/duplicate options',()=>{
 const args=['--root',pluginRoot,'--queries','[{"op":"symbols","file":"package.json"}]'];
 assert.equal(options(args).queries.length,1);
 for(const extra of [['--limit','0'],['--limit','201'],['--timeout','0'],['--wat','1'],['--root',pluginRoot],['--language','cobol']])assert.throws(()=>options([...args,...extra]));
 assert.throws(()=>options(['--root',pluginRoot,'--queries','[]']));
 assert.throws(()=>options(['--root',pluginRoot,'--queries',JSON.stringify(Array(21).fill({}))]));
});
test('input file paths cannot escape selected project root',()=>{
 assert.equal(scoped(pluginRoot,'package.json'),resolve(pluginRoot,'package.json'));
 assert.throws(()=>scoped(pluginRoot,'..'),/escapes/);
});
test('output is bounded with explicit truncation',()=>{
 const result=bounded({items:[1,2,3],text:'x'.repeat(5000)},2);
 assert.equal(result.truncated,true);assert.equal(result.result.items.length,2);
 assert.ok(result.result.text.endsWith('[truncated]'));
});
test('one plugin serves TypeScript, Python, Bash and C# from pinned configurations',()=>{
 assert.deepEqual(Object.keys(languages),['bash','csharp','python','typescript']);
 assert.deepEqual(Object.fromEntries(Object.entries(languages).map(([id,c])=>[id,c.name])),{bash:'bash-lsp',csharp:'csharp-lsp',python:'python-lsp',typescript:'typescript-lsp'});
 for(const [id,config] of Object.entries(languages)){
  assert.ok(config.bin&&config.languageId&&config.extensions.length,id);
  if(config.dotnet)assert.match(config.version,/^\d+\.\d+\.\d+$/);
  else{
   const pkg=json('runtime',id,'package.json'),lock=json('runtime',id,'package-lock.json');
   assert.deepEqual(pkg.dependencies,config.deps,id);
   assert.deepEqual(lock.packages[''].dependencies,config.deps,id);
  }
 }
 assert.ok(language('python').runtime.includes('/code-navigation/python-lsp/'));
 assert.throws(()=>language('cobol'),/Unknown language/);
});
test('language is inferred from file extensions and must be unambiguous',()=>{
 for(const [ext,id] of [['.ts','typescript'],['.tsx','typescript'],['.mjs','typescript'],['.py','python'],['.pyi','python'],['.sh','bash'],['.bash','bash'],['.cs','csharp']])assert.equal(languageForExtension(ext),id,ext);
 assert.equal(languageForExtension('.rb'),undefined);
 assert.equal(resolveLanguage({queries:[{op:'symbols',file:'a.py'},{op:'hover',file:'b.pyi'}]}),'python');
 assert.equal(resolveLanguage({language:'csharp',queries:[{op:'workspaceSymbols',query:'X'}]}),'csharp');
 assert.throws(()=>resolveLanguage({queries:[{op:'symbols',file:'a.py'},{op:'symbols',file:'b.ts'}]}),/split the batch/);
 assert.throws(()=>resolveLanguage({queries:[{op:'workspaceSymbols',query:'X'}]}),/--language/);
 assert.throws(()=>resolveLanguage({queries:[{op:'symbols',file:'a.rb'}]}),/Cannot infer/);
});
test('source package and both manifests agree',()=>{
 const pkg=json('package.json');
 for(const folder of ['.codex-plugin','.claude-plugin']){
  const manifest=json(folder,'plugin.json');
  assert.equal(manifest.name,'lsp');assert.equal(manifest.version,pkg.version);
  assert.equal(manifest.skills,'./skills/');
 }
 assert.equal(existsSync(resolve(pluginRoot,'skills','navigate','SKILL.md')),true);
});
test('Codex manifest references a tracked, non-empty program icon',()=>{
 const codex=json('.codex-plugin','plugin.json');
 assert.equal(codex.interface.category,'Developer Tools');
 assert.equal(codex.interface.brandColor,'#0F766E');
 assert.equal(codex.interface.composerIcon,'./assets/lsp-icon.svg');
 assert.equal(codex.interface.logo,codex.interface.composerIcon);
 assert.ok(statSync(resolve(pluginRoot,codex.interface.logo)).size>0);
 assert.match(readFileSync(resolve(pluginRoot,codex.interface.logo),'utf8'),/^<svg/);
 assert.match(readFileSync(resolve(pluginRoot,'ICON-SOURCES.md'),'utf8'),/assets\/lsp-icon.svg/);
});
test('published text contains no machine paths or private project names',()=>{
 for(const file of ['README.md','AGENTS.md','skills/navigate/SKILL.md','.codex-plugin/plugin.json','.claude-plugin/plugin.json','servers/csharp.json','tests/fixtures/fixture.cs']){
  assert.doesNotMatch(readFileSync(resolve(pluginRoot,file),'utf8'),/\/Users\/|TradeInCode|tradeincode|cavazos/i,file);
 }
});
