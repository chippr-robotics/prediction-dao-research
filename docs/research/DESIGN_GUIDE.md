# FairWins & ClearPath Design Guide

## Brand Identity

### Platform Suite Overview
FairWins & ClearPath is a dual-platform suite for peer-to-peer wagers and futarchy-based governance. The brand emphasizes:
- **Trust**: Trustless escrow — no need to trust the other party
- **Simplicity**: Create a wager, share a link, oracle resolves it
- **Fairness**: Transparent, oracle-driven resolution
- **Accessibility**: Private wagers with friends, no intermediary

### Brand Positioning
- **FairWins**: Social, direct, trustless — private wagers between friends
- **ClearPath**: Professional, institutional, trustworthy — for serious governance

---

## Color System

### Primary Brand Colors

#### Kelly Green Palette (Primary)
The kelly green color scheme conveys growth, trust, and stability — appropriate for financial and governance applications.

```css
--primary-color: #2D7A4F;      /* Kelly Green - Main brand color */
--secondary-color: #34A853;     /* Bright Green - Accent and CTAs */
--hover-color: #245c3d;         /* Dark Green - Interactive states */
```

#### Neutrals & Backgrounds
```css
--bg-dark: #0f1810;            /* Deep forest - Main background */
--bg-light: #1a2820;           /* Forest gray - Card backgrounds */
--text-primary: #f1f5f9;       /* Off-white - Primary text */
--text-secondary: #94a3b8;     /* Slate gray - Secondary text */
--border-color: #2D7A4F;       /* Kelly green - Borders */
```

#### Semantic Colors
```css
--success-color: #22c55e;      /* Green - Success states */
--warning-color: #f59e0b;      /* Amber - Warnings & bonds */
--danger-color: #dc2626;       /* Red - Errors & FAIL tokens */
```

### Color Usage Guidelines

