'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{literal,shortcutCommand,createShortcut}=require('../scripts/create-shortcut.cjs');
test('shortcut commands quote PowerShell literals and do not change security policy',()=>{
 assert.equal(literal("D:\\千面 O'Brien\\project"),"'D:\\千面 O''Brien\\project'");
 const command=shortcutCommand("D:\\千面 O'Brien\\project");assert(command.includes("$root = 'D:\\千面 O''Brien\\project'"));
 assert(!/Set-ExecutionPolicy|ExecutionPolicy\s+Bypass|Unblock-File|Set-ItemProperty|LowRiskFileTypes/i.test(command));
 assert(command.includes("$arguments = '/d /c"));assert(command.includes('not overwriting it.'));
});
test('Windows shortcut launches only its quoted local fixture, is repeatable and refuses unrelated links',{skip:process.platform!=='win32',timeout:30000},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'facet-shortcut-test-')),root=path.join(temp,"千面 O'Brien space"),marker=path.join(root,'started.txt');fs.mkdirSync(path.join(root,'resources'),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'../resources/facet.ico'),path.join(root,'resources/facet.ico'));
 fs.writeFileSync(path.join(root,'start.cmd'),'@echo off\r\n> "%~dp0started.txt" echo FACET_SHORTCUT_OK\r\nexit /b 0\r\n');
 const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const ps=command=>execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:10000});
 try{
  const link=createShortcut(root);assert.equal(link.WorkingDirectory,root);assert.equal(link.Arguments,'/d /c ""'+path.join(root,'start.cmd')+'""');assert.equal(link.WindowStyle,7);
  assert.deepEqual(createShortcut(root),link);
  ps(`$ErrorActionPreference='Stop'; Start-Process -FilePath ${literal(link.Shortcut)}`);
  const until=Date.now()+8000;while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,100));
  assert.equal(fs.readFileSync(marker,'utf8').trim(),'FACET_SHORTCUT_OK');
  ps(`$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut(${literal(link.Shortcut)});$l.Arguments='/d /c echo other';$l.Save()`);
  assert.throws(()=>createShortcut(root),/not overwriting/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
