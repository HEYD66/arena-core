'use strict';
// Project-local entry only; no execution-policy / registry changes or file-type exemptions.
const path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const literal=value=>"'"+String(value).replace(/'/g,"''")+"'";
function shortcutCommand(root){return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = ${literal(root)}
$launcher = Join-Path $root 'start.cmd'
$icon = Join-Path $root 'resources\\facet.ico'
if (!(Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'start.cmd is missing' }
if (!(Test-Path -LiteralPath $icon -PathType Leaf)) { throw 'Facet icon is missing' }
$target = Join-Path $env:SystemRoot 'System32\\cmd.exe'
$arguments = '/d /c ""' + $launcher + '""'
$linkPath = Join-Path $root 'Facet.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
if ((Test-Path -LiteralPath $linkPath) -and ($link.TargetPath -ne $target -or $link.Arguments -ne $arguments)) { throw 'Facet.lnk already points elsewhere; not overwriting it.' }
$link.TargetPath = $target
$link.Arguments = $arguments
$link.WorkingDirectory = $root
$link.IconLocation = $icon + ',0'
$link.Description = 'Start Facet from this project'
$link.WindowStyle = 7
$link.Save()
$check = $shell.CreateShortcut($linkPath)
if ($check.TargetPath -ne $target -or $check.Arguments -ne $arguments -or $check.WorkingDirectory -ne $root) { throw 'Shortcut verification failed' }
[pscustomobject]@{ Shortcut = $linkPath; Target = $check.TargetPath; Arguments = $check.Arguments; WorkingDirectory = $check.WorkingDirectory; WindowStyle = $check.WindowStyle } | ConvertTo-Json
`;}
function createShortcut(root=path.resolve(__dirname,'..')){
 if(process.platform!=='win32')throw Error('Facet shortcuts are Windows-only');
 for(const relative of ['start.cmd','resources/facet.ico'])if(!fs.existsSync(path.join(root,relative)))throw Error('Missing '+relative);
 const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 return JSON.parse(execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',shortcutCommand(root)],{encoding:'utf8',windowsHide:true,timeout:15000}));
}
if(require.main===module){try{console.log(JSON.stringify(createShortcut(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={literal,shortcutCommand,createShortcut};
