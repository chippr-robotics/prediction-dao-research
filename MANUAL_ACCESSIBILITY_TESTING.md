# Manual Accessibility Testing Checklist

## Overview
This document provides comprehensive manual accessibility testing procedures to ensure WCAG 2.1 AA compliance before deployment. All tests must pass before merging to main branch.

## Testing Schedule
- **Required**: Before every production deployment
- **Recommended**: During feature development
- **Platforms**: Desktop (Windows/Mac/Linux), Mobile (iOS/Android)
- **Browsers**: Chrome, Firefox, Safari, Edge

---

## 1. Keyboard Navigation Testing

### Test Setup
- **Tools Required**: Keyboard only (no mouse)
- **Test Duration**: 15-20 minutes
- **Passing Criteria**: All interactive elements accessible and logical tab order

### Test Procedure

#### 1.1 Tab Navigation
- [ ] Press `Tab` key to navigate through all interactive elements
- [ ] Verify tab order follows visual layout (left to right, top to bottom)
- [ ] Confirm all buttons, links, and form inputs are reachable
- [ ] Verify no keyboard traps (can always tab away from an element)
- [ ] Check that hidden/collapsed content is skipped in tab order

#### 1.2 Focus Indicators
- [ ] Verify focus indicator visible on ALL interactive elements
- [ ] Confirm focus indicator has minimum 2px outline
- [ ] Check focus indicator color contrast meets 3:1 ratio
- [ ] Verify focus indicator not removed or hidden by CSS
- [ ] Test focus indicators on all button variants (primary, secondary, disabled)

#### 1.3 Keyboard Shortcuts
- [ ] `Enter` key activates focused buttons and links
- [ ] `Space` key activates focused buttons
- [ ] `Escape` key closes modals and dropdowns
- [ ] Arrow keys work for navigation where applicable
- [ ] No conflicting keyboard shortcuts with browser/OS

#### 1.4 Form Navigation
- [ ] Tab through all form fields in logical order
- [ ] Shift+Tab navigates backwards correctly
- [ ] Enter key submits forms when appropriate
- [ ] Required field validation works with keyboard only
- [ ] Error messages are keyboard accessible

**Results**:
```
Date Tested: __________
Tester: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
Issues Found: __________
```

---

## 2. Screen Reader Testing

### Test Setup
- **Windows**: NVDA (free) or JAWS
- **Mac**: VoiceOver (built-in)
- **Test Duration**: 20-30 minutes
- **Passing Criteria**: All content announced correctly and comprehensible

### Test Procedure

#### 2.1 Content Announcement
- [ ] Page title announced when page loads
- [ ] Headings announced with proper level (h1, h2, etc.)
- [ ] All text content is readable
- [ ] Lists announced as lists with item count
- [ ] Tables announced with row/column information

#### 2.2 Interactive Elements
- [ ] Buttons announced as "button" with clear label
- [ ] Links announced as "link" with descriptive text
- [ ] Form labels read before input fields
- [ ] Required fields announced as "required"
- [ ] Button states (disabled, loading) announced
- [ ] Checkbox/radio button states announced

#### 2.3 Dynamic Content
- [ ] ARIA live regions announce updates
- [ ] Loading states announced ("loading" or "busy")
- [ ] Success/error messages announced
- [ ] Modal dialogs announced when opened
- [ ] Content changes announced appropriately
- [ ] No irrelevant announcements or repetition

#### 2.4 Images and Icons
- [ ] All images have descriptive alt text
- [ ] Decorative images have empty alt=""
- [ ] Icon buttons have proper aria-label
- [ ] Status icons have text labels (not just color)
- [ ] Complex images have extended descriptions

#### 2.5 Navigation
- [ ] Landmark regions properly identified (header, nav, main, footer)
- [ ] Skip-to-content link present and functional
- [ ] Navigation menu structure clear
- [ ] Current page/section indicated
- [ ] Breadcrumbs announced correctly

**Results**:
```
Date Tested: __________
Tester: __________
Screen Reader: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
Issues Found: __________
```

---

## 3. Visual Accessibility Testing

### Test Setup
- **Tools Required**: Browser DevTools, color picker
- **Test Duration**: 15-20 minutes
- **Passing Criteria**: All visual elements meet WCAG AA standards

### Test Procedure

