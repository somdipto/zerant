import type { OnBeforeRequestListenerDetails } from 'electron';
import type { SecurityDB } from './security-db';
import type { OutboundDecision, BodyAnalysis, OutboundStats, GuardianMode, GatekeeperDecisionClass } from './types';
import { KNOWN_TRACKERS, KNOWN_WS_SERVICES } from './types';
import { createLogger } from '../utils/logger';

const log = createLogger('OutboundGuard');

// Credential field patterns in POST bodies
const CREDENTIAL_PATTERN = /(?:^|&|"|,\s*")(?:password|passwd|pw|pass|secret|token|api[_-]?key|access[_-]?token|credit[_-]?card|card[_-]?number|cvv|cvc|ssn|social[_-]?security)(?:"|]?\s*[:=])/i;

// Trusted media/binary Content-Types — skip body credential scanning for these
// Google API domains that make legitimate cross-origin requests (Speech API, Maps, etc.)
const KNOWN_GOOGLE_API_DOMAINS = new Set([
  'www.google.com',
  'speech.googleapis.com',
  'content-speech.googleapis.com',
  'apis.google.com',
  'www.gstatic.com',
  'ssl.gstatic.com',
]);

const TRUSTED_OUTBOUND_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/bmp', 'image/tiff', 'image/x-icon', 'image/avif',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
  'application/octet-stream', 'application/zip', 'application/gzip',
]);

// Max body size to scan for credentials (100KB)
const MAX_SCAN_SIZE = 100_000;

// Large body threshold (1MB)
const LARGE_BODY_THRESHOLD = 1_000_000;

// Trust level threshold — domains at or above this are considered trusted
const TRUSTED_THRESHOLD = 50;

export class OutboundGuard {
  private db: SecurityDB;
  private stats: OutboundStats = { totalChecked: 0, allowed: 0, blocked: 0, flagged: 0 };

  constructor(db: SecurityDB) {
    this.db = db;
    log.info('Initialized');
  }

