import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const project = process.cwd();
const sources = process.argv[2] || "D:/AI/ComfyUI/output/video";
const media = path.join(project, "public/media");
const sequence = path.join(media, "music-world-continuous");
const frames = path.join(sequence, "frames");
mkdirSync(frames, { recursive: true });
const clips = ["shot01_music_v3_00001_.mp4", "shot02_robot_run_00001_.mp4", "shot03_light_jump_00001_.mp4"].map((name) => path.join(sources, name));
const movie = path.join(media, "music-world-continuous.mp4");

// The last frame of each preceding shot matches the next shot's first frame.
// Remove the repeated frame, then estimate motion across the whole timeline.
const filter = [
  "[0:v]trim=end_frame=124,setpts=PTS-STARTPTS[a]",
  "[1:v]trim=start_frame=1:end_frame=124,setpts=PTS-STARTPTS[b]",
  "[2:v]trim=start_frame=1:end_frame=124,setpts=PTS-STARTPTS[c]",
  "[a][b][c]concat=n=3:v=1:a=0,format=yuv420p,tpad=stop_mode=clone:stop_duration=0.15,minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:mb_size=16:search_param=24:vsbmc=1:scd=fdiff,trim=duration=15.416667,setpts=PTS-STARTPTS,split=2[film][stills]",
].join(";");
const args = [
  "-hide_banner", "-loglevel", "warning", "-nostats", "-y", "-progress", "pipe:1",
  ...clips.flatMap((clip) => ["-i", clip]), "-filter_complex", filter,
  "-map", "[film]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-g", "6", "-keyint_min", "6", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-fps_mode", "passthrough", movie,
  "-map", "[stills]", "-c:v", "libwebp", "-quality", "86", "-compression_level", "3", "-start_number", "0", "-fps_mode", "passthrough", path.join(frames, "frame-%05d.webp"),
];
console.log("连续动画开始补帧：三段原片 → 60 fps。原始文件保持不变。");
await new Promise((resolve, reject) => {
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  let reported = -1;
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const match = /^frame=(\d+)$/u.exec(line);
      if (!match) continue;
      const step = Math.floor(Number(match[1]) / 60);
      if (step !== reported) { reported = step; console.log(`补帧进度：${match[1]} 帧`); }
    }
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
});

const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", movie], { encoding: "utf8" }));
const frameCount = Number(info.streams[0].nb_frames);
const files = readdirSync(frames).filter((name) => /^frame-\d{5}\.webp$/u.test(name)).sort();
if (files.length !== frameCount || !files.includes(`frame-${String(frameCount - 1).padStart(5, "0")}.webp`)) throw new Error("Incomplete interpolated frame sequence.");
const bytes = files.reduce((total, name) => total + statSync(path.join(frames, name)).size, 0);
const manifest = { version: 1, fps: 60, frameCount, width: info.streams[0].width, height: info.streams[0].height, duration: (frameCount - 1) / 60, pattern: "/media/music-world-continuous/frames/frame-{index}.webp", digits: 5, movie: "/media/music-world-continuous.mp4", sources: clips.map((clip) => path.basename(clip)), interpolation: "motion-compensated", duplicateBoundaryFramesRemoved: 2 };
writeFileSync(path.join(sequence, "timeline.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ fps: manifest.fps, frameCount, duration: manifest.duration, movieBytes: statSync(movie).size, frameBytes: bytes, manifest: "public/media/music-world-continuous/timeline.json" }));
