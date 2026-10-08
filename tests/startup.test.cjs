'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {missingDependencies,prepare}=require('../scripts/prepare-startup.cjs'),project=path.resolve(__dirname,'..');
test('a complete project uses its existing dependencies',()=>assert.deepEqual(missingDependencies(project),[]));
test('a fresh source folder cannot borrow ancestor node_modules and missing lock stops installation',t=>{
 const base=path.join(project,'release');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'startup-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.copyFileSync(path.join(project,'package.json'),path.join(root,'package.json'));const expected=Object.keys({...require('../package.json').dependencies,...require('../package.json').devDependencies});assert.deepEqual(missingDependencies(root).sort(),expected.sort());assert.throws(()=>prepare(root),/缺少 package-lock/);assert(!fs.existsSync(path.join(root,'node_modules')));assert(fs.existsSync(path.join(root,'package.json')));
});
