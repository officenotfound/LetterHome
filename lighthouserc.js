module.exports = {
  ci: {
    collect: {
      urls: [
        'https://letterhome.ca/',
        'https://letterhome.ca/send',
        'https://letterhome.ca/track',
        'https://letterhome.ca/contact',
      ],
      numberOfRuns: 3,
      settings: {
        // Simulate a mid-range mobile device (Lighthouse default)
        preset: 'desktop',
        // Skip PWA audits (not applicable for this service)
        skipAudits: ['installable-manifest', 'service-worker', 'splash-screen'],
      },
    },
    assert: {
      assertions: {
        // Fail CI if accessibility drops below 90 — critical for a form-heavy service
        'categories:accessibility': ['error', { minScore: 0.90 }],
        // Warn on performance/SEO/best-practices drops
        'categories:performance':   ['warn',  { minScore: 0.75 }],
        'categories:seo':           ['warn',  { minScore: 0.90 }],
        'categories:best-practices':['warn',  { minScore: 0.80 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
