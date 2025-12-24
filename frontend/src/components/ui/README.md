# UI Component Library

A reusable React component library for the ClearPath & FairWins platform suite. All components follow the brand design system defined in `DESIGN_GUIDE.md` and implement WCAG 2.1 AA accessibility standards.

## Components

### Button

Reusable button component with primary and secondary variants, plus loading states.

**Props:**
- `variant` (string): 'primary' | 'secondary' - Button style variant (default: 'primary')
- `loading` (boolean): Show loading state with spinner (default: false)
- `disabled` (boolean): Disable the button (default: false)
- `onClick` (function): Click handler
- `type` (string): Button type - 'button' | 'submit' | 'reset' (default: 'button')
- `ariaLabel` (string): Accessible label for icon-only buttons
- `className` (string): Additional CSS classes

**Examples:**

```jsx
import { Button } from '@/components/ui'

// Primary button
<Button onClick={handleSubmit}>
  Submit Proposal
</Button>

// Secondary button
<Button variant="secondary" onClick={handleCancel}>
  Cancel
</Button>

// Loading state
<Button loading={isProcessing} disabled>
  Processing...
</Button>

// Icon-only button
<Button ariaLabel="Close modal" onClick={handleClose}>
  ✕
</Button>
```

**Accessibility Features:**
- Keyboard accessible (Tab, Enter, Space)
- Visible focus indicators
- ARIA attributes (aria-busy for loading state)
- Disabled state properly communicated
- Supports prefers-reduced-motion

---

### Card

Container component with optional hover effects and interactive states.

**Props:**
- `children` (node): Card content
- `hover` (boolean): Enable hover effect (default: false)
- `onClick` (function): Click handler for interactive cards
- `role` (string): ARIA role (automatically set to 'button' if onClick provided)
- `tabIndex` (number): Tab index for keyboard navigation
- `onKeyDown` (function): Keyboard event handler
- `ariaLabel` (string): Accessible label for interactive cards
- `className` (string): Additional CSS classes

**Examples:**

```jsx
import { Card } from '@/components/ui'

// Basic card
<Card>
  <h3>Proposal Title</h3>
  <p>Description of the proposal...</p>
</Card>

// Card with hover effect
<Card hover>
  <h3>Interactive Card</h3>
  <p>Hover over me!</p>
</Card>

// Clickable card (automatically adds role="button" and keyboard support)
<Card 
  onClick={() => navigate('/proposal/123')}
  ariaLabel="View proposal details"
  hover
>
  <h3>Clickable Proposal Card</h3>
  <p>Click to view details</p>
</Card>
```

**Accessibility Features:**
- Keyboard accessible for interactive cards (Enter, Space)
- Visible focus indicators
- Automatic ARIA role assignment
- Proper keyboard event handling
- Supports prefers-reduced-motion

---

### Badge

Status badge component with semantic color variants.

**Props:**
- `children` (node): Badge content
- `variant` (string): 'success' | 'warning' | 'danger' | 'neutral' - Color variant (default: 'neutral')
- `icon` (string): Optional icon (emoji or text) to display
- `className` (string): Additional CSS classes

**Examples:**

```jsx
import { Badge } from '@/components/ui'

// Success badge
<Badge variant="success">Active</Badge>

// Warning badge with icon
<Badge variant="warning" icon="⏳">Pending</Badge>

// Danger badge
<Badge variant="danger" icon="❌">Failed</Badge>

// Neutral badge
<Badge variant="neutral">Draft</Badge>
```

**Accessibility Features:**
- Icons are marked as aria-hidden (semantic meaning provided by text)
- Color is not the only indicator (icon + text)
- Sufficient color contrast ratios

---

### StatusIndicator

Status indicator with predefined icons and colors. Never relies on color alone for information.

**Props:**
- `status` (string): 'active' | 'pending' | 'reviewing' | 'cancelled' | 'executed' | 'forfeited' | 'completed' | 'failed'
- `customIcon` (string): Override default icon
- `customLabel` (string): Override default label
- `className` (string): Additional CSS classes

**Examples:**

