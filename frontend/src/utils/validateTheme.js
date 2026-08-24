/**
 * Theme Validation Utility
 * 
 * Validates that required CSS custom properties are defined at runtime.
 * Only runs in development mode to help catch theme configuration issues early.
 */

export function validateTheme() {
  if (import.meta.env.MODE !== 'development') return;
  
  const requiredVars = [
    '--brand-primary',
    '--brand-secondary', 
    '--bg-primary',
    '--bg-secondary',
    '--text-primary',
    '--text-secondary',
    '--primary-button',
    '--primary-button-hover',
    // The label half of the pair. It is the one that INVERTS between themes
    // (white in light, Gunmetal in dark), so a theme that defines the fill and
    // not the label ships a 2.16:1 control rather than an obviously broken one
    // (issue #1260). scripts/tenants/validate-tenant-manifest.js requires the
    // same three per mode; keep the two lists in step.
    '--primary-button-text',
  ];
  
  const styles = getComputedStyle(document.documentElement);
  const missing = [];
  
  requiredVars.forEach(varName => {
    const value = styles.getPropertyValue(varName).trim();
    if (!value) {
      missing.push(varName);
    }
  });
  
  if (missing.length > 0) {
    console.warn(
      `⚠️ Missing CSS variables: ${missing.join(', ')}\n` +
      `Check that theme classes (platform-fairwins and theme-light or theme-dark) are applied to <html>`
    );
  }
}
