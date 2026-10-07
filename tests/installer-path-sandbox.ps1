param([string]$GuestInput='C:\FacetPathInput',[string]$GuestOutput='C:\FacetPathOutput',[switch]$OfficialUpgrade,[switch]$BrowseExistingProbe)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Net.WebSockets;
using System.Threading;
using System.IO;
public static class FacetInstallerUi {
 public delegate bool EnumCallback(IntPtr hwnd,IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumCallback cb,IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd,EnumCallback cb,IntPtr data);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hwnd,int id);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from,uint to,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern IntPtr VirtualAllocEx(IntPtr process,IntPtr address,UIntPtr size,uint type,uint protection);
 [DllImport("kernel32.dll")] static extern bool WriteProcessMemory(IntPtr process,IntPtr address,byte[] data,UIntPtr size,out UIntPtr written);
 [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr process,IntPtr address,UIntPtr size,uint type);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 // Shell folder-picker messages above WM_USER do not marshal strings across process boundaries.
 // Allocate only this test's selection text in our own installer process; never read process memory.
 public static bool SelectFolder(IntPtr picker,int pid,string path){var process=OpenProcess(0x28,false,pid);if(process==IntPtr.Zero)return false;IntPtr address=IntPtr.Zero;try{var data=Encoding.Unicode.GetBytes(path+"\0");address=VirtualAllocEx(process,IntPtr.Zero,(UIntPtr)data.Length,0x3000,4);UIntPtr written;if(address==IntPtr.Zero||!WriteProcessMemory(process,address,data,(UIntPtr)data.Length,out written))return false;Send(picker,0x467,(IntPtr)1,address);return true;}finally{if(address!=IntPtr.Zero)VirtualFreeEx(process,address,UIntPtr.Zero,0x8000);CloseHandle(process);}}
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
 [StructLayout(LayoutKind.Sequential)] public struct GuiInfo { public uint size,flags;public IntPtr active,focus,capture,menu,moving,caret;public Rect rect; }
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid,ref GuiInfo info);
 public static long Focused(IntPtr hwnd){uint p;var tid=GetWindowThreadProcessId(hwnd,out p);var info=new GuiInfo();info.size=(uint)Marshal.SizeOf(info);GetGUIThreadInfo(tid,ref info);return info.focus.ToInt64();}
 public static bool FocusControl(IntPtr hwnd){uint p;var tid=GetWindowThreadProcessId(hwnd,out p);var own=GetCurrentThreadId();if(!AttachThreadInput(own,tid,true))return false;try{SetFocus(hwnd);return Focused(hwnd)==hwnd.ToInt64();}finally{AttachThreadInput(own,tid,false);}}
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int length);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",CharSet=CharSet.Unicode)] public static extern IntPtr ReadText(IntPtr hwnd,uint msg,IntPtr wp,StringBuilder text,uint flags,uint timeout,out IntPtr result);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,StringBuilder text,int length);
 [DllImport("user32.dll",EntryPoint="SendMessageW",CharSet=CharSet.Unicode)] public static extern IntPtr SendText(IntPtr hwnd,uint msg,IntPtr wp,string text);
 [DllImport("user32.dll",EntryPoint="SendMessageW")] public static extern IntPtr Send(IntPtr hwnd,uint msg,IntPtr wp,IntPtr lp);
 [DllImport("user32.dll",EntryPoint="PostMessageW")] public static extern bool Post(IntPtr hwnd,uint msg,IntPtr wp,IntPtr lp);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int cmd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 public static IntPtr Window(int pid) { IntPtr found=IntPtr.Zero;EnumWindows((hw,d)=>{uint p;GetWindowThreadProcessId(hw,out p);var cls=new StringBuilder(100);GetClassName(hw,cls,cls.Capacity);if(p==pid&&cls.ToString()=="#32770"&&Text(hw).Contains("Facet")){found=hw;return false;}return true;},IntPtr.Zero);return found; }
 public static IntPtr Control(IntPtr parent,int id) { var direct=GetDlgItem(parent,id);if(direct!=IntPtr.Zero)return direct;IntPtr found=IntPtr.Zero;EnumChildWindows(parent,(hw,d)=>{if(GetDlgCtrlID(hw)==id){found=hw;return false;}return true;},IntPtr.Zero);return found; }
 public static string Text(IntPtr hwnd){var s=new StringBuilder(2048);IntPtr result;ReadText(hwnd,0xD,(IntPtr)s.Capacity,s,2,1000,out result);return s.ToString();}
 public static List<object> Inspect(IntPtr parent){var rows=new List<object>();EnumChildWindows(parent,(hw,d)=>{var cls=new StringBuilder(100);GetClassName(hw,cls,cls.Capacity);rows.Add(new {id=GetDlgCtrlID(hw),hwnd=hw.ToInt64(),visible=IsWindowVisible(hw),type=cls.ToString(),text=Text(hw)});return true;},IntPtr.Zero);return rows;}
 public static List<object> Windows(int pid){var rows=new List<object>();EnumWindows((hw,d)=>{uint p;GetWindowThreadProcessId(hw,out p);if(p==pid)rows.Add(new {hwnd=hw.ToInt64(),visible=IsWindowVisible(hw),text=Text(hw)});return true;},IntPtr.Zero);return rows;}
 public static IntPtr NamedWindow(int pid,string title){IntPtr found=IntPtr.Zero;EnumWindows((hw,d)=>{uint p;GetWindowThreadProcessId(hw,out p);if(p==pid&&Text(hw)==title){found=hw;return false;}return true;},IntPtr.Zero);return found;}
 public static string Evaluate(string uri,string command){using(var socket=new ClientWebSocket())using(var timeout=new CancellationTokenSource(20000)){socket.ConnectAsync(new Uri(uri),timeout.Token).GetAwaiter().GetResult();var bytes=Encoding.UTF8.GetBytes(command);socket.SendAsync(new ArraySegment<byte>(bytes),WebSocketMessageType.Text,true,timeout.Token).GetAwaiter().GetResult();var buffer=new byte[65536];while(true){using(var message=new MemoryStream()){WebSocketReceiveResult part;do{part=socket.ReceiveAsync(new ArraySegment<byte>(buffer),timeout.Token).GetAwaiter().GetResult();message.Write(buffer,0,part.Count);}while(!part.EndOfMessage);var text=Encoding.UTF8.GetString(message.ToArray());if(text.Contains("\"id\":1,"))return text;}}}}
}
'@
[FacetInstallerUi]::SetProcessDPIAware()|Out-Null
Add-Type -AssemblyName System.Drawing
$report=@{environment='Windows Sandbox';results=@();errors=@();policy='build/install-path.nsh';probeRegistryGuid='42a2cd2b-8cfb-4bc9-8ef8-74c3961f7460'}
$probeRoot=Join-Path $env:TEMP ('FacetInstallPathTest-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot | Out-Null
$installerName=if($OfficialUpgrade){'Facet-Setup-0.2.4-install-path-x64.exe'}else{'Facet-Install-Path-Validation.exe'}
$exe=Join-Path $probeRoot $installerName
Copy-Item -LiteralPath (Join-Path $GuestInput $installerName) -Destination $exe
$probeGuid='42a2cd2b-8cfb-4bc9-8ef8-74c3961f7460'
$probeInstall=Join-Path $probeRoot 'Chosen Parent\Facet'
$probeDisk=Join-Path $probeRoot 'DDrive'
$process=$null;$window=[IntPtr]::Zero;$mapped=$false;$smokeProcess=$null
function Assert-Task($condition,[string]$message){if(-not $condition){throw $message}}
function Pass-Task([string]$message){$report.results+= $message;Write-Output ('PASS '+$message)}
function Wait-Task([scriptblock]$check,[string]$label,[int]$seconds=30){$until=(Get-Date).AddSeconds($seconds);do{if(& $check){return};Start-Sleep -Milliseconds 100}while((Get-Date)-lt $until);throw ('Timeout: '+$label)}
function Click-Task([IntPtr]$control){Assert-Task ($control -ne [IntPtr]::Zero) 'Control not found';Assert-Task ([FacetInstallerUi]::FocusControl($control)) 'Could not focus action button';Assert-Task ([FacetInstallerUi]::Post($window,0x111,[IntPtr]([FacetInstallerUi]::GetDlgCtrlID($control)),$control)) 'Button dispatch failed'}
function Screenshot-Task([string]$name){[FacetInstallerUi]::ShowWindow($window,5)|Out-Null;[FacetInstallerUi]::SetWindowPos($window,[IntPtr]::Zero,20,20,0,0,0x15)|Out-Null;[FacetInstallerUi]::SetForegroundWindow($window)|Out-Null;Start-Sleep -Milliseconds 250;$rect=New-Object FacetInstallerUi+Rect;[FacetInstallerUi]::GetWindowRect($window,[ref]$rect)|Out-Null;$bitmap=New-Object Drawing.Bitmap ($rect.right-$rect.left),($rect.bottom-$rect.top);$graphics=[Drawing.Graphics]::FromImage($bitmap);try{$graphics.CopyFromScreen($rect.left,$rect.top,0,0,$bitmap.Size)}finally{$graphics.Dispose()};$bitmap.Save((Join-Path $GuestOutput $name),[Drawing.Imaging.ImageFormat]::Png);$bitmap.Dispose()}
function Open-DirectoryPage {
 # The user requested an interactive installation check; show this task's wizard in the sandbox.
 $script:process=Start-Process -FilePath $exe -ArgumentList '/currentuser' -WindowStyle Normal -PassThru
 Wait-Task { $script:window=[FacetInstallerUi]::Window($script:process.Id);$script:window -ne [IntPtr]::Zero } 'installer window'
 $report.window=$window.ToInt64()
 $report.processId=$process.Id
 $report.windowTitle=[FacetInstallerUi]::Text($window)
 $report.initialButton=[FacetInstallerUi]::Control($window,1).ToInt64()
 Wait-Task { [FacetInstallerUi]::Control($window,1) -ne [IntPtr]::Zero } 'first installer page'
 # NSIS creates controls before showing its first page. Do not navigate while initialization hides it.
 Wait-Task { [FacetInstallerUi]::IsWindowVisible($window) } 'visible first installer page'
 [FacetInstallerUi]::SetForegroundWindow($window)|Out-Null
 Start-Sleep -Milliseconds 300
 for($i=0;$i-lt 4;$i++){
  if([FacetInstallerUi]::Control($window,1019)-ne[IntPtr]::Zero){[FacetInstallerUi]::ShowWindow($window,5)|Out-Null;return}
  Click-Task ([FacetInstallerUi]::Control($window,1));Start-Sleep -Milliseconds 400
 }
 throw 'Directory page not reached'
}
function Cancel-Installer {
 if($process -and -not $process.HasExited){[FacetInstallerUi]::Post($window,0x10,[IntPtr]::Zero,[IntPtr]::Zero)|Out-Null;Wait-Task {$process.HasExited} 'cancel installer'}
 $script:process=$null
}
function Set-Directory([string]$value,[bool]$keepFocus=$false){
 $edit=[FacetInstallerUi]::Control($window,1019)
 if($keepFocus){Assert-Task ([FacetInstallerUi]::FocusControl($edit)) 'Could not focus path editor'}
 [FacetInstallerUi]::SendText($edit,0xC,[IntPtr]::Zero,$value)|Out-Null
 if(-not $keepFocus){$browse=[FacetInstallerUi]::Control($window,1001);Assert-Task ([FacetInstallerUi]::FocusControl($browse)) 'Could not move focus out of path editor'}
}
function Installed-DataHashes {
 $hashes=@{}
 foreach($leaf in @('Facet','ArenaCore')){
  $dir=Join-Path $env:APPDATA $leaf
  if(Test-Path -LiteralPath $dir){foreach($file in @(Get-ChildItem -LiteralPath $dir -Recurse -File)){ $hashes[$file.FullName]=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }}
 }
 return $hashes
}
function Eval-App([string]$expression){
 $cmd=@{id=1;method='Runtime.evaluate';params=@{expression=$expression;awaitPromise=$true;returnByValue=$true}}|ConvertTo-Json -Depth 5 -Compress
 $reply=[FacetInstallerUi]::Evaluate($script:appTarget.webSocketDebuggerUrl,$cmd)|ConvertFrom-Json
 Assert-Task (-not $reply.error -and -not $reply.result.exceptionDetails) 'Installed app CDP evaluation failed'
 return $reply.result.result.value
}
function Open-App {
 $portFile=Join-Path $script:smokeData 'DevToolsActivePort'
 if(Test-Path -LiteralPath $portFile){Remove-Item -LiteralPath $portFile}
 $script:smokeProcess=Start-Process -FilePath $script:installedExe -ArgumentList @('--user-data-dir="'+$script:smokeData+'"','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1') -WindowStyle Normal -PassThru
 Wait-Task {Test-Path -LiteralPath $portFile} 'installed app debugger' 45
 $port=[int](Get-Content -LiteralPath $portFile -TotalCount 1)
 Wait-Task { $script:appTarget=@(Invoke-RestMethod ('http://127.0.0.1:'+ $port +'/json/list') | Where-Object {$_.url-match '/src/renderer/index.html'})|Select-Object -First 1;[bool]$script:appTarget } 'installed app real renderer'
 Wait-Task {Eval-App 'typeof bridge !== "undefined"'} 'installed production bridge'
 Assert-Task ($appTarget.url-match 'app.asar') 'Installed app did not load packaged source'
}
function Close-App {
 if($smokeProcess -and -not $smokeProcess.HasExited){$smokeProcess.Refresh();Assert-Task ($smokeProcess.CloseMainWindow()) 'Installed test app normal close failed';Wait-Task {$smokeProcess.HasExited} 'installed test app exit'}
 $script:smokeProcess=$null
}
function Test-OfficialUpgrade {
 Assert-Task (-not @(Get-Process -Name Facet -ErrorAction SilentlyContinue).Count) 'Existing app is running; preserve its sessions and exit before installation'
 $registry='HKCU:\Software\60de22d0-2353-5a0b-a5c8-137814d0b53f'
 $location=(Get-ItemProperty $registry).InstallLocation
 $before=Installed-DataHashes
 $report.originalInstallLocation=$location;$report.originalDataFileCount=$before.Count;$report.identity='official product'
 Open-DirectoryPage
 Assert-Task ([FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019))-eq $location) 'Official installer changed the existing installation path'
 Screenshot-Task 'official-upgrade-path.png'
 Click-Task ([FacetInstallerUi]::Control($window,1))
 Wait-Task { $c=[FacetInstallerUi]::Control($window,1);$c-ne[IntPtr]::Zero-and[FacetInstallerUi]::IsWindowEnabled($c)-and([FacetInstallerUi]::Text($c)-match '完成|Finish') } 'official installation finished' 90
 Screenshot-Task 'official-install-finished.png'
 Click-Task ([FacetInstallerUi]::Control($window,1));Wait-Task {$process.HasExited} 'official installer exit';Assert-Task ($process.ExitCode-eq 0) 'Official installer failed';$script:process=$null
 Assert-Task ((Get-ItemProperty $registry).InstallLocation-eq$location) 'Official registry path mismatch'
 $script:installedExe=Join-Path $location 'Facet.exe'
 Assert-Task (Test-Path -LiteralPath $installedExe) 'Official installed executable missing'
 foreach($file in @('app.asar','mihomo\mihomo.exe','process-host\facet-process-host.exe','facet.ico')){Assert-Task (Test-Path -LiteralPath (Join-Path $location ('resources\'+$file))) ('Missing official resource: '+$file)}
 $report.asarHash=(Get-FileHash -LiteralPath (Join-Path $location 'resources\app.asar')).Hash
 $after=Installed-DataHashes
 Assert-Task ($before.Count-eq$after.Count) 'Installation changed user data file count'
 foreach($file in $before.Keys){Assert-Task ($before[$file]-eq$after[$file]) 'Installation changed existing user data'}
 Pass-Task 'Official installer completed, retained the existing directory/registry and preserved every existing user data file hash'
 $script:smokeData=Join-Path $probeRoot 'isolated-app-data';New-Item -ItemType Directory -Path $smokeData|Out-Null
 Open-App
 $response=Eval-App 'bridge.request("snapshot")';Assert-Task ($response.ok-eq$true) 'Installed production IPC failed'
 Assert-Task (@($response.value.instances | Where-Object {$_.status-ne 'stopped'}).Count-eq 0) 'Unexpected running test session'
 $created=Eval-App 'bridge.request("create", {name:"Install verification", detailed:true, start:false})'
 Assert-Task ($created.ok-eq$true -and $created.value.created-eq$true) 'Installed instance creation failed'
 $createdId=$created.value.id
 $script:window=$smokeProcess.MainWindowHandle
 Screenshot-Task 'official-app-started.png'
 Close-App
 Open-App
 $restart=Eval-App 'bridge.request("snapshot")'
 Assert-Task ($restart.ok-eq$true -and @($restart.value.instances|Where-Object {$_.id-eq$createdId -and $_.name-eq 'Install verification'}).Count-eq 1) 'Installed instance did not persist after restart'
 Close-App
 Pass-Task 'Official installed app loaded packaged renderer and production IPC, created a real isolated configuration, and retained it after normal exit/restart'
 $report.isolatedData=$smokeData
}
try {
 if($BrowseExistingProbe){
  Assert-Task (Test-Path -LiteralPath ('HKCU:\Software\'+$probeGuid)) 'Browse test requires an already verified probe installation'
  $browseParent=Join-Path $probeRoot 'Browse Parent';New-Item -ItemType Directory -Path $browseParent|Out-Null
  Open-DirectoryPage
  $browse=[FacetInstallerUi]::Control($window,1001)
  Assert-Task ([FacetInstallerUi]::FocusControl($browse)) 'Cannot focus Browse'
  [FacetInstallerUi]::Post([FacetInstallerUi]::GetParent($browse),0x111,[IntPtr]1001,$browse)|Out-Null
  Wait-Task {$script:browseWindow=[FacetInstallerUi]::NamedWindow($process.Id,'浏览文件夹');$browseWindow-ne[IntPtr]::Zero} 'real folder selection dialog'
  Wait-Task {[FacetInstallerUi]::IsWindowVisible($browseWindow)-and [FacetInstallerUi]::Control($browseWindow,1)-ne[IntPtr]::Zero} 'folder picker ready'
  Start-Sleep -Milliseconds 1000
  Assert-Task ([FacetInstallerUi]::SelectFolder($browseWindow,$process.Id,$browseParent)) 'Folder picker selection failed'
  Start-Sleep -Milliseconds 500
  $confirm=[FacetInstallerUi]::Control($browseWindow,1)
  Wait-Task {[FacetInstallerUi]::IsWindowEnabled($confirm)} 'folder selection confirmation' 10
  [FacetInstallerUi]::Post($browseWindow,0x111,[IntPtr]1,$confirm)|Out-Null
  Wait-Task {[FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019))-eq (Join-Path $browseParent 'Facet')} 'browse selection appended Facet'
  Screenshot-Task 'browse-selected-parent.png'
  Pass-Task 'Real Browse button opened the Windows folder picker and choosing a parent visibly appended Facet'
  Cancel-Installer
 }elseif($OfficialUpgrade){Test-OfficialUpgrade}else{
 Assert-Task (-not(Test-Path -LiteralPath ('HKCU:\Software\'+$probeGuid))) 'Probe identity already installed; preserve it and choose a fresh identity'
 Assert-Task (-not(Test-Path -LiteralPath 'D:\')) 'This test requires initial no-D sandbox state'
 $originalInstall=Get-ItemProperty 'HKCU:\Software\60de22d0-2353-5a0b-a5c8-137814d0b53f' -ErrorAction SilentlyContinue
 $report.originalInstallLocation=$originalInstall.InstallLocation
 Open-DirectoryPage
 Wait-Task { [FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq 'C:\Facet' } 'C fallback default'
 Screenshot-Task 'default-c.png';Pass-Task 'Without D, the real NSIS directory page defaults to C:\Facet'
 Set-Directory 'C:\';Wait-Task { [FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq 'C:\Facet' } 'root gets child folder'
 Assert-Task ([FacetInstallerUi]::IsWindowEnabled([FacetInstallerUi]::Control($window,1))) 'Install remains disabled after C root normalization'
 Set-Directory (Join-Path $probeRoot 'Typed Parent') $true;Start-Sleep -Milliseconds 1100
 Assert-Task ([FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq (Join-Path $probeRoot 'Typed Parent')) 'Typing was interrupted'
 Set-Directory (Join-Path $probeRoot 'Typed Parent');Wait-Task { [FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq (Join-Path $probeRoot 'Typed Parent\Facet') } 'parent gets child folder'
 Set-Directory (Join-Path $probeRoot 'Already\Facet\');Wait-Task { [FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq (Join-Path $probeRoot 'Already\Facet') } 'existing leaf not doubled'
 Pass-Task 'Root/parent directories get a visible Facet child; typed paths stay editable; existing Facet leaf is not repeated'
 Cancel-Installer
 New-Item -ItemType Directory -Path $probeDisk | Out-Null
 & subst.exe D: $probeDisk;Assert-Task ($LASTEXITCODE -eq 0) 'D drive mapping failed';$mapped=$true
 Open-DirectoryPage;Wait-Task { [FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq 'D:\Facet' } 'D preferred default'
 Screenshot-Task 'default-d.png';Pass-Task 'With a real accessible D drive mapping, a fresh install defaults to D:\Facet'
 Set-Directory (Join-Path $probeRoot 'Chosen Parent');Wait-Task { [FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq $probeInstall } 'chosen path ready'
 Screenshot-Task 'custom-parent.png';Assert-Task (-not(Test-Path -LiteralPath $probeInstall)) 'Folder created prematurely while browsing'
 Click-Task ([FacetInstallerUi]::Control($window,1))
 Wait-Task { Test-Path -LiteralPath (Join-Path $probeInstall 'Facet.exe') } 'actual installed executable' 60
 Wait-Task { $c=[FacetInstallerUi]::Control($window,1);$c-ne[IntPtr]::Zero-and[FacetInstallerUi]::IsWindowEnabled($c)-and([FacetInstallerUi]::Text($c)-match '完成|Finish') } 'installation finished' 60
 Click-Task ([FacetInstallerUi]::Control($window,1));Wait-Task {$process.HasExited} 'finish installer';Assert-Task ($process.ExitCode-eq 0) 'Installation did not exit successfully';$process=$null
 $reg=Get-ItemProperty ('HKCU:\Software\'+$probeGuid);Assert-Task ($reg.InstallLocation-eq$probeInstall) 'Registered install directory mismatch'
 $report.installLocation=$reg.InstallLocation
 $report.asarHash=(Get-FileHash -LiteralPath (Join-Path $probeInstall 'resources\app.asar')).Hash
 Assert-Task (Test-Path -LiteralPath (Join-Path $probeInstall 'resources\mihomo\mihomo.exe')) 'Missing real application resources'
 Pass-Task 'Installing creates the previously absent chosen parent/Facet folder, actual executable/resources and matching registry entry'
 Open-DirectoryPage;Wait-Task { [FacetInstallerUi]::Text([FacetInstallerUi]::Control($window,1019)) -eq $probeInstall } 'upgrade preserves existing path'
 Screenshot-Task 'existing-path.png';Cancel-Installer;Pass-Task 'A subsequent installer run retains the installed custom path even while D is available'
 $after=Get-ItemProperty 'HKCU:\Software\60de22d0-2353-5a0b-a5c8-137814d0b53f' -ErrorAction SilentlyContinue
 Assert-Task ($after.InstallLocation-eq$report.originalInstallLocation) 'Original application registration was changed'
 Pass-Task 'Existing product registration remains unchanged; all installation writes use the separate test identity and directory'
 }
} catch { $report.errors+= $_.Exception.Message;$report.focus=[FacetInstallerUi]::Focused($window);$report.controls=[FacetInstallerUi]::Inspect($window);if($process){$report.windows=[FacetInstallerUi]::Windows($process.Id)};if($window-ne[IntPtr]::Zero -and $process -and -not $process.HasExited){try{Screenshot-Task 'failure.png'}catch{}};Write-Error $_ -ErrorAction Continue }
finally {
 if($smokeProcess -and -not $smokeProcess.HasExited){try{Close-App}catch{$report.errors+='App cleanup: '+$_.Exception.Message}}
 if($process -and -not $process.HasExited){try{$picker=[FacetInstallerUi]::NamedWindow($process.Id,'浏览文件夹');if($picker-ne[IntPtr]::Zero){[FacetInstallerUi]::Post($picker,0x111,[IntPtr]2,[FacetInstallerUi]::Control($picker,2))|Out-Null;Start-Sleep -Milliseconds 300};Cancel-Installer}catch{ $report.errors+= 'Test installer cleanup: '+$_.Exception.Message }}
 if($mapped){& subst.exe D: /D}
 $report.probeDirectory=$probeRoot
 $report.finished=(Get-Date -Format o)
 $reportName=if($BrowseExistingProbe){'browse-validation.json'}elseif($OfficialUpgrade){'official-validation.json'}else{'path-validation.json'}
 $report | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $GuestOutput $reportName) -Encoding UTF8
}
if($report.errors.Count){exit 1}
