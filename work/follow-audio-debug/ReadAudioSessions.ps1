$sessionCode = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace SessionDebug {
 [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
 [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
  [PreserveSig] int EnumAudioEndpoints(int flow,uint state,out object devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
 }
 [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice { [PreserveSig] int Activate(ref Guid id,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object instance); }
 [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IManager {
  [PreserveSig] int GetAudioSessionControl(IntPtr session,uint flags,out object control);
  [PreserveSig] int GetSimpleAudioVolume(IntPtr session,uint flags,out object volume);
  [PreserveSig] int GetSessionEnumerator(out ISessions sessions);
 }
 [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessions {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int GetSession(int index,[MarshalAs(UnmanagedType.IUnknown)]out object control);
 }
 [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IControl {
  [PreserveSig] int GetState(out int state);
  [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)]out string name);
  [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)]string name,ref Guid context);
  [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)]out string path);
  [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)]string path,ref Guid context);
  [PreserveSig] int GetGroupingParam(out Guid grouping);
  [PreserveSig] int SetGroupingParam(ref Guid grouping,ref Guid context);
  [PreserveSig] int RegisterAudioSessionNotification(IntPtr notify);
  [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notify);
  [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);
  [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);
  [PreserveSig] int GetProcessId(out uint pid);
 }
 [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IVolume {
  [PreserveSig] int SetMasterVolume(float value,ref Guid context);
  [PreserveSig] int GetMasterVolume(out float value);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)]bool muted,ref Guid context);
  [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)]out bool muted);
 }
 public static class Sessions {
  public static void Read() {
   var enumerator=(IDevices)new Enumerator(); IDevice device; Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0,1,out device));
   var id=typeof(IManager).GUID;object obj;Marshal.ThrowExceptionForHR(device.Activate(ref id,23,IntPtr.Zero,out obj));
   ISessions sessions;Marshal.ThrowExceptionForHR(((IManager)obj).GetSessionEnumerator(out sessions));int count;sessions.GetCount(out count);
   Console.WriteLine("session_count="+count);
   for(int i=0;i<count;i++) { object item;if(sessions.GetSession(i,out item)!=0)continue;var control=(IControl)item;uint pid;control.GetProcessId(out pid);string name;
    try{name=Process.GetProcessById((int)pid).ProcessName;}catch{continue;}
    if(name.IndexOf("edge",StringComparison.OrdinalIgnoreCase)<0&&name.IndexOf("chrome",StringComparison.OrdinalIgnoreCase)<0&&name.IndexOf("codex",StringComparison.OrdinalIgnoreCase)<0)continue;
    var volume=(IVolume)control;float level;bool muted;int state;volume.GetMasterVolume(out level);volume.GetMute(out muted);control.GetState(out state);
    Console.WriteLine("process="+name+" pid="+pid+" volume="+level+" muted="+muted+" state="+state);
   }
  }
 }
}
'@
Add-Type -TypeDefinition $sessionCode
[SessionDebug.Sessions]::Read()