1. **Primary Green (#2D7A4F)**: Use for primary actions, headings, borders, and brand elements
2. **Secondary Green (#34A853)**: Use sparingly for CTAs and important highlights
3. **White backgrounds**: Landing pages and marketing content use white (#ffffff) backgrounds for a clean, professional look
4. **Dark mode UI**: Application interfaces use dark backgrounds (#0f1810) for reduced eye strain during extended use
5. **Semantic colors**: Always use semantic colors consistently (green = success/pass, red = danger/fail)

---

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
  'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

System fonts provide optimal performance and native OS integration.

### Type Scale
```css
/* Hero/Display */
.hero-title { font-size: 4rem; font-weight: 700; }
.hero-subtitle { font-size: 1.75rem; font-weight: 500; }

/* Section Headers */
.section-title { font-size: 2.5rem; font-weight: 700; }
.section-intro { font-size: 1.125rem; line-height: 1.7; }

/* Body Text */
body { font-size: 1rem; line-height: 1.5; }
.description { font-size: 1.125rem; line-height: 1.7; }

/* UI Elements */
.button { font-size: 1rem; font-weight: 600; }
.label { font-size: 0.875rem; font-weight: 600; }
.helper-text { font-size: 0.875rem; color: var(--text-secondary); }
```

### Typography Best Practices
- Use a maximum of 3 font sizes per screen
- Maintain 1.5-1.7 line height for readability
- Ensure minimum 16px font size for body text
- Use font-weight: 600-700 for emphasis, not color alone

---

## Spacing & Layout

### Spacing Scale
```css
--space-xs: 0.25rem;   /* 4px */
--space-sm: 0.5rem;    /* 8px */
--space-md: 1rem;      /* 16px */
--space-lg: 1.5rem;    /* 24px */
--space-xl: 2rem;      /* 32px */
--space-2xl: 3rem;     /* 48px */
--space-3xl: 4rem;     /* 64px */
```

### Grid System
- **Container max-width**: 1200-1400px for optimal reading
- **Content max-width**: 750-900px for text-heavy sections
- **Grid gaps**: Use 1.5rem-3rem between cards
- **Responsive columns**: Use `repeat(auto-fit, minmax(350px, 1fr))` for flexible layouts

### Layout Principles
1. **Consistent padding**: Use 2rem padding for sections, 1.5rem for cards
2. **Visual hierarchy**: Larger elements = more important
3. **Whitespace**: Don't fear empty space — it improves focus
4. **Alignment**: Use grid systems to maintain vertical rhythm

---

## Components

### Buttons

#### Primary Button
```css
.primary-button {
  padding: 0.75rem 2rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.primary-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(45, 122, 79, 0.4);
}
```

#### Secondary Button
```css
.secondary-button {
  padding: 0.75rem 2rem;
  border: 1px solid var(--primary-color);
  background: transparent;
  color: var(--primary-color);
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.secondary-button:hover {
  background: var(--primary-color);
  color: white;
}
```

#### Button States
- **Hover**: Elevate with `translateY(-2px)` and shadow
- **Disabled**: Reduce opacity to 0.5, remove interactions
- **Loading**: Show loading indicator, disable interaction

### Cards

```css
.card {
  background: var(--bg-light);
  padding: 2rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(45, 122, 79, 0.2);
  border-color: var(--primary-color);
}
```

### Form Inputs

```css
.input {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-dark);
  color: var(--text-primary);
  font-size: 1rem;
  transition: border-color 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(45, 122, 79, 0.1);
}
```

### Status Badges

```css
.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
  display: inline-block;
}

.badge-success { background: var(--success-color); color: white; }
.badge-warning { background: var(--warning-color); color: white; }
.badge-danger { background: var(--danger-color); color: white; }
```

---

## Animation & Interaction

### Transition Principles
- **Duration**: 0.2s for micro-interactions, 0.3s for standard, 0.5s for complex
- **Easing**: Use `ease` or `ease-out` for natural motion
- **Properties**: Animate transform, opacity, and color — avoid animating layout properties

### Common Animations

#### Hover Elevation
```css
.elevate:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}
```

#### Loading State
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading {
  animation: pulse 2s ease-in-out infinite;
}
```

#### Fade In
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-in {
  animation: fadeIn 0.4s ease-out;
}
```

### Micro-interactions
- **Button clicks**: Scale down slightly (0.98) on active state
- **Form focus**: Add subtle glow with box-shadow
- **Success actions**: Brief green flash or checkmark animation
- **Errors**: Shake animation on validation failure

---

## Responsive Design

### Breakpoints
```css
/* Mobile */
@media (max-width: 640px) { /* sm */ }

/* Tablet */
@media (max-width: 768px) { /* md */ }

/* Desktop */
@media (max-width: 1024px) { /* lg */ }

/* Large Desktop */
@media (max-width: 1280px) { /* xl */ }
```

### Mobile-First Approach
1. Design for mobile first (320px width minimum)
2. Progressively enhance for larger screens
3. Stack grids vertically on mobile
4. Increase touch targets to minimum 44x44px
5. Simplify navigation for small screens

### Responsive Typography
```css
@media (max-width: 768px) {
  .hero-title { font-size: 2.5rem; }
  .section-title { font-size: 2rem; }
  body { font-size: 0.9375rem; }
}
```

---

## Accessibility

### WCAG 2.1 AA Compliance

#### Color Contrast
- **Normal text**: Minimum 4.5:1 contrast ratio
- **Large text (18pt+)**: Minimum 3:1 contrast ratio
- **UI components**: Minimum 3:1 contrast for interactive elements

Current palette meets these requirements:
- Primary green (#2D7A4F) on white: 5.24:1 ✓
- White (#f1f5f9) on dark bg (#0f1810): 14.2:1 ✓
- Secondary text (#94a3b8) on dark bg: 7.8:1 ✓

#### Keyboard Navigation
All interactive elements must be keyboard accessible with proper focus management.

**Requirements**:
- All interactive elements must be focusable (buttons, links, form controls)
- Interactive `<div>` elements must have `role="button"`, `tabIndex="0"`, and keyboard event handlers
- Visible focus indicators on all focusable elements
- Logical tab order following visual flow (top to bottom, left to right)
- Skip links for main content navigation
- Modal dialogs must trap focus within the modal
- No keyboard traps - users can always navigate away

**Focus Indicator Standard**:
```css
/* Global focus style - REQUIRED */
*:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* For browsers without :focus-visible support */
@supports not selector(:focus-visible) {
  *:focus {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
}

/* Never remove focus outline without replacement */
/* ❌ WRONG */
input:focus {
  outline: none;
}

/* ✅ CORRECT */
input:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
```

**Interactive Card Pattern**:
```jsx
// For clickable cards, use proper keyboard support
<div
  role="button"
  tabIndex="0"
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
  aria-label="Descriptive label for card"
>
  {content}
</div>
```

#### Screen Reader Support
Use semantic HTML and ARIA attributes for screen reader compatibility.

**Requirements**:
- Use semantic HTML5 elements (`<button>`, `<nav>`, `<main>`, `<article>`, `<header>`, `<footer>`)
- Provide descriptive alt text for all images
- Use ARIA labels for icon-only buttons
- Use ARIA live regions to announce dynamic content changes
- Form inputs must have associated `<label>` elements with matching `htmlFor`/`id`
- Use `aria-describedby` to associate help text with inputs
- Use `aria-invalid` and `role="alert"` for error messages

**ARIA Live Regions for Dynamic Updates**:
```jsx
// Add a global announcement region for status updates
<div 
  role="status" 
  aria-live="polite" 
  aria-atomic="true"
  className="sr-only"
>
  {announcement}
</div>

// CSS for screen-reader-only content
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

**Icon Buttons**:
```jsx
<button aria-label="Connect wallet">
  <WalletIcon aria-hidden="true" />
</button>
```

**Status Announcements**:
```jsx
// Announce wallet connection status
const announce = (message) => {
  setAnnouncement(message)
  setTimeout(() => setAnnouncement(''), 1000)
}

// Usage
announce('Wallet connected successfully')
announce('Transaction pending...')
announce('Proposal submitted')
```

#### Tab Navigation (ARIA Tabs Pattern)
For tab-based interfaces, use proper ARIA roles and keyboard navigation.

**Requirements**:
- Use `role="tablist"` on the container
- Use `role="tab"` on each tab button
- Use `role="tabpanel"` on each content panel
- Use `aria-selected` to indicate active tab
- Use `aria-controls` to link tabs to panels
- Support arrow key navigation between tabs
- Only the active tab should have `tabIndex="0"`

**Complete Tab Implementation**:
```jsx
function Dashboard({ activeTab, setActiveTab }) {
  const tabs = ['daos', 'proposals', 'metrics', 'launchpad']
  
  const handleTabKeyDown = (e, currentTab) => {
    const currentIndex = tabs.indexOf(currentTab)
    
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % tabs.length
      setActiveTab(tabs[nextIndex])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
      setActiveTab(tabs[prevIndex])
    }
  }
  
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Dashboard Navigation">
        <button
          role="tab"
          aria-selected={activeTab === 'daos'}
          aria-controls="daos-panel"
          id="daos-tab"
          tabIndex={activeTab === 'daos' ? 0 : -1}
          onClick={() => setActiveTab('daos')}
          onKeyDown={(e) => handleTabKeyDown(e, 'daos')}
        >
          My DAOs
        </button>
        {/* More tabs... */}
      </div>
      
      <div
        role="tabpanel"
        id="daos-panel"
        aria-labelledby="daos-tab"
        hidden={activeTab !== 'daos'}
        tabIndex="0"
      >
        {activeTab === 'daos' && <DAOList />}
      </div>
    </>
  )
}
```

#### Motion & Animation
Respect `prefers-reduced-motion` for users with vestibular disorders:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

#### Form Accessibility
Forms must be fully accessible with proper labels, error handling, and validation feedback.

**Requirements**:
- All form inputs must have associated `<label>` elements
- Use `htmlFor` attribute on labels matching input `id`
- Required fields must have `required` attribute and `aria-required="true"`
- Use `aria-describedby` to link help text with inputs
- Error messages must be inline and use `role="alert"` with `aria-live="assertive"`
- Invalid inputs must have `aria-invalid="true"`
- Focus first error field when validation fails
- Preserve form state on errors (don't clear fields)

**Complete Form Pattern**:
```jsx
const [errors, setErrors] = useState({})
const titleRef = useRef(null)

const validateForm = () => {
  const newErrors = {}
  if (!formData.title.trim()) {
    newErrors.title = 'Proposal title is required'
  }
  setErrors(newErrors)
  
  // Focus first error
  if (Object.keys(newErrors).length > 0) {
    titleRef.current?.focus()
  }
  
  return Object.keys(newErrors).length === 0
}

// In JSX:
<div className="form-group">
  <label htmlFor="proposalTitle">
    Proposal Title
    <span className="required" aria-label="required">*</span>
  </label>
  <input 
    ref={titleRef}
    id="proposalTitle"
    type="text"
    value={formData.title}
    onChange={handleChange}
    required
    aria-required="true"
    aria-describedby="titleHelp"
    aria-invalid={errors.title ? "true" : "false"}
  />
  <small id="titleHelp">Brief, descriptive title for your proposal</small>
  {errors.title && (
    <span 
      className="error-text" 
      role="alert"
      aria-live="assertive"
    >
      {errors.title}
    </span>
  )}
</div>
```

**Error Styling**:
```css
.error-text {
  color: var(--danger-color);
  font-size: 0.875rem;
  margin-top: 0.25rem;
  display: block;
}

input[aria-invalid="true"],
textarea[aria-invalid="true"] {
  border-color: var(--danger-color);
}
```

#### Color Independence
Information must never be conveyed by color alone - always use additional visual indicators.

**Requirements**:
- Use icons + color for status indicators (not color alone)
- Text labels must accompany all color-coded information
- Charts and graphs must use patterns or textures in addition to color
- Different shapes or icons for different data categories

**Status Indicator Pattern**:
```jsx
// ❌ WRONG - Color only
<span className="status-badge" style={{ backgroundColor: statusColor }}>
  {status}
</span>

// ✅ CORRECT - Icon + Color + Text
function StatusBadge({ status }) {
  const icons = {
    'Active': '✓',
    'Reviewing': '⏳',
    'Cancelled': '⛔',
    'Executed': '✅',
    'Forfeited': '❌'
  }
  
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span className="status-icon" aria-hidden="true">
        {icons[status]}
      </span>
      {status}
    </span>
  )
}
```

**PASS/FAIL Token Pattern**:
```jsx
// Market price indicators with icons
<div className="price-item pass">
  <span className="token-icon" aria-hidden="true">↑</span>
  <div className="token-label">PASS Token</div>
  <div className="price">0.52 ETC</div>
  <div className="probability">52% probability</div>
</div>

<div className="price-item fail">
  <span className="token-icon" aria-hidden="true">↓</span>
  <div className="token-label">FAIL Token</div>
  <div className="price">0.48 ETC</div>
  <div className="probability">48% probability</div>
</div>
```

**CSS for Status Colors**:
```css
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.status-active {
  background: var(--success-color);
  color: white;
}

.status-reviewing {
  background: var(--warning-color);
  color: white;
}

.status-forfeited {
  background: var(--danger-color);
  color: white;
}
```

---

## Dark Mode Design

### Current Implementation
The application uses a dark theme by default for the main interface:
- Reduces eye strain during extended use
- Emphasizes data and content
- Creates professional, modern aesthetic

### Dark Mode Best Practices
1. **Use elevated surfaces**: Lighter backgrounds for cards (not darker)
2. **Reduce pure white**: Use off-white (#f1f5f9) to reduce glare
3. **Increase shadows**: Use more pronounced shadows for depth
4. **Adjust colors**: Slightly desaturate colors in dark mode

### Light Mode (Landing Pages)
Landing pages and marketing content use light backgrounds for:
- Better first impressions
- Higher trust signals
- Easier scanning and reading

---

## Logo & Brand Assets

### Logo Usage

#### ClearPath Logo
- **Primary use**: Platform selector, ClearPath application header
- **Minimum size**: 120px wide
- **Clear space**: Minimum 20px around logo
- **File**: `/public/logo_clearpath.png`

#### FairWins Logo
- **Primary use**: Platform selector, FairWins application header
- **Minimum size**: 120px wide
- **Clear space**: Minimum 20px around logo
- **File**: `/public/logo_fairwins.png`

#### Combined Logo
- **Primary use**: Shared documentation, landing pages
- **File**: `/public/logo_fwcp.png`

### Logo Don'ts
- Don't change logo colors
- Don't distort or stretch
- Don't add effects (shadows, gradients)
- Don't use on busy backgrounds without proper contrast

---

## Voice & Tone

### ClearPath Voice
- **Professional**: Institutional-grade language
- **Confident**: Decisive, authoritative
- **Clear**: No jargon, explain complex concepts simply
- **Trustworthy**: Transparent, honest about limitations

**Example**: "Institutional-grade governance through prediction markets"

### FairWins Voice
- **Direct**: Peer-to-peer, no middleman
- **Social**: Challenge friends, settle debates
- **Trustless**: Oracles resolve it, escrow holds the stakes
- **Engaging**: Casual, energetic, fun

**Example**: "Bet your friend. Oracle resolves it. Winner takes all."

### Shared Principles
- Be concise — respect users' time
- Use active voice
- Avoid blockchain jargon unless necessary
- Write for 8th-grade reading level

---

## Design Principles for Dynamic/Reactive UX

### 1. Immediate Feedback
Every user action should have immediate visual feedback:
- Button states (hover, active, disabled)
- Loading indicators during async operations
- Success/error notifications
- Optimistic UI updates when safe

### 2. Progressive Disclosure
Don't overwhelm users with all information at once:
- Show essential information first
- Use expandable sections for details
- Progressive form steps for complex inputs
- Contextual help and tooltips

### 3. Real-time Updates
Blockchain applications require constant state synchronization:
- Poll for updates every 5-10 seconds
- Use WebSocket connections when available
- Show "last updated" timestamps
- Indicate when data is stale

### 4. Error Recovery
Make errors recoverable and understandable:
- Clear error messages in plain language
- Suggest corrective actions
- Auto-retry failed operations
- Preserve form state on errors

### 5. Performance Perception
Make the app feel fast even when it's not:
- Skeleton screens during loading
- Optimistic updates
- Lazy load images and heavy components
- Cache frequently accessed data

### 6. State Visibility
Users should always know where they are and what's happening:
- Show connection status (wallet, network)
- Display transaction states (pending, confirmed, failed)
- Indicate loading states clearly
- Use breadcrumbs for navigation context

---

## Platform-Specific Guidelines

### ClearPath Design Patterns
- Emphasize **data and metrics** prominently
- Use **tables and charts** for governance data
- Include **timeline visualizations** for proposals
- Show **voting power** and participation stats
- Highlight **privacy features** prominently

### FairWins Design Patterns
- Emphasize **wager status** (active, pending, resolved, won, lost)
- Show **stake amounts** and oracle source prominently
- Display **participant info** (1v1, invite status)
- Make **QR code / invite sharing** frictionless
- Show **oracle resolution criteria** clearly

---

## Implementation Notes

### CSS Architecture
- Use CSS custom properties (variables) for theming
- Follow BEM or utility-first naming conventions
- Component-scoped CSS files
- Avoid global styles except for resets

### React Best Practices
- Use functional components with hooks
- Implement proper loading and error states
- Memoize expensive computations
- Use proper TypeScript types (if migrating)

### Web3 Integration
- Show clear wallet connection flow
- Handle network switching gracefully
- Display gas estimates before transactions
- Explain transaction outcomes in plain language

---

## Future Considerations

### Potential Enhancements
1. **Light/Dark Mode Toggle**: Allow user preference
2. **Theme Customization**: Let DAOs customize colors
3. **Internationalization**: Support multiple languages
4. **Advanced Charts**: More sophisticated data visualization
5. **Mobile App**: Native iOS/Android applications

### Design System Evolution
- Create a comprehensive component library
- Document all components in Storybook
- Establish design tokens system
- Build accessibility testing into CI/CD

---

## Resources

### Design Tools
- **Figma**: For mockups and prototyping
- **ColorContrast Checker**: Verify WCAG compliance
- **Chrome DevTools**: Lighthouse audits for accessibility

### Further Reading
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Design](https://material.io/design) - Component patterns
- [Inclusive Design Principles](https://inclusivedesignprinciples.org/)
- [Web3 Design Principles](https://web3designprinciples.com/)

---

**Last Updated**: February 2026
**Version**: 2.0 (P2P Wager Pivot)
**Maintainer**: ChipprRobotics Design Team