  /**
   * Analyze an outbound POST/PUT/PATCH request.
   * Called by Guardian's checkRequest() for mutating HTTP methods.
   */
  analyzeOutbound(details: OnBeforeRequestListenerDetails, mode: GuardianMode): OutboundDecision {
    this.stats.totalChecked++;

    const destDomain = this.extractDomain(details.url);
    if (!destDomain) {
      return this.finishDecision({
        action: 'allow',
        reason: 'invalid-url',
        severity: 'info',
        explanation: 'Allowed because the destination URL could not be parsed for outbound analysis.',
      });
    }

    // Allow known Google service endpoints regardless of referrer/trust
    // (Web Speech API, Google Maps, etc. make cross-origin requests from shell context)
    if (KNOWN_GOOGLE_API_DOMAINS.has(destDomain)) {
      return this.finishDecision({
        action: 'allow',
        reason: 'known-google-api',
        severity: 'info',
        explanation: 'Allowed because the destination is a known Google API endpoint.',
      });
    }

    const originDomain = details.referrer ? this.extractDomain(details.referrer) : null;
    const originProfile = originDomain ? this.getDomainProfile(originDomain) : null;
    const destinationProfile = this.getDomainProfile(destDomain);
    const isCrossOrigin = Boolean(originDomain && originDomain !== destDomain);
    const isSameSite = Boolean(originDomain && this.isSameSiteDomain(originDomain, destDomain));
    const isDestinationUnknown = !destinationProfile.isTrusted && !destinationProfile.isEstablished;
    const bodyAnalysis = details.uploadData?.length ? this.analyzeBody(details.uploadData) : null;

    // 1. Same-origin POST = always allow (normal form submissions, login flows)
    if (originDomain && destDomain === originDomain) {
      return this.finishDecision({
        action: 'allow',
        reason: 'same-origin',
        severity: 'info',
        explanation: 'Allowed because the mutating request stays on the same origin.',
      });
    }

    // 2. Check whitelisted domain pair
    if (originDomain && this.db.isWhitelistedPair(originDomain, destDomain)) {
      return this.finishDecision({
        action: 'allow',
        reason: 'whitelisted-pair',
        severity: 'info',
        explanation: 'Allowed because the origin/destination pair is explicitly whitelisted.',
      });
    }

    if (isSameSite) {
      return this.finishDecision({
        action: 'allow',
        reason: 'same-site-cross-origin',
        severity: 'info',
        explanation: `Allowed because ${originDomain} and ${destDomain} are part of the same site boundary.`,
        context: {
          originDomain,
          destinationDomain: destDomain,
        },
      });
    }

    // 3. Known analytics/tracker destination
    if (this.isKnownTracker(destDomain)) {
      if (mode === 'strict') {
        return this.finishDecision({
          action: 'block',
          reason: 'tracker-blocked-strict',
          severity: 'low',
          explanation: 'Blocked because strict mode does not permit mutating requests to known tracker endpoints.',
          context: {
            destinationDomain: destDomain,
            mode,
          },
        });
      }
      // balanced/permissive: flag but allow
      return this.finishDecision({
        action: 'flag',
        reason: 'tracker-detected',
        severity: 'info',
        explanation: 'Flagged because the request targets a known tracker endpoint.',
        context: {
          destinationDomain: destDomain,
          mode,
        },
      });
    }

    // 4. Content-Type whitelist — skip body scan for known-safe media types.
    // NOTE: Electron's onBeforeRequest does not expose request headers, so we extract
    // Content-Type from multipart form-data body bytes. This means non-multipart binary
    // POSTs (e.g., raw image PUT) will not match and their body will still be scanned.
    // This is a known limitation of the Electron webRequest API.
    if (details.uploadData?.length) {
      const contentType = this.extractUploadContentType(details.uploadData);
      if (contentType && TRUSTED_OUTBOUND_CONTENT_TYPES.has(contentType)) {
        return this.finishDecision({
          action: 'allow',
          reason: 'trusted-content-type',
          severity: 'info',
          explanation: `Allowed because the upload body looks like trusted media/binary content (${contentType}).`,
          context: {
            contentType,
          },
        });
      }
    }

    // 5. Check POST body for credential-like data
    if (bodyAnalysis) {
      // Cross-origin credential submission = ALWAYS BLOCK
      if (bodyAnalysis.hasCredentials && isCrossOrigin && !isSameSite) {
        return this.finishDecision({
          action: 'block',
          reason: 'cross-origin-credentials',
          severity: 'critical',
          explanation: 'Blocked because credential-like data was detected in a cross-origin mutating request.',
          context: {
            originDomain,
            destinationDomain: destDomain,
            sizeBytes: bodyAnalysis.sizeBytes,
          },
        });
      }
    }

    // 6. Cross-origin POST from trusted to untrusted
    if (isCrossOrigin && !isSameSite && originProfile?.isTrusted && !destinationProfile.isTrusted) {
      return this.finishDecision({
        action: 'flag',
        reason: 'cross-origin-trusted-to-untrusted',
        severity: mode === 'strict' ? 'high' : 'medium',
        explanation: `Flagged because trusted origin ${originDomain} is sending mutating traffic to lower-trust destination ${destDomain}.`,
        gatekeeperDecisionClass: this.getCrossOriginGatekeeperClass(mode),
        context: {
          originDomain,
          destinationDomain: destDomain,
          originTrust: originProfile.trustLevel,
          destinationTrust: destinationProfile.trustLevel,
          destinationVisitCount: destinationProfile.visitCount,
          destinationKnown: destinationProfile.isEstablished,
          mode,
        },
      });
    }

    // 7. First-time or low-confidence mutating request to an unknown destination
    if (isCrossOrigin && !isSameSite && isDestinationUnknown) {
      const shouldEscalateInBalanced = Boolean(
        bodyAnalysis && (bodyAnalysis.hasFileUpload || bodyAnalysis.sizeBytes > LARGE_BODY_THRESHOLD)
      );
      const gatekeeperDecisionClass =
        mode === 'strict'
          ? 'deny_on_timeout'
          : mode === 'balanced' && shouldEscalateInBalanced
            ? 'hold_for_decision'
            : undefined;

      return this.finishDecision({
        action: 'flag',
        reason: 'first-visit-mutating-destination',
        severity: mode === 'strict' || shouldEscalateInBalanced ? 'high' : 'medium',
        explanation: `Flagged because ${destDomain} has not earned trust yet and is receiving a cross-origin mutating request.`,
        gatekeeperDecisionClass,
        context: {
          originDomain,
          destinationDomain: destDomain,
          destinationTrust: destinationProfile.trustLevel,
          destinationVisitCount: destinationProfile.visitCount,
          hasFileUpload: bodyAnalysis?.hasFileUpload ?? false,
          sizeBytes: bodyAnalysis?.sizeBytes ?? 0,
          mode,
        },
      });
    }

    // 8. File upload logging (always log, never block)
    if (bodyAnalysis?.hasFileUpload) {
      return this.finishDecision({
        action: 'flag',
        reason: 'file-upload-detected',
        severity: 'info',
        explanation: 'Flagged because the mutating request includes a file upload.',
        context: {
          originDomain,
          destinationDomain: destDomain,
          sizeBytes: bodyAnalysis.sizeBytes,
        },
      });
    }

    // 9. Abnormally large POST to unknown or low-trust domain
    if (bodyAnalysis && bodyAnalysis.sizeBytes > LARGE_BODY_THRESHOLD && !destinationProfile.isTrusted) {
      return this.finishDecision({
        action: 'flag',
        reason: 'large-body-unknown-domain',
        severity: 'high',
        explanation: `Flagged because a large mutating request body is leaving for low-trust destination ${destDomain}.`,
        context: {
          originDomain,
          destinationDomain: destDomain,
          destinationTrust: destinationProfile.trustLevel,
          sizeBytes: bodyAnalysis.sizeBytes,
        },
      });
    }

    return this.finishDecision({
      action: 'allow',
      reason: 'no-threat-detected',
      severity: 'info',
      explanation: 'Allowed because outbound analysis did not find a containment signal.',
    });
  }

