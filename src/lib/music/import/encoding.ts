import type { ImportEncoding } from "./types";

export function decodeFile(bytes: Uint8Array, requested: ImportEncoding = "auto") {
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const littleBom = bytes[0] === 0xff && bytes[1] === 0xfe;
  const bigBom = bytes[0] === 0xfe && bytes[1] === 0xff;
  const bom = utf8Bom ? "utf-8" : littleBom ? "utf-16le" : bigBom ? "utf-16be" : undefined;
  if (bom && requested !== "auto" && requested !== bom) {
    throw new Error(`文件 BOM 表明编码为 ${bom}，与选择的 ${requested} 不符。`);
  }
  // Never guess a legacy encoding: corrupt UTF-8 must not silently become GBK.
  const encoding = bom ?? (requested === "auto" ? "utf-8" : requested);
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`无法按 ${encoding} 解码；请另存为 UTF-8，或为 GBK 文件选择 GB18030。`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(text)) {
    throw new Error("文件包含无效控制字符或乱码，请检查编码并另存为 UTF-8。");
  }
  return { text: text.replace(/^\uFEFF/u, ""), encoding };
}
