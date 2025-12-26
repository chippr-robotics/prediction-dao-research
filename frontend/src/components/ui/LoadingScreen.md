# LoadingScreen Component

## Overview

The `LoadingScreen` component is a universal animated loading indicator featuring the FairWins 4-leaf clover logo with a checkmark animation. It can be used anywhere in the application where loading indication is needed.

## Features

- **Smooth SVG animations**: The clover leaves expand from the center, followed by a checkmark drawing in
- **Performance optimized**: Lightweight SVG with CSS animations for minimal render impact
- **Accessible**: Respects `prefers-reduced-motion`, includes proper ARIA attributes and screen reader support
- **Theme aware**: Automatically adapts to light/dark themes using CSS variables
- **Flexible**: Can be used as a fullscreen overlay or inline component
- **Customizable**: Multiple size variants and custom text support

## Animation Sequence

1. **Clover expansion** (0-1.5s): Four leaves expand/unfold from the center in sequence
2. **Checkmark draw** (1.2-1.8s): A checkmark is drawn in the center of the clover
3. **Continuous pulse** (2s+): The entire logo pulses gently while loading continues

## Usage

### Basic Usage - Fullscreen Overlay

```jsx
import { LoadingScreen } from './components/ui'

function MyComponent() {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <>
      <LoadingScreen visible={isLoading} />
      {/* Your content */}
    </>
  )
}
```

### Inline Loading Indicator

```jsx
function DataPanel() {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="panel">
      {isLoading ? (
        <LoadingScreen visible={true} inline size="small" />
      ) : (
        <DataDisplay />
      )}
    </div>
  )
}
```

### With Custom Text

```jsx
<LoadingScreen 
  visible={isLoading} 
  text="Fetching market data" 
/>
```

### With Animation Callback

```jsx
<LoadingScreen 
  visible={isLoading}
  onAnimationComplete={() => {
    console.log('Initial animation complete')
  }}
/>
```

### Different Sizes

```jsx
{/* Small - 60x60px */}
<LoadingScreen visible={isLoading} size="small" />

{/* Medium (default) - 120x120px */}
<LoadingScreen visible={isLoading} size="medium" />

{/* Large - 180x180px */}
<LoadingScreen visible={isLoading} size="large" />
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `visible` | `boolean` | `true` | Controls visibility of the loading screen |
| `text` | `string` | `"Loading"` | Loading text to display below the logo |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | Size variant of the logo |
| `inline` | `boolean` | `false` | If true, renders inline instead of as a fullscreen overlay |
| `className` | `string` | `''` | Additional CSS classes to apply |
| `onAnimationComplete` | `function` | `undefined` | Callback fired when initial animation completes (~2s) |

## Common Use Cases

### Initial Page Load

Place in your main App component to show while the app initializes:

```jsx
function App() {
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    initializeApp().then(() => setIsInitializing(false))
  }, [])

  return (
    <>
      <LoadingScreen visible={isInitializing} text="Initializing app" />
      <MainApp />
    </>
  )
}
```

### Async Data Fetching

Show while fetching data from an API or blockchain:

```jsx
function MarketList() {
  const { data, isLoading } = useQuery('markets', fetchMarkets)

  if (isLoading) {
    return <LoadingScreen visible={true} inline text="Loading markets" />
  }

  return <MarketGrid markets={data} />
}
```

### During Transactions

Display while waiting for blockchain transactions:

```jsx
function TransactionButton() {
  const [isPending, setIsPending] = useState(false)

  const handleTransaction = async () => {
    setIsPending(true)
    try {
      await sendTransaction()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <LoadingScreen 
        visible={isPending} 
        text="Processing transaction"
      />
      <button onClick={handleTransaction}>Send</button>
    </>
  )
}
```

### Route Transitions

Show during navigation between routes:

```jsx
function AppRouter() {
  const [isNavigating, setIsNavigating] = useState(false)
  const navigate = useNavigate()

  const handleNavigate = (path) => {
    setIsNavigating(true)
    navigate(path)
    // Hide after route change
    setTimeout(() => setIsNavigating(false), 500)
  }

  return (
    <>
      <LoadingScreen visible={isNavigating} />
      <Routes>
        {/* Your routes */}
      </Routes>
    </>
  )
}
```

## Styling & Theming

The LoadingScreen automatically uses theme colors from CSS variables:

- `--bg-primary`: Background color
- `--brand-primary`: Clover color (Kelly Green #2D7A4F)
- `--brand-secondary`: Checkmark color (Bright Green #34A853)
- `--text-secondary`: Text color

These are defined in `theme.css` and work with both light/dark modes and FairWins/ClearPath platforms.

### Custom Styling

You can override styles using the `className` prop:

```jsx
// custom-loading.css
.my-loading {
  background: linear-gradient(to bottom, #1a1a1a, #2a2a2a);
}

// component
<LoadingScreen visible={true} className="my-loading" />
```

## Accessibility

The component follows WCAG 2.1 AA guidelines:

- **ARIA attributes**: Proper `role="status"`, `aria-live="polite"`, `aria-busy`
- **Screen reader support**: Announces loading state with text
- **Reduced motion**: Respects `prefers-reduced-motion` media query
- **Keyboard navigation**: Does not trap focus (fullscreen mode)
- **Color contrast**: Uses brand colors with sufficient contrast ratios

## Performance Considerations

- **Lightweight**: Total size ~8KB (component + styles)
- **CSS animations**: Uses GPU-accelerated transforms for smooth 60fps animation
- **No JavaScript animation**: Pure CSS for better performance
- **Lazy loading friendly**: Can be code-split if needed
- **Mobile optimized**: Minimal impact on initial render time

## Browser Support

Works in all modern browsers that support:
- CSS animations
- CSS transforms
- SVG
- ES6+ JavaScript

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## Examples

### Complete Integration Example

```jsx
import { useState, useEffect } from 'react'
import { LoadingScreen } from './components/ui'

function FairWinsApp() {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    async function loadData() {
      try {
        // Simulate API call
        const response = await fetch('/api/markets')
        const json = await response.json()
        setData(json)
      } catch (error) {
        console.error('Failed to load:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  return (
    <div className="app">
      <LoadingScreen 
        visible={isLoading} 
        text="Loading FairWins"
        onAnimationComplete={() => console.log('Animation done')}
      />
      
      {!isLoading && data && (
        <main>
          {/* App content */}
        </main>
      )}
    </div>
  )
}
```

## Testing

The component includes comprehensive unit tests covering:
- Rendering in different states
- All prop variants
- Animation callbacks
- Accessibility compliance
- Visibility toggling

Run tests with:
```bash
npm test -- LoadingScreen.test.jsx
```

## Future Enhancements

Potential improvements for future versions:
- Progress bar variant for determinate loading
- Custom animation speeds
- Additional logo variants
- Sound effects (optional, off by default)
- More sophisticated animation sequences

## Support

For questions or issues:
1. Check this documentation
2. Review the component source code and tests
3. Search existing issues in the repository
4. Create a new issue with detailed reproduction steps
