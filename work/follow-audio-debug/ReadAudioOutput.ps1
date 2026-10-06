$audioReadCode = @'
using System;
using System.Runtime.InteropServices;
namespace PlaybackDebug {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
    [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out object devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
    [PreserveSig] int Activate(ref Guid id, uint context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float value, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float value, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float value);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float value);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float value, ref Guid context);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float value, ref Guid context);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float value);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float value);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMeter {
    [PreserveSig] int GetPeakValue(out float value);
  }
  public static class Output {
    public static string Read(int role) {
      var enumerator = (IDevices)new Enumerator(); IDevice device;
      int result = enumerator.GetDefaultAudioEndpoint(0, role, out device);
      if (result != 0) return "role="+role+" no_default_output="+result;
      var volumeId = typeof(IVolume).GUID; object volumeObject;
      Marshal.ThrowExceptionForHR(device.Activate(ref volumeId, 23, IntPtr.Zero, out volumeObject));
      var volume = (IVolume)volumeObject; float level; bool mute;
      Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out level)); Marshal.ThrowExceptionForHR(volume.GetMute(out mute));
      var meterId = typeof(IMeter).GUID; object meterObject; float peak=0;
      if (device.Activate(ref meterId, 23, IntPtr.Zero, out meterObject)==0) ((IMeter)meterObject).GetPeakValue(out peak);
      return "role="+role+" volume="+level+" muted="+mute+" peak="+peak;
    }
  }
}
'@
Add-Type -TypeDefinition $audioReadCode
0..2 | ForEach-Object { [PlaybackDebug.Output]::Read($_) }