#### 3.1 Color Contrast
- [ ] Normal text (< 18pt) has 4.5:1 contrast ratio minimum
- [ ] Large text (≥ 18pt) has 3:1 contrast ratio minimum
- [ ] UI components have 3:1 contrast ratio minimum
- [ ] Focus indicators have 3:1 contrast ratio
- [ ] Test with Chrome DevTools color picker

#### 3.2 Color Independence
- [ ] No information conveyed by color alone
- [ ] Status indicators include icons + color
- [ ] Required fields marked with asterisk + color
- [ ] Error states use icon + color + text
- [ ] Charts/graphs have patterns or labels

#### 3.3 Text and Zoom
- [ ] Text remains readable at 200% zoom
- [ ] No horizontal scrolling at 200% zoom
- [ ] Layout doesn't break at 200% zoom
- [ ] Text can be resized without loss of functionality
- [ ] Minimum text size 16px (or 1rem)

#### 3.4 Visual Clarity
- [ ] Touch targets minimum 44x44px on mobile
- [ ] Sufficient spacing between interactive elements
- [ ] Text not justified (use left-align)
- [ ] Line height at least 1.5 for body text
- [ ] Paragraph spacing at least 1.5x line height

**Results**:
```
Date Tested: __________
Tester: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
Issues Found: __________
```

---

## 4. Motion and Animation Testing

### Test Setup
- **OS Settings**: Enable "Reduce Motion" preference
- **Test Duration**: 10 minutes
- **Passing Criteria**: All functionality works without animations

### Test Procedure

#### 4.1 Enable Reduce Motion
**Windows**: Settings > Ease of Access > Display > Show animations
**Mac**: System Preferences > Accessibility > Display > Reduce motion
**iOS**: Settings > Accessibility > Motion > Reduce Motion
**Android**: Settings > Accessibility > Remove animations

#### 4.2 Test with Reduce Motion Enabled
- [ ] Page loads without animations
- [ ] All transitions are instant or minimal
- [ ] No auto-playing videos or animations
- [ ] Parallax effects disabled
- [ ] Hover effects work without animation
- [ ] All functionality accessible without animations

#### 4.3 Motion Design
- [ ] No flashing content (< 3 flashes per second)
- [ ] Animations can be paused/stopped if auto-playing
- [ ] Infinite animations have pause control
- [ ] No motion-based navigation required

**Results**:
```
Date Tested: __________
Tester: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
Issues Found: __________
```

---

## 5. Color Blindness Testing

### Test Setup
- **Tools**: Chrome DevTools > Rendering > Emulate vision deficiencies
- **Test Duration**: 10 minutes
- **Passing Criteria**: All information accessible with color blindness

### Test Procedure

#### 5.1 Test Each Vision Deficiency
Test the following in DevTools:
- [ ] **Protanopia** (red-blind): ~1% of males
- [ ] **Deuteranopia** (green-blind): ~1% of males
- [ ] **Tritanopia** (blue-blind): rare
- [ ] **Achromatopsia** (no color vision): very rare

#### 5.2 Verify Information Access
For each vision deficiency:
- [ ] Status indicators distinguishable (have icons)
- [ ] Form errors visible and clear
- [ ] Required fields identifiable
- [ ] Links distinguishable from text (underline or bold)
- [ ] Charts/graphs readable with patterns

**Results**:
```
Date Tested: __________
Tester: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
Issues Found: __________
```

---

## 6. Mobile Accessibility Testing

### Test Setup
- **Devices**: iPhone, Android phone, tablet
- **Test Duration**: 15-20 minutes per device
- **Passing Criteria**: Fully accessible on mobile devices

### Test Procedure

#### 6.1 Touch Accessibility
- [ ] Touch targets minimum 44x44px
- [ ] Sufficient spacing between touch targets (8px minimum)
- [ ] Buttons large enough for average finger
- [ ] No touch targets overlap
- [ ] Pinch-to-zoom enabled

#### 6.2 Mobile Screen Readers
**iOS VoiceOver**: Settings > Accessibility > VoiceOver
**Android TalkBack**: Settings > Accessibility > TalkBack

- [ ] All content accessible with screen reader
- [ ] Swipe navigation works correctly
- [ ] Headings navigable with rotor/TalkBack menu
- [ ] Forms completable with screen reader
- [ ] Touch targets properly announced

#### 6.3 Mobile Responsiveness
- [ ] Layout adapts to small screens (320px+)
- [ ] No horizontal scrolling
- [ ] Text readable without zoom
- [ ] Form inputs don't cause page zoom (16px min)
- [ ] Interactive elements accessible in portrait and landscape

