import { randomBytes } from "node:crypto";
export const runtime = "nodejs";
export function GET() {
  const nonce = randomBytes(24).toString("base64");
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QQ 授权</title><style>html,body{margin:0;height:100%;background:#071016;display:grid;place-content:center}.orbit{width:52px;height:52px;border:1px solid #d7bc8930;border-top-color:#d7bc89;border-radius:50%;animation:spin 1.4s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.orbit{animation:none}}</style><div class="orbit" role="status" aria-label="请返回应用查看 QQ 授权结果"></div><script nonce="${nonce}">history.replaceState(null,'','/api/qq/login/complete');setTimeout(()=>window.close(),900)</script></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none';` } });
}
