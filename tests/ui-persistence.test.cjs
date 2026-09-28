'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('control window keeps UI preferences (theme, palettes, layout) across restarts',()=>{const src=fs.readFileSync(path.join(__dirname,'../src/main/main.cjs'),'utf8');const m=src.match(/partition:'([^']+)'/);assert(m,'control window partition declared');assert.match(m[1],/^persist:/,'a non-persist partition is in-memory, so localStorage (arena.ui.*) would reset on every launch');});