  /**
   * Analyze a WebSocket upgrade request (connection-level only — frame inspection requires CDP).
   */
  analyzeWebSocket(url: string, referrer: string | undefined, mode: GuardianMode): OutboundDecision {
    this.stats.totalChecked++;

    const wsDomain = this.extractDomain(url);
    if (!wsDomain) {
      return this.finishDecision({
        action: 'allow',
        reason: 'invalid-ws-url',
        severity: 'info',
        explanation: 'Allowed because the WebSocket URL could not be parsed for containment analysis.',
      });
    }

    // Skip internal/Zerant WebSocket endpoints (e.g. ws://127.0.0.1:WEBHOOK_PORT/)
    try {
      const wsUrl = new URL(url);
      if (wsUrl.hostname === 'localhost' || wsUrl.hostname === '127.0.0.1' || wsUrl.hostname === '::1') {
        return this.finishDecision({
          action: 'allow',
          reason: 'internal-ws',
          severity: 'info',
          explanation: 'Allowed because the WebSocket target is loopback/internal infrastructure.',
        });
      }
    } catch {
      // invalid url — fall through to normal checks
    }

    const originDomain = referrer ? this.extractDomain(referrer) : null;
    const originProfile = originDomain ? this.getDomainProfile(originDomain) : null;
    const destinationProfile = this.getDomainProfile(wsDomain);
    const isCrossOrigin = Boolean(originDomain && originDomain !== wsDomain);
    const isSameSite = Boolean(originDomain && this.isSameSiteDomain(originDomain, wsDomain));
    const isUnknownEndpoint = !destinationProfile.isTrusted && !destinationProfile.isEstablished;

    // Same domain = normal
    if (originDomain && wsDomain === originDomain) {
      return this.finishDecision({
        action: 'allow',
        reason: 'same-origin-ws',
        severity: 'info',
        explanation: 'Allowed because the WebSocket stays on the same origin as the referrer.',
      });
    }

    // Whitelisted pair
    if (originDomain && this.db.isWhitelistedPair(originDomain, wsDomain)) {
      return this.finishDecision({
        action: 'allow',
        reason: 'whitelisted-ws-pair',
        severity: 'info',
        explanation: 'Allowed because the WebSocket origin/destination pair is explicitly whitelisted.',
      });
    }

    // Known WebSocket service providers
    if (this.isKnownWSService(wsDomain)) {
      return this.finishDecision({
        action: 'allow',
        reason: 'known-ws-service',
        severity: 'info',
        explanation: 'Allowed because the destination matches a known WebSocket service provider.',
      });
    }

    if (isSameSite) {
      return this.finishDecision({
        action: 'allow',
        reason: 'same-site-ws',
        severity: 'info',
        explanation: `Allowed because ${originDomain} and ${wsDomain} are part of the same site boundary.`,
      });
    }

    if (isCrossOrigin && !isSameSite && originProfile?.isTrusted && !destinationProfile.isTrusted) {
      return this.finishDecision({
        action: 'flag',
        reason: 'trusted-to-untrusted-websocket',
        severity: mode === 'strict' ? 'high' : 'medium',
        explanation: `Flagged because trusted origin ${originDomain} is opening a WebSocket to lower-trust destination ${wsDomain}.`,
        gatekeeperDecisionClass: this.getCrossOriginGatekeeperClass(mode),
        context: {
          originDomain,
          destinationDomain: wsDomain,
          originTrust: originProfile.trustLevel,
          destinationTrust: destinationProfile.trustLevel,
          destinationVisitCount: destinationProfile.visitCount,
          mode,
        },
      });
    }

    if (!originDomain && isUnknownEndpoint) {
      return this.finishDecision({
        action: 'flag',
        reason: 'unknown-ws-no-referrer',
        severity: mode === 'strict' ? 'high' : 'medium',
        explanation: `Flagged because unknown WebSocket endpoint ${wsDomain} was requested without a trustworthy referrer.`,
        gatekeeperDecisionClass: this.getUnknownWebSocketGatekeeperClass(mode),
        context: {
          destinationDomain: wsDomain,
          destinationTrust: destinationProfile.trustLevel,
          destinationVisitCount: destinationProfile.visitCount,
          mode,
        },
      });
    }

    if (isUnknownEndpoint) {
      return this.finishDecision({
        action: 'flag',
        reason: 'unknown-ws-endpoint',
        severity: mode === 'strict' ? 'high' : 'medium',
        explanation: `Flagged because WebSocket endpoint ${wsDomain} is not established or trusted yet.`,
        gatekeeperDecisionClass: this.getUnknownWebSocketGatekeeperClass(mode),
        context: {
          originDomain,
          destinationDomain: wsDomain,
          destinationTrust: destinationProfile.trustLevel,
          destinationVisitCount: destinationProfile.visitCount,
          mode,
        },
      });
    }

    return this.finishDecision({
      action: 'flag',
      reason: 'untrusted-cross-origin-ws',
      severity: 'low',
      explanation: `Flagged because ${originDomain ?? 'unknown origin'} opened a cross-origin WebSocket to ${wsDomain}.`,
      context: {
        originDomain,
        destinationDomain: wsDomain,
        destinationTrust: destinationProfile.trustLevel,
        destinationVisitCount: destinationProfile.visitCount,
        mode,
      },
    });
  }

