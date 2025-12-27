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
      `Check that theme classes (platform-fairwins, theme-light) are applied to <html>`
    );
  }
}
