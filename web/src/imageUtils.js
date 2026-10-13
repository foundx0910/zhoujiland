/**
 * 上传前的图片归一化。
 *
 * 为什么需要：
 *  iPhone 拍的照片默认是 HEIC 格式（文件名叫 .jpg 也可能是 HEIC），浏览器无法解码，
 *  传到论坛后就是一张永远显示不出来的图（页面上只剩 alt 文字）。
 *  另外手机原图动辄 3-10MB，加载很慢。
 *
 * 做法：在浏览器里先解码 → 用 canvas 转成 JPEG（或保留 PNG 透明）→ 限制最长边 → 压缩。
 *  浏览器解不开的格式（如桌面 Chrome 下的 HEIC）就原样上传，由服务端给出明确提示。
 */

const MAX_EDGE = 1600; // 最长边像素
const QUALITY = 0.85; // JPEG 质量
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024; // 小于这个大小、尺寸也不大就不动它
const KEEP_AS_IS_EDGE = 2000;

const BROWSER_SAFE = ['image/png', 'image/jpeg', 'image/webp'];

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode-failed'));
    };
    img.src = url;
  });
}

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

/**
 * @returns {Promise<{ blob: Blob, name: string, converted: boolean, note: string }>}
 */
export async function normalizeImage(file) {
  const original = { blob: file, name: file.name, converted: false, note: '' };

  // 动图不处理（转成静态就没意义了）
  if (file.type === 'image/gif') return original;

  let loaded;
  try {
    loaded = await loadImageElement(file);
  } catch {
    // 浏览器解不开（典型：桌面 Chrome 打开 HEIC）→ 原样上传，交给服务端报错
    return { ...original, note: '格式无法在浏览器里解码，已原样上传' };
  }

  const { img, url } = loaded;
  try {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return original;

    const maxEdge = Math.max(w0, h0);
    const safeType = BROWSER_SAFE.includes(file.type);
    const needResize = maxEdge > MAX_EDGE;
    const needShrink = file.size > KEEP_AS_IS_BYTES && maxEdge > KEEP_AS_IS_EDGE;

    // 已经是浏览器认得的格式，而且不大不小 → 原样上传
    if (safeType && !needResize && !needShrink) return original;

    const scale = Math.min(1, MAX_EDGE / maxEdge);
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // JPEG 不支持透明，先铺白底，避免透明区域变黑
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    if (outType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await canvasToBlob(canvas, outType, QUALITY);
    if (!blob || blob.size === 0) return original;
    // 转换后反而更大就没必要（例如小 PNG）
    if (blob.size >= file.size && !needResize && file.type !== 'image/jpg') {
      if (BROWSER_SAFE.includes(file.type)) return original;
    }

    const ext = outType === 'image/png' ? '.png' : '.jpg';
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    const notes = [];
    if (!safeType) notes.push('已从手机原图格式（HEIC 等）转成 JPEG');
    if (scale < 1) notes.push(`已缩到 ${w}×${h}`);
    notes.push(`${(file.size / 1024 / 1024).toFixed(1)}MB → ${(blob.size / 1024).toFixed(0)}KB`);

    return { blob, name: base + ext, converted: true, note: notes.join('，') };
  } catch {
    return original;
  } finally {
    URL.revokeObjectURL(url);
  }
}
