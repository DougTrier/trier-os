# Copyright (c) 2026 Doug Trier. SPDX-License-Identifier: MIT.
# Licensed under the MIT License. See LICENSE in the repository root.
# Read-only WinEvent observer for visible console windows during isolated tests.
# Emits process/class identifiers only; it does not capture private window text.
param([Parameter(Mandatory=$true)][string]$OutputFile,[Parameter(Mandatory=$true)][string]$StopFile)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class TrierConsoleObserver {
  delegate void EventProc(IntPtr h,uint ev,IntPtr window,int obj,int child,uint thread,uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint lo,uint hi,IntPtr module,EventProc callback,uint pid,uint tid,uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder text,int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [StructLayout(LayoutKind.Sequential)] struct Message {public IntPtr window;public uint message;public IntPtr wparam,lparam;public uint time;public int x,y;public uint extra;}
  [DllImport("user32.dll")] static extern bool PeekMessage(out Message msg,IntPtr window,uint lo,uint hi,uint remove);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message msg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message msg);
  public static void Run(string output,string stop) {
    EventProc callback=(h,ev,w,obj,child,thread,time)=> {
      if(obj!=0 || child!=0 || !IsWindowVisible(w))return;
      var cls=new StringBuilder(256);GetClassName(w,cls,256);
      string name=cls.ToString();
      if(name!="ConsoleWindowClass" && name!="CASCADIA_HOSTING_WINDOW_CLASS")return;
      uint pid;GetWindowThreadProcessId(w,out pid);
      string process="exited";try{process=Process.GetProcessById((int)pid).ProcessName;}catch{}
      File.AppendAllText(output,DateTime.UtcNow.ToString("O")+"\t"+pid+"\t"+process+"\t"+name+Environment.NewLine);
    };
    var hook=SetWinEventHook(0x8002,0x8002,IntPtr.Zero,callback,0,0,0);
    if(hook==IntPtr.Zero)throw new Exception("Cannot observe window events");
    File.WriteAllText(output,"Observer active: EVENT_OBJECT_SHOW; console classes; UTC timestamps"+Environment.NewLine);
    try {while(!File.Exists(stop)){Message msg;while(PeekMessage(out msg,IntPtr.Zero,0,0,1)){TranslateMessage(ref msg);DispatchMessage(ref msg);}Thread.Sleep(5);}}
    finally{UnhookWinEvent(hook);GC.KeepAlive(callback);File.AppendAllText(output,"Observer stopped"+Environment.NewLine);}
  }
}
'@
[TrierConsoleObserver]::Run($OutputFile,$StopFile)
