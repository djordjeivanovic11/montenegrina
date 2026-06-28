import { lookup } from 'node:dns/promises';

import { Injectable } from '@nestjs/common';
import { convert } from 'html-to-text';
import ipaddr from 'ipaddr.js';

import { ApiException } from '../core/api-exception.js';

const maximumBytes = 5 * 1024 * 1024;
const allowedTypes = ['text/plain', 'text/html', 'text/markdown'];

function publicAddress(address: string): boolean {
  const parsed = ipaddr.parse(address);
  const range = parsed.range();
  return ![
    'unspecified',
    'broadcast',
    'multicast',
    'linkLocal',
    'loopback',
    'private',
    'reserved',
    'carrierGradeNat',
    'uniqueLocal',
  ].includes(range);
}

@Injectable()
export class SafeWebFetcher {
  async fetchText(input: string): Promise<{ text: string; finalUrl: string; mediaType: string }> {
    let url = this.validateUrl(input);
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      await this.validateHost(url);
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'MontenegrinaKnowledgeFetcher/1.0' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === 3) throw this.rejected('WEB_SOURCE_REDIRECT_REJECTED');
        url = this.validateUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw this.rejected('WEB_SOURCE_FETCH_FAILED');
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > maximumBytes) throw this.rejected('WEB_SOURCE_TOO_LARGE');
      const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!allowedTypes.includes(mediaType)) throw this.rejected('WEB_SOURCE_TYPE_REJECTED');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maximumBytes) throw this.rejected('WEB_SOURCE_TOO_LARGE');
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return {
        text: mediaType === 'text/html' ? convert(raw, { wordwrap: false, selectors: [{ selector: 'script', format: 'skip' }, { selector: 'style', format: 'skip' }] }) : raw,
        finalUrl: url.toString(),
        mediaType: 'text/plain',
      };
    }
    throw this.rejected('WEB_SOURCE_REDIRECT_REJECTED');
  }

  private validateUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw this.rejected('WEB_SOURCE_URL_INVALID');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      throw this.rejected('WEB_SOURCE_URL_REJECTED');
    }
    return url;
  }

  private async validateHost(url: URL): Promise<void> {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => !publicAddress(entry.address))) {
      throw this.rejected('WEB_SOURCE_ADDRESS_REJECTED');
    }
  }

  private rejected(code: string): ApiException {
    return new ApiException({ code, message: 'The web knowledge source was rejected by the fetch policy.', status: 422 });
  }
}

