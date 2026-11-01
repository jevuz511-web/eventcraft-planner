/**
 * Security headers hardening policy: strict CSP with Trusted Types enforcement,
 * frame isolation, transport security, and device feature permission revocation.
 */

const REVOKED_DEVICE_CAPABILITIES = [
  'accelerometer',
  'bluetooth',
  'browsingTopics',
  'camera',
  'displayCapture',
  'geolocation',
  'gyroscope',
  'hid',
  'idleDetection',
  'localFonts',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'publickeyCredentialsGet',
  'screenWakeLock',
  'serial',
  'usb',
  'xrSpatialTracking',
];

export const APPLICATION_SECURITY_HEADERS = {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    requireTrustedTypesFor: ["'script'"],
    trustedTypes: ["'none'"],
  },
  crossOriginEmbedderPolicy: 'require-corp',
  strictTransportSecurity: 'max-age=63072000; includeSubDomains',
  xFrameOptions: 'DENY',
  permissionsPolicy: Object.fromEntries(
    REVOKED_DEVICE_CAPABILITIES.map((capability) => [capability, []]),
  ),
};