```jsx
import { StatusIndicator } from '@/components/ui'

// Predefined statuses
<StatusIndicator status="active" />
<StatusIndicator status="pending" />
<StatusIndicator status="reviewing" />
<StatusIndicator status="cancelled" />
<StatusIndicator status="executed" />
<StatusIndicator status="forfeited" />
<StatusIndicator status="completed" />
<StatusIndicator status="failed" />

// Custom status
<StatusIndicator 
  status="pending" 
  customIcon="🔄" 
  customLabel="In Progress" 
/>
```

**Accessibility Features:**
- Icons + color + text label (never color alone)
- Icons marked as aria-hidden (text provides meaning)
- Sufficient color contrast ratios
- Clear visual distinction between states

---

### Input

Reusable input field with accessibility support and error states.

**Props:**
- `type` (string): Input type - 'text' | 'email' | 'password' | 'number' | etc. (default: 'text')
- `value` (string): Input value
- `onChange` (function): Change handler
- `placeholder` (string): Placeholder text
- `disabled` (boolean): Disabled state (default: false)
- `required` (boolean): Required field (default: false)
- `id` (string): Input ID (required for label association)
- `error` (boolean): Error state (default: false)
- `ariaDescribedBy` (string): ID of description element
- `ariaInvalid` (string): Invalid state for screen readers
- `className` (string): Additional CSS classes

**Examples:**

```jsx
import { Input } from '@/components/ui'

// Basic input
<Input 
  id="title"
  type="text"
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  placeholder="Enter title..."
/>

// Required input
<Input 
  id="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  required
  ariaDescribedBy="email-help"
/>

// Input with error state
<Input 
  id="amount"
  type="number"
  value={amount}
  onChange={(e) => setAmount(e.target.value)}
  error={!!errorMessage}
  ariaInvalid="true"
  ariaDescribedBy="amount-error"
/>
```

**Accessibility Features:**
- Proper ARIA attributes
- Visible focus indicators
- Error state communicated to screen readers
- Required attribute for form validation
- Responsive font size (16px+ on mobile to prevent zoom)
- Supports prefers-reduced-motion

---

### FormGroup

Complete form field with label, input, helper text, and error handling.

**Props:**
- `label` (string): Label text
- `id` (string): Input ID (required for label association)
- `type` (string): Input type (default: 'text')
- `value` (string): Input value
- `onChange` (function): Change handler
- `placeholder` (string): Placeholder text
- `required` (boolean): Required field (default: false)
- `disabled` (boolean): Disabled state (default: false)
- `helperText` (string): Helper text below input
- `error` (string): Error message (shows error state if provided)
- `className` (string): Additional CSS classes

**Examples:**

```jsx
import { FormGroup } from '@/components/ui'

// Basic form field
<FormGroup
  label="Proposal Title"
  id="proposalTitle"
  value={formData.title}
  onChange={(e) => handleChange('title', e.target.value)}
  placeholder="Enter a descriptive title"
  helperText="Brief, clear description of your proposal"
/>

// Required field
<FormGroup
  label="Email Address"
  id="email"
  type="email"
  value={formData.email}
  onChange={(e) => handleChange('email', e.target.value)}
  required
  helperText="We'll never share your email"
/>

// Field with error
<FormGroup
  label="Amount"
  id="amount"
  type="number"
  value={formData.amount}
  onChange={(e) => handleChange('amount', e.target.value)}
  required
  error={errors.amount}
/>
```

**Accessibility Features:**
- Label properly associated with input via htmlFor/id
- Required indicator (*) with aria-label
- Helper text linked via aria-describedby
- Error messages use role="alert" and aria-live="assertive"
- Error state communicated via aria-invalid
- Proper focus management

---

### HelperText

Small descriptive text for forms and other UI elements.

**Props:**
- `children` (node): Helper text content
- `id` (string): ID for aria-describedby association
- `variant` (string): 'helper' | 'error' - Text variant (default: 'helper')
- `className` (string): Additional CSS classes

**Examples:**

```jsx
import { HelperText } from '@/components/ui'

// Helper text
<HelperText id="title-help">
  Choose a clear, concise title for your proposal
</HelperText>

// Error text
<HelperText id="email-error" variant="error" role="alert">
  Please enter a valid email address
</HelperText>
```

**Accessibility Features:**
- Can be associated with inputs via aria-describedby
- Error variant uses appropriate styling and can include role="alert"
- Semantic HTML (uses <small> tag)