**Results**:
```
Date Tested: __________
Tester: __________
Device: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
Issues Found: __________
```

---

## 7. Cross-Browser Testing

### Test Setup
- **Browsers**: Chrome, Firefox, Safari, Edge
- **Test Duration**: 10 minutes per browser
- **Passing Criteria**: Consistent accessibility across browsers

### Test Procedure

#### 7.1 Test Each Browser
For each browser:
- [ ] All content renders correctly
- [ ] Focus indicators visible
- [ ] Keyboard navigation works
- [ ] Form validation works
- [ ] ARIA attributes respected
- [ ] No JavaScript errors in console

#### 7.2 Browser-Specific Features
- [ ] Chrome: Lighthouse audit passes
- [ ] Firefox: Accessibility inspector shows no errors
- [ ] Safari: VoiceOver works correctly
- [ ] Edge: Narrator works correctly

**Results**:
```
Date Tested: __________
Tester: __________
Browsers Tested: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
Issues Found: __________
```

---

## 8. Automated Tool Audits

### Required Tools
1. **Lighthouse** (Chrome DevTools)
2. **axe DevTools** (Browser extension)
3. **WAVE** (Browser extension)

### Test Procedure

#### 8.1 Lighthouse Audit
1. Open Chrome DevTools > Lighthouse
2. Select "Accessibility" category
3. Run audit on each major page
4. **Target Score**: 100
5. Fix all issues and re-run

**Pages to Test**:
- [ ] Landing page (/)
- [ ] Platform selector (/select)
- [ ] ClearPath app (/clearpath)
- [ ] FairWins app (/fairwins)

#### 8.2 axe DevTools Audit
1. Install axe DevTools extension
2. Open DevTools > axe DevTools
3. Click "Scan ALL of my page"
4. Review and fix all issues
5. **Target**: 0 violations

#### 8.3 WAVE Audit
1. Install WAVE extension
2. Click WAVE icon on each page
3. Review all errors and alerts
4. Fix all WCAG AA violations
5. **Target**: 0 errors

**Results**:
```
Date Tested: __________
Tester: __________
Lighthouse Score: __________/100
axe Violations: __________
WAVE Errors: __________
Status: ☐ Pass ☐ Fail ☐ Needs Review
```

---

## Pre-Deployment Checklist

Before merging to main and deploying to production, verify:

- [ ] All manual tests completed and passed
- [ ] Lighthouse accessibility score = 100
- [ ] axe DevTools shows 0 violations
- [ ] WAVE shows 0 errors
- [ ] Keyboard navigation fully functional
- [ ] Screen reader testing completed
- [ ] Mobile accessibility verified
- [ ] Cross-browser testing passed
- [ ] Color contrast meets WCAG AA
- [ ] Motion preferences respected
- [ ] Color blindness testing passed
- [ ] All issues documented and resolved

**Sign-off**:
```
Tester Name: __________
Date: __________
Signature: __________
```

---

## Issue Reporting Template

When accessibility issues are found, use this template:

```markdown
## Accessibility Issue

**Severity**: [ ] Critical [ ] High [ ] Medium [ ] Low

**WCAG Criterion**: [e.g., 1.4.3 Contrast (Minimum)]

**Description**: [Describe the issue]

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**: [What should happen]

**Actual Behavior**: [What actually happens]

**Affected Users**: [Who is impacted]

**Suggested Fix**: [How to fix]

**Screenshot/Recording**: [Attach if applicable]
```

---

## Resources

### Testing Tools
- **NVDA**: https://www.nvaccess.org/download/
- **axe DevTools**: https://www.deque.com/axe/devtools/
- **WAVE**: https://wave.webaim.org/extension/
- **Lighthouse**: Built into Chrome DevTools

### Guidelines
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/
- **MDN Accessibility**: https://developer.mozilla.org/en-US/docs/Web/Accessibility
- **WebAIM**: https://webaim.org/

### Training
- **Google Web Accessibility**: https://web.dev/accessibility/
- **Deque University**: https://dequeuniversity.com/
- **A11ycasts**: https://www.youtube.com/playlist?list=PLNYkxOF6rcICWx0C9LVWWVqvHlYJyqw7g

---

**Document Version**: 1.0
**Last Updated**: December 2024
**Maintained By**: Frontend Team
