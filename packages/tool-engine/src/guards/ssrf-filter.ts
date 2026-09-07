import { URL } from 'node:url';

export class SSRFGuard {
  public static isUrlAllowed(urlString: string, allowPrivate: boolean = false): { allowed: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      return { allowed: false, reason: `Invalid URL format: ${urlString}` };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { allowed: false, reason: `Forbidden protocol '${parsed.protocol}'. Only http: and https: are allowed.` };
    }

    if (allowPrivate) {
      return { allowed: true };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check localhost / loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname === '[::1]'
    ) {
      return { allowed: false, reason: `SSRF Violation: Loopback host '${hostname}' is prohibited` };
    }

    // Check Cloud Metadata IP
    if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) {
      return { allowed: false, reason: `SSRF Violation: Link-local/cloud metadata service '${hostname}' is prohibited` };
    }

    // Check RFC 1918 Private IPv4 ranges:
    // 10.0.0.0 - 10.255.255.255
    // 172.16.0.0 - 172.31.255.255
    // 192.168.0.0 - 192.168.255.255
    const ipv4Parts = hostname.split('.').map((p) => parseInt(p, 10));
    if (ipv4Parts.length === 4 && ipv4Parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      const [b0, b1] = ipv4Parts;
      if (b0 === 10) {
        return { allowed: false, reason: `SSRF Violation: Private RFC 1918 network (10.0.0.0/8) is prohibited` };
      }
      if (b0 === 172 && b1 >= 16 && b1 <= 31) {
        return { allowed: false, reason: `SSRF Violation: Private RFC 1918 network (172.16.0.0/12) is prohibited` };
      }
      if (b0 === 192 && b1 === 168) {
        return { allowed: false, reason: `SSRF Violation: Private RFC 1918 network (192.168.0.0/16) is prohibited` };
      }
    }

    return { allowed: true };
  }
}
