$sourceScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ReadAudioOutput.ps1') -Raw
$sourceStart = $sourceScript.IndexOf("@'") + 2
$sourceEnd = $sourceScript.IndexOf("'@", $sourceStart)
$sourceCode = $sourceScript.Substring($sourceStart, $sourceEnd - $sourceStart)
$sourceCode = $sourceCode.Replace('public static string Read(int role) {', @'
public static string RaiseQuietOutput() {
  var enumerator = (IDevices)new Enumerator(); IDevice device;
  Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
  var id=typeof(IVolume).GUID; object volumeObject;
  Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, IntPtr.Zero, out volumeObject));
  var volume=(IVolume)volumeObject; float before; bool muted;
  Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out before));
  Marshal.ThrowExceptionForHR(volume.GetMute(out muted));
  if (before < 0.1f && !muted) {
    var context=Guid.Empty;
    Marshal.ThrowExceptionForHR(volume.SetMasterVolumeLevelScalar(0.3f, ref context));
  }
  float after; Marshal.ThrowExceptionForHR(volume.GetMasterVolumeLevelScalar(out after));
  return "before="+before+" after="+after+" muted="+muted;
}
public static string Read(int role) {
'@)
Add-Type -TypeDefinition $sourceCode
[PlaybackDebug.Output]::RaiseQuietOutput() | Tee-Object -FilePath (Join-Path $PSScriptRoot 'review/output-volume.txt')
