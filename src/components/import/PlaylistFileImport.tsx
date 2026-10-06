"use client";

import { useRef, useState } from "react";
import { importPlaylistFiles } from "@/lib/music/import/library";
import { IMPORT_LIMITS as L } from "@/lib/music/import/limits";
import type { ImportEncoding, ImportReport } from "@/lib/music/import/types";
import type { FileSourceProviderId } from "@/types/music";

const samples = ["playlist.csv", "playlist.json", "playlist.txt"];

export function PlaylistFileImport({ onSaved }: { onSaved?: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [encoding, setEncoding] = useState<ImportEncoding>("auto");
  const [sourceProvider, setSourceProvider] = useState<FileSourceProviderId>("file");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [visibleCount, setVisibleCount] = useState(100);
  const input = useRef<HTMLInputElement>(null);

  async function run(selected: File[], sample = false) {
    setMessage("");
    setSaveMessage("");
    setReport(null);
    setIsSample(sample);
    setVisibleCount(100);
    if (!selected.length || selected.length > L.maxFiles || selected.some((f) => f.size > L.maxFileBytes) || selected.reduce((n, f) => n + f.size, 0) > L.maxBatchBytes) {
      setMessage("请选择 1–10 个文件；每个最多 2 MiB，总大小最多 10 MiB。");
      return;
    }
    setBusy(true);
    try {
      const data = await Promise.all(selected.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), encoding: sample ? "auto" as const : encoding })));
      setReport(importPlaylistFiles(data, { demo: sample, declaredSource: sourceProvider }));
    } catch {
      setMessage("无法读取文件，请检查文件是否可访问后重试。");
    } finally { setBusy(false); }
  }

  async function trySamples() {
    setBusy(true);
    setMessage("");
    try {
      const selected = await Promise.all(samples.map(async (name) => {
        const response = await fetch(`/samples/${name}`);
        if (!response.ok) throw new Error("sample unavailable");
        return new File([await response.arrayBuffer()], name);
      }));
      setFiles(selected);
      if (input.current) input.current.value = "";
      await run(selected, true);
    } catch { setMessage("样例暂时无法读取，请下载样例后手动选择。"); }
    finally { setBusy(false); }
  }

  function exportReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "music-world-collection.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveToLibrary() {
    setSaving(true); setSaveMessage("");
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.set("encoding", encoding);
      form.set("sourceProvider", sourceProvider);
      const response = await fetch("/api/imports/file", { method: "POST", headers: { "X-Music-World": "1" }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "保存失败。");
      setSaveMessage(result.reused ? "这批文件已经保存，无新增重复记录。" : `已保存：新增 ${result.addedTracks} 首歌曲、${result.addedSources} 条来源。`);
      onSaved?.();
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }

  return <section className="import-panel" aria-labelledby="import-heading">
    <div className="panel-heading"><div><p className="eyebrow muted">YOUR PLAYLIST</p><h2 id="import-heading">带上你的歌单</h2></div><span className="privacy-badge">本地预览 · 手动保存</span></div>
    <div className="import-grid">
      <div className="upload-area">
        <span className="upload-icon" aria-hidden="true">↥</span>
        <h3>选择一个，或一起导入</h3>
        <p>同时选择 CSV、JSON、TXT，跨文件合并重复歌曲。</p>
        <label className="playlist-file-picker"><span>选择歌单文件 <span aria-hidden="true">↗</span></span><small>CSV · JSON · TXT</small>
          <input ref={input} id="playlist-files" type="file" aria-label="选择歌单文件" multiple accept=".csv,.json,.txt" disabled={busy || saving} onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setIsSample(false); setReport(null); setMessage(""); }} />
        </label>
        {files.length > 0 && <p className="selected-files">已选 {files.length} 个文件：{files.map((file) => file.name).join("、")}</p>}
        <div className="upload-options"><label htmlFor="source-provider">歌单文件的来源</label><select id="source-provider" value={sourceProvider} disabled={busy || saving}
          onChange={(event) => { setSourceProvider(event.target.value as FileSourceProviderId); setReport(null); setSaveMessage(""); }}>
          <option value="file">未指定平台</option><option value="qqmusic">QQ 音乐</option><option value="netease">网易云音乐</option>
          <option value="kugou">酷狗音乐</option><option value="qishui">汽水音乐</option><option value="spotify">Spotify</option>
        </select></div>
        <div className="upload-options"><label htmlFor="encoding">文件编码</label><select id="encoding" value={encoding} disabled={busy || saving} onChange={(event) => setEncoding(event.target.value as ImportEncoding)}><option value="auto">自动（UTF-8 / BOM）</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option></select></div>
        <button className="primary-button" disabled={busy || saving || files.length === 0} onClick={() => void run(files, isSample)}>{busy ? "正在整理…" : "整理并预览歌单 →"}</button>
        <p className="limit-note">每批最多 5,000 条歌曲记录</p>
      </div>
      <details className="import-help">
        <summary>还没有文件？查看样例与格式 <span aria-hidden="true">＋</span></summary>
        <h3>先让三份样例相遇。</h3>
        <p>以 Let Down、Alison 和 Starless 为例，看看同一首歌如何留下不同来源。</p>
        <button className="sample-button" disabled={busy || saving} onClick={() => void trySamples()}>体验三种格式样例 <span aria-hidden="true">↗</span></button>
        <div className="sample-links">{samples.map((name) => <a key={name} href={`/samples/${name}`} download>{name.split(".")[1].toUpperCase()} ↓</a>)}</div>
        <div className="format-note"><strong>一点格式提示</strong><p>CSV：需要 title、artist 表头。<br />JSON：歌曲对象数组。<br />TXT：每行“艺术家 - 歌名”。</p><p>每个文件 ≤ 2 MiB，每批 ≤ 10 个 / 10 MiB。<br />文字字段 ≤ 500 字符。</p></div>
      </details>
    </div>
    <p className="preview-note">文件先在浏览器预览；点击“保存到我的音乐库”后上传并持久保存。来源平台由你声明，并非平台账号授权；JSON/CSV 中的 provider 列可逐首指定。样例预览不会自动加入你的真实音乐库。</p>
    {message && <div role="alert" className="error-box">{message}</div>}
    {report && <div className="results" aria-live="polite">
      <div className="result-heading"><h3>歌曲集合 {isSample && <span className="demo-badge">Demo Music Library · 样例预览</span>}</h3><button className="export-button" onClick={exportReport}>下载结果 JSON ↓</button></div>
      {!isSample && report.tracks.length > 0 && <div className="save-row"><button className="primary-button" disabled={saving || busy} onClick={() => void saveToLibrary()}>{saving ? "正在保存…" : "保存到我的音乐库"}</button><span role="status">{saveMessage}</span></div>}
      <div className="stats">{[
        ["总记录", report.stats.totalRecords], ["有效记录", report.stats.validRecords], ["合并重复", report.stats.mergedRecords], ["保留歌曲", report.stats.uniqueTracks], ["无效记录", report.stats.invalidRecords],
      ].map(([label, value]) => <div key={label}><strong data-testid={`stat-${label}`}>{value}</strong><span>{label}</span></div>)}</div>
      {!!report.errors.length && <div className="error-box" role="alert"><strong>{report.errors.length} 个问题需要处理</strong><ul>{report.errors.slice(0, 100).map((error, index) => <li key={index}>{error.fileName}{error.row ? ` · 第 ${error.row} 行/项` : ""}：{error.message}</li>)}</ul>{report.errors.length > 100 && <p>此处展示前 100 个问题，完整列表见下载结果。</p>}</div>}
      {!!report.warnings.length && <details className="warning-box"><summary>{report.warnings.length} 条提示（已忽略不支持的来源链接）</summary><ul>{report.warnings.slice(0, 100).map((warning, i) => <li key={i}>{warning.fileName} · {warning.row}：{warning.message}</li>)}</ul></details>}
      {!report.tracks.length ? <p className="empty-result">还没有有效歌曲。修正上方问题后可重新导入。</p> : <>
        <div className="table-scroll"><table><thead><tr><th>歌曲 / 艺术家</th><th>专辑</th><th>版本</th><th>来源</th></tr></thead><tbody>{report.tracks.slice(0, visibleCount).map((track) => <tr key={track.id}><td><strong>{track.title}</strong><span className="artist-name">{track.artists.map((artist) => artist.name).join(" / ")}</span></td><td>{track.album?.name ?? "未提供"}</td><td><span className="version-tag">{track.versionKey === "original" ? "未标注版本" : track.versionKey}</span></td><td><details><summary>{track.sources.length} 条来源</summary><ul>{track.sources.map((source) => <li key={source.id}>{source.fileName} · {source.row} · {source.provider}{source.externalId ? ` · ${source.externalId}` : ""}</li>)}</ul></details></td></tr>)}</tbody></table></div>
        {visibleCount < report.tracks.length && <button className="export-button" onClick={() => setVisibleCount((count) => count + 100)}>继续显示（还有 {report.tracks.length - visibleCount} 首）</button>}
      </>}
    </div>}
  </section>;
}
