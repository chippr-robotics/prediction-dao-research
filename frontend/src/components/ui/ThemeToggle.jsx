import { useTheme } from '../../hooks/useTheme'
import './ThemeToggle.css'

/**
 * ThemeToggle component
 * Allows users to toggle between light and dark modes
 */
export default function ThemeToggle() {
  const { mode, toggleMode, isDark } = useTheme()

  return (
    <button
      className="theme-toggle"
      onClick={toggleMode}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isDark ? '☀️' : '🌙'}
      </span>
      <span className="sr-only">
        {`Currently in ${mode} mode. Click to switch to ${isDark ? 'light' : 'dark'} mode.`}
      </span>
    </button>
  )
}
