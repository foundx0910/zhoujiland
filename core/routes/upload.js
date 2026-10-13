import { fail } from '../http.js';
import { requireSpeaker } from '../auth.js';
import { randomToken } from '../password.js';

const ALLOWED = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const extForType = (mime) => ALLOWED[mime] ?? '.bin';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 按文件头判断真实格式（浏览器只认这几类；HEIC 等要给出明确提示） */
function sniff(bytes) {
  const b = bytes;
  const at = (i, arr) => arr.every((v, k) => b[i + k] === v);
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  // ISO-BMFF 容器：HEIC / HEIF / AVIF（iPhone 直出照片）
  const brand = String.fromCharCode(...b.slice(4, 12));
  if (brand.startsWith('ftyp')) {
    if (brand.includes('avif')) return 'image/avif';
    return 'image/heic';
  }
  return '';
}

export function register(r) {
  /**
   * 上传图片：请求体就是图片原始字节，Content-Type 为 image/*。
   * 不用 multipart，本地与 Workers 可以共用同一份解析逻辑。
   */
  r.post('/api/upload', async (ctx) => {
    requireSpeaker(ctx);
    const type = (ctx.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = ALLOWED[type];
    if (!ext) fail(400, '只支持 PNG / JPG / GIF / WebP 图片');

    const bytes = ctx.rawBytes();
    if (!bytes.length) fail(400, '没有收到文件');
    if (bytes.length > MAX_UPLOAD_BYTES) fail(413, '图片不能超过 5MB');

    // 按文件头复核真实格式：iPhone 的 HEIC 常被浏览器/系统标成 image/jpeg，
    // 浏览器解不开它，传上来就是一张永远显示不出来的图，这里直接拦下并说明原因。
    const real = sniff(bytes);
    if (real === 'image/heic' || real === 'image/avif') {
      fail(
        400,
        '这张是手机原图格式（HEIC/AVIF），浏览器无法显示。请先用「照片」导出成 JPEG 再上传，' +
          '或者在手机上用支持自动转换的浏览器（Safari）重新上传。'
      );
    }
    if (!real) fail(400, '这个文件看起来不是有效的图片（可能是改过扩展名的文件）');
    if (real !== type) {
      // 内容与声明不一致时以真实格式为准（例如 .png 里其实是 JPEG）
      extForType(real);
    }

    const key = `${Date.now()}-${randomToken(6)}${extForType(real)}`;
    await ctx.uploads.put(key, bytes, real);
    ctx.json(201, { url: `/uploads/${key}`, size: bytes.length });
  });

  /** 读取上传的图片 */
  r.get('/uploads/:key', async (ctx) => {
    const found = await ctx.uploads.get(ctx.params.key);
    if (!found) fail(404, '文件不存在');
    ctx.header('Cache-Control', 'public, max-age=604800');
    ctx.binary(200, found.bytes, found.contentType);
  });
}