  /**
   * Analyze POST body content for credential patterns and size.
   */
  private analyzeBody(uploadData: Electron.UploadData[]): BodyAnalysis {
    let totalSize = 0;
    let hasCredentials = false;
    let hasFileUpload = false;

    for (const part of uploadData) {
      // Detect file uploads via file path
      if (part.file) {
        hasFileUpload = true;
      }

      if (part.bytes) {
        totalSize += part.bytes.length;

        // Only scan text-like bodies under MAX_SCAN_SIZE
        if (totalSize <= MAX_SCAN_SIZE) {
          const text = part.bytes.toString('utf-8');
          if (CREDENTIAL_PATTERN.test(text)) {
            hasCredentials = true;
          }
        }
      }
    }

    return { sizeBytes: totalSize, hasCredentials, hasFileUpload };
  }

  getStats(): OutboundStats {
    return { ...this.stats };
  }

  // === Helpers ===

  private finishDecision(decision: OutboundDecision): OutboundDecision {
    if (decision.action === 'allow') {
      this.stats.allowed++;
    } else if (decision.action === 'block') {
      this.stats.blocked++;
    } else {
      this.stats.flagged++;
    }

    return decision;
  }

  private getDomainProfile(domain: string): {
    trustLevel: number;
    visitCount: number;
    isTrusted: boolean;
    isEstablished: boolean;
  } {
    const info = this.db.getDomainInfo(domain);
    const trustLevel = info?.trustLevel ?? 30;
    const visitCount = info?.visitCount ?? 0;

    return {
      trustLevel,
      visitCount,
      isTrusted: trustLevel >= TRUSTED_THRESHOLD,
      isEstablished: visitCount >= 3,
    };
  }

