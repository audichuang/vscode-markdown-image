/**
 * Sanitize a file name by removing dangerous characters, control characters,
 * path traversal sequences, and Windows reserved names.
 */
export function sanitizeFileName(name: string): string {
    const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

    let result = name
        .replace(/[<>:"/\\|?*]/g, '_')                // 危險字元
        .split('').map(char => {                      // 控制字元 + DEL
            const code = char.charCodeAt(0);
            return (code <= 0x1f || code === 0x7f) ? '_' : char;
        }).join('')
        .replace(/\.{2,}/g, '_')                      // 路徑穿越
        .replace(/^\./, '_')                          // 開頭的點（僅第一個）
        .replace(/[\s.]+$/, '')                       // 刪除結尾空格和點
        .slice(0, 200)
        .replace(/[\uD800-\uDBFF]$/, '');             // 避免切斷 surrogate pair

    if (WINDOWS_RESERVED.test(result)) {
        result = '_' + result;
    }

    return result || '_';  // 防止空字串
}
