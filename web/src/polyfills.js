/**
 * 老浏览器兼容垫片。
 *
 * esbuild 只会把「新语法」降级成老语法，不会补「新方法」。而 marked（Markdown 解析库）
 * 内部用了 Array.prototype.at()（ES2022 / Safari 15.4+），老手机上会直接抛错，
 * 导致所有帖子内容渲染失败。这里在应用启动前把这些方法补齐。
 */
(function () {
  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value: function at(n) {
        var len = this.length >>> 0;
        var k = Math.trunc(n) || 0;
        if (k < 0) k += len;
        if (k < 0 || k >= len) return undefined;
        return this[k];
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof String.prototype.at !== 'function') {
    Object.defineProperty(String.prototype, 'at', {
      value: function at(n) {
        var str = String(this);
        var k = Math.trunc(n) || 0;
        if (k < 0) k += str.length;
        if (k < 0 || k >= str.length) return undefined;
        return str.charAt(k);
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value: function hasOwn(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof String.prototype.replaceAll !== 'function') {
    Object.defineProperty(String.prototype, 'replaceAll', {
      value: function replaceAll(search, replacement) {
        var str = String(this);
        if (search instanceof RegExp) {
          if (!search.global) throw new TypeError('replaceAll 的 RegExp 参数必须带 g 标志');
          return str.replace(search, replacement);
        }
        return str.split(String(search)).join(String(replacement));
      },
      writable: true,
      configurable: true,
    });
  }

  if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = function structuredClone(value) {
      return JSON.parse(JSON.stringify(value));
    };
  }
})();