  private getCrossOriginGatekeeperClass(mode: GuardianMode): GatekeeperDecisionClass | undefined {
    if (mode === 'strict') return 'deny_on_timeout';
    if (mode === 'balanced') return 'hold_for_decision';
    return undefined;
  }

  private getUnknownWebSocketGatekeeperClass(mode: GuardianMode): GatekeeperDecisionClass | undefined {
    if (mode === 'strict') return 'deny_on_timeout';
    if (mode === 'balanced') return 'hold_for_decision';
    return undefined;
  }

  /**
   * Extract Content-Type from upload data.
   * Checks multipart form-data headers embedded in the bytes (e.g. "Content-Type: image/jpeg").
   * Returns null if Content-Type cannot be determined.
   */
  private extractUploadContentType(uploadData: Electron.UploadData[]): string | null {
    for (const part of uploadData) {
      if (part.bytes && part.bytes.length > 0) {
        // Look for Content-Type header in multipart form data (first 2KB)
        const header = part.bytes.subarray(0, 2048).toString('utf-8');

        // Safety: if multipart form has multiple fields, don't skip scanning
        // (mixed forms may have text fields with credentials alongside file uploads)
        const dispositions = header.match(/Content-Disposition:/gi);
        if (dispositions && dispositions.length > 1) return null;

        const match = header.match(/Content-Type:\s*([^\r\n;]+)/i);
        if (match) {
          return match[1].trim().toLowerCase();
        }
      }
    }
    return null;
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private isKnownTracker(domain: string): boolean {
    if (KNOWN_TRACKERS.has(domain)) return true;
    // Check parent domains (e.g., sub.tracker.com)
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (KNOWN_TRACKERS.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  private isKnownWSService(domain: string): boolean {
    if (KNOWN_WS_SERVICES.has(domain)) return true;
    // Check parent domain match (e.g., s-usc1c-nss-2.firebaseio.com → firebaseio.com)
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (KNOWN_WS_SERVICES.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  private isSameSiteDomain(left: string, right: string): boolean {
    return this.getSiteKey(left) === this.getSiteKey(right);
  }

  private getSiteKey(domain: string): string {
    const parts = domain.split('.').filter(Boolean);
    if (parts.length <= 2) return domain;

    const tld = parts.at(-1) ?? '';
    const secondLevel = parts.at(-2) ?? '';
    const useThreeLabels = tld.length === 2 && secondLevel.length <= 3 && parts.length >= 3;
    return useThreeLabels ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  }
}
