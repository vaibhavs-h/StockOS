/**
 * Normalises a NextAuth session/provider user ID (which may be a numeric string
 * such as "107331917601880906344" for Google provider accounts) into a valid
 * PostgreSQL-compatible UUID.
 * 
 * If the provided user ID is already a valid UUID format, it is returned as-is.
 * Otherwise, a deterministic MD5 hash-based UUID is generated from it.
 */

function md5PureJS(str: string): string {
  const k = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ];
  
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  
  const s = unescape(encodeURIComponent(str));
  const len = s.length;
  const words: number[] = [];
  for (let i = 0; i < len; i++) {
    words[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8);
  }
  
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  const wordCount = ((len + 8) >> 6) * 16 + 14;
  words[wordCount] = len * 8;
  
  while (words.length % 16 !== 0) {
    words.push(0);
  }
  
  for (let chunkStart = 0; chunkStart < words.length; chunkStart += 16) {
    let a = h[0], b = h[1], c = h[2], d = h[3];
    
    for (let i = 0; i < 64; i++) {
      let f = 0, g = 0;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      
      const temp = d;
      d = c;
      c = b;
      const rotAmt = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
      ][i];
      
      const sum = (a + f + k[i] + (words[chunkStart + g] || 0)) | 0;
      b = (b + ((sum << rotAmt) | (sum >>> (32 - rotAmt)))) | 0;
      a = temp;
    }
    
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
  }
  
  const hex: string[] = [];
  for (let i = 0; i < 4; i++) {
    const val = h[i];
    for (let byteIdx = 0; byteIdx < 4; byteIdx++) {
      const byteVal = (val >> (byteIdx * 8)) & 0xFF;
      hex.push((byteVal < 16 ? "0" : "") + byteVal.toString(16));
    }
  }
  
  return hex.join("");
}

export function getDbUserId(userId: string): string {
  if (!userId) return userId;
  
  // Regex to check if the string matches UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(userId)) {
    return userId;
  }
  
  // Generate deterministic UUID from non-UUID userId using md5 hash
  const hash = md5PureJS(userId);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}
