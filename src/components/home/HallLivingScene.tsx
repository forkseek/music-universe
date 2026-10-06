"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { hallModules } from "./hall-modules";

export const HALL_HIGH_RES_IMAGE = "/media/scene-hall-2k.webp";
const WIDTH = 2688;
const HEIGHT = 1536;

const vertexSource = [
  "attribute vec2 a_position;",
  "varying vec2 v_uv;",
  "void main() { v_uv = (a_position + 1.0) * .5; gl_Position = vec4(a_position, 0.0, 1.0); }",
].join("\n");

const fragmentSource = [
  "precision highp float;",
  "uniform sampler2D u_scene;",
  "uniform float u_time;",
  "varying vec2 v_uv;",
  "float region(vec2 p, vec2 center, vec2 radius) {",
  "  return 1.0 - smoothstep(.35, 1.0, length((p - center) / radius));",
  "}",
  "vec2 turn(vec2 p, vec2 pivot, float angle) {",
  "  float c = cos(angle); float s = sin(angle);",
  "  return pivot + mat2(c, -s, s, c) * (p - pivot);",
  "}",
  "void main() {",
  "  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);",
  "  float entry = smoothstep(0.0, 1.8, u_time);",
  "  float wave = sin(u_time * 1.23) * .025 * entry;",
  "  float raisedHand = region(p, vec2(.650, .563), vec2(.055, .093));",
  "  vec2 samplePoint = mix(p, turn(p, vec2(.695, .621), wave), raisedHand);",
  "  float restingHand = region(p, vec2(.871, .674), vec2(.042, .063));",
  "  samplePoint = mix(samplePoint, turn(p, vec2(.882, .654), wave * -.28), restingHand);",
  "  vec4 color = texture2D(u_scene, vec2(samplePoint.x, 1.0 - samplePoint.y));",
  "  float highlight = smoothstep(.63, .94, max(color.r, max(color.g, color.b)));",
  "  color.rgb *= 1.0 + highlight * sin(u_time * 1.04) * .012 * entry;",
  "  float bulb = region(p, vec2(.866, .251), vec2(.027, .048));",
  "  float dim = (.5 - .5 * cos(u_time * 1.12)) * .19 * entry;",
  "  color.rgb *= 1.0 - bulb * dim;",
  "  gl_FragColor = color;",
  "}",
].join("\n");

const smallLights = [
  { x: 18.6, y: 15.8, size: 12 }, { x: 21.5, y: 31, size: 7 },
  { x: 18.9, y: 57.7, size: 12 }, { x: 68.6, y: 35.5, size: 11 },
  { x: 60.6, y: 67.2, size: 13 }, { x: 37.2, y: 64, size: 7 },
  { x: 50.3, y: 65.1, size: 6 }, { x: 41.5, y: 9.4, size: 7 },
  { x: 15.3, y: 47, size: 6 }, { x: 22.5, y: 71, size: 4 },
  { x: 71.8, y: 50.5, size: 7 }, { x: 81.7, y: 52.2, size: 7 },
  { x: 71.6, y: 63.1, size: 4 },
];

function shader(gl: WebGLRenderingContext, type: number, source: string) {
  const result = gl.createShader(type);
  if (!result) throw new Error("Scene shader is unavailable.");
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    gl.deleteShader(result);
    throw new Error("Scene shader is unavailable.");
  }
  return result;
}

/** The original shot stays beneath this plate until its texture has decoded. */
export function HallLivingScene({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"loading" | "moving" | "still">("loading");
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!active || !canvas.current) return;
    const surface = canvas.current;
    const image = new Image();
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let closed = false;
    let frame = 0;
    let started = 0;
    let lastPaint = 0;
    let elapsed = 0;
    let previous = 0;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    const shaders: WebGLShader[] = [];
    let observer: ResizeObserver | null = null;
    let time: WebGLUniformLocation | null = null;

    const draw = (now: number) => {
      if (closed || !gl || document.hidden || gl.isContextLost()) return;
      if (!started) { started = now; previous = now; }
      elapsed += Math.min(.05, (now - previous) / 1000);
      previous = now;
      if (now - lastPaint >= 1000 / 30 || motion.matches || !lastPaint) {
        gl.uniform1f(time, motion.matches ? 0 : elapsed);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        lastPaint = now;
      }
      if (!motion.matches) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      previous = performance.now();
      setPaused(document.hidden);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      if (!closed) setMode("still");
    };

    image.onload = () => {
      if (closed) return;
      try {
        gl = surface.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
        if (!gl) throw new Error("Scene motion is unavailable.");
        program = gl.createProgram();
        texture = gl.createTexture();
        buffer = gl.createBuffer();
        if (!program || !texture || !buffer) throw new Error("Scene motion is unavailable.");
        shaders.push(shader(gl, gl.VERTEX_SHADER, vertexSource), shader(gl, gl.FRAGMENT_SHADER, fragmentSource));
        for (const compiled of shaders) gl.attachShader(program, compiled);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Scene motion is unavailable.");
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const attribute = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.uniform1i(gl.getUniformLocation(program, "u_scene"), 0);
        time = gl.getUniformLocation(program, "u_time");
        const resize = () => {
          if (!gl || closed) return;
          const pixels = Math.min(2, devicePixelRatio || 1);
          surface.width = Math.max(1, Math.min(WIDTH, Math.round(surface.clientWidth * pixels)));
          surface.height = Math.max(1, Math.round(surface.width * HEIGHT / WIDTH));
          gl.viewport(0, 0, surface.width, surface.height);
          lastPaint = 0;
          cancelAnimationFrame(frame);
          previous = performance.now();
          draw(previous);
        };
        observer = new ResizeObserver(resize);
        observer.observe(surface);
        surface.addEventListener("webglcontextlost", contextLost);
        document.addEventListener("visibilitychange", restart);
        motion.addEventListener("change", restart);
        resize();
        setMode("moving");
      } catch { setMode("still"); }
      setLoaded(true);
    };
    image.onerror = () => { if (!closed) setLoaded(false); };
    image.decoding = "async";
    image.src = HALL_HIGH_RES_IMAGE;

    return () => {
      closed = true;
      image.onload = null;
      image.onerror = null;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      surface.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", restart);
      motion.removeEventListener("change", restart);
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        for (const compiled of shaders) gl.deleteShader(compiled);
        // This keyed canvas is discarded on exit; release its GPU context too.
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      surface.width = 1;
      surface.height = 1;
    };
  }, [active]);

  return <div className={"mw-hall-living " + (active ? "is-active " : "") + (loaded ? "is-loaded " : "") + (paused ? "is-paused" : "")}
    data-motion-mode={mode} data-scene-resolution="2688x1536" aria-hidden="true">
    <div className="mw-living-still" style={active ? { backgroundImage: "url(" + HALL_HIGH_RES_IMAGE + ")" } : undefined} />
    <canvas ref={canvas} className="mw-living-canvas" width={1} height={1} />
    <div className="mw-hall-breathing">
      {[...hallModules, ...smallLights].map((point, index) => <i key={index} className="mw-breathing-light"
        style={{ left: point.x + "%", top: point.y + "%", width: point.size + "%", "--breath-delay": index * -.37 + "s" } as CSSProperties} />)}
      <i className="mw-floor-breath" />
      <i className="mw-robot-lamp" />
    </div>
  </div>;
}
