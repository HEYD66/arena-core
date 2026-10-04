// Windows-only proxy host. Join a kill-on-close job BEFORE creating the core.
// The unnamed job handle is never inherited; parent stdin is our lifetime lease.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

internal static class ProcessHost {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimit {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {
        public BasicLimit BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimit info, uint length);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    // Retain this handle until process termination. Closing it also kills this host.
    static IntPtr job;
    static string Quote(string value) {
        // Windows argv quoting, including trailing backslashes and literal quotes.
        var b=new System.Text.StringBuilder("\""); int slashes=0;
        foreach(char c in value) {
            if(c=='\\') { slashes++; continue; }
            b.Append('\\', c=='"' ? slashes*2+1 : slashes); slashes=0; b.Append(c);
        }
        b.Append('\\', slashes*2); return b.Append('"').ToString();
    }
    static int Main(string[] args) {
        try {
            if(args.Length!=3 || !System.IO.Path.IsPathRooted(args[0]) || !System.IO.Path.IsPathRooted(args[1]) || !System.IO.Path.IsPathRooted(args[2])) return 64;
            job=CreateJobObject(IntPtr.Zero,null);
            var limit=new ExtendedLimit(); limit.BasicLimitInformation.LimitFlags=0x2000; // KILL_ON_JOB_CLOSE
            if(job==IntPtr.Zero || !SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(typeof(ExtendedLimit))) || !AssignProcessToJobObject(job,Process.GetCurrentProcess().Handle)) {
                Console.Error.WriteLine("FACET_HOST_JOB_FAILED"); return 70;
            }
            // No core may run without a live parent granting the initial lease.
            if(Console.ReadLine()!="START") return 71;
            var watch=new Thread(delegate() {
                try { while(Console.Read()!=-1) {} } catch {} finally { Environment.Exit(0); }
            }); watch.IsBackground=true; watch.Start();
            var core=new Process();
            core.StartInfo=new ProcessStartInfo(args[0],"-d "+Quote(args[1])+" -f "+Quote(args[2])) {
                UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,
                RedirectStandardOutput=true,RedirectStandardError=true
            };
            core.OutputDataReceived+=(s,e)=>{if(e.Data!=null)Console.Out.WriteLine(e.Data);};
            core.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)Console.Error.WriteLine(e.Data);};
            if(!core.Start()) return 72;
            Console.Out.WriteLine("FACET_CORE_PID="+core.Id); Console.Out.Flush();
            core.StandardInput.Close(); core.BeginOutputReadLine(); core.BeginErrorReadLine();
            core.WaitForExit(); return core.ExitCode;
        } catch {
            // Never echo paths, node configuration or raw exceptions containing credentials.
            Console.Error.WriteLine("FACET_HOST_START_FAILED"); return 73;
        }
    }
}