---

## Design System Integration

All components use CSS custom properties from the brand design system:

### Colors
```css
--primary-color: #2D7A4F;      /* Kelly Green - Main brand */
--secondary-color: #34A853;     /* Bright Green - Accents */
--hover-color: #245c3d;         /* Dark Green - Hover states */
--bg-dark: #0f1810;            /* Deep forest - Main background */
--bg-light: #1a2820;           /* Forest gray - Card backgrounds */
--text-primary: #f1f5f9;       /* Off-white - Primary text */
--text-secondary: #94a3b8;     /* Slate gray - Secondary text */
--border-color: #2D7A4F;       /* Kelly green - Borders */
--success-color: #22c55e;      /* Green - Success states */
--warning-color: #f59e0b;      /* Amber - Warnings */
--danger-color: #dc2626;       /* Red - Errors */
```

### Typography
System font stack provides optimal performance:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
  'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

### Spacing
Consistent spacing scale:
```css
--space-xs: 0.25rem;   /* 4px */
--space-sm: 0.5rem;    /* 8px */
--space-md: 1rem;      /* 16px */
--space-lg: 1.5rem;    /* 24px */
--space-xl: 2rem;      /* 32px */
--space-2xl: 3rem;     /* 48px */
```

---

## Accessibility Compliance

All components meet WCAG 2.1 AA standards:

### Keyboard Navigation
✓ All interactive elements accessible via keyboard (Tab, Enter, Space)  
✓ Visible focus indicators on all focusable elements  
✓ Logical tab order  
✓ No keyboard traps  

### Screen Reader Support
✓ Semantic HTML elements  
✓ Proper ARIA attributes  
✓ Form labels associated with inputs  
✓ Error messages announced via aria-live regions  
✓ Icons marked as aria-hidden when decorative  

### Visual Accessibility
✓ Color contrast ratios meet WCAG AA (4.5:1 for normal text, 3:1 for large text)  
✓ Information never conveyed by color alone (icons + text)  
✓ Focus indicators visible on all interactive elements  
✓ Text readable at 200% zoom  

### Motion Sensitivity
✓ All components respect prefers-reduced-motion  
✓ Animations disabled or minimized for users with vestibular disorders  

---

## Testing Checklist

Before deploying components, verify:

### Manual Testing
- [ ] Keyboard navigation works (Tab, Enter, Space)
- [ ] Focus indicators visible on all interactive elements
- [ ] Screen reader announces content correctly
- [ ] All form fields have associated labels
- [ ] Error messages are announced
- [ ] Interactive cards respond to Enter/Space keys
- [ ] Buttons show loading state appropriately
- [ ] All statuses display icon + color + text

### Automated Testing
- [ ] Run Lighthouse accessibility audit (target: 100 score)
- [ ] Run axe DevTools (0 violations)
- [ ] Test with keyboard only (no mouse)
- [ ] Test with screen reader (NVDA/JAWS/VoiceOver)
- [ ] Test with prefers-reduced-motion enabled
- [ ] Test color contrast with Chrome DevTools

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Usage in Application

Import components individually or as a group:

```jsx
// Individual imports
import { Button } from '@/components/ui'
import { Card } from '@/components/ui'

// Group import
import { Button, Card, Badge, FormGroup } from '@/components/ui'

// Use in component
function ProposalForm() {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  return (
    <Card>
      <FormGroup
        label="Proposal Title"
        id="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        error={error}
        helperText="Clear, concise title for your proposal"
      />
      
      <Button onClick={handleSubmit} loading={isSubmitting}>
        Submit Proposal
      </Button>
    </Card>
  )
}
```

---

## Contributing

When adding new components:

1. Follow existing patterns and naming conventions
2. Implement full accessibility support (keyboard, screen reader, ARIA)
3. Add focus indicators and prefers-reduced-motion support
4. Use brand design system colors and spacing
5. Create comprehensive documentation with examples
6. Test with keyboard, screen reader, and automated tools

---

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Best Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Design Guide](../../../DESIGN_GUIDE.md)
- [Frontend Build Book](../../../FRONTEND_BUILD_BOOK.md)

---

**Last Updated**: December 2024  
**Version**: 1.0  
**Maintainer**: ChipprRobotics Engineering Team
