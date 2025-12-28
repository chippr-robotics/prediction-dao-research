# Friend Market Warning UI Components

## Modal/Popup Warning (Required Before Creating Market)

This warning MUST be shown and acknowledged before users can create a friend group market.

### Warning Modal Design

```jsx
import React, { useState } from 'react';

export const FriendMarketWarningModal = ({ onAccept, onCancel }) => {
  const [hasReadSafety, setHasReadSafety] = useState(false);
  const [acknowledgeRisk, setAcknowledgeRisk] = useState(false);
  const [acknowledgeNoControl, setAcknowledgeNoControl] = useState(false);

  const canProceed = hasReadSafety && acknowledgeRisk && acknowledgeNoControl;

  return (
    <div className="modal-overlay" style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.7)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      zIndex: 9999 
    }}>
      <div className="warning-modal" style={{ 
        backgroundColor: '#fff',
        padding: '30px',
        borderRadius: '10px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '48px' }}>⚠️</span>
          <h2 style={{ color: '#d32f2f', marginTop: '10px' }}>
            IMPORTANT: Smart Contract Warning
          </h2>
        </div>

        <div className="warning-content" style={{ 
          backgroundColor: '#fff3cd',
          border: '2px solid #ffc107',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h3 style={{ marginTop: 0, color: '#856404' }}>
            ⚠️ No One Controls the Outcome
          </h3>
          <ul style={{ lineHeight: '1.8', color: '#856404' }}>
            <li><strong>Neither you, your opponent, nor FairWins can control or reverse</strong> the outcome of this smart contract once deployed</li>
            <li><strong>This is irreversible</strong> - funds cannot be recovered except through normal resolution</li>
            <li><strong>Smart contracts are permanent</strong> and operate autonomously</li>
          </ul>
        </div>

        <div className="risk-notice" style={{ 
          backgroundColor: '#f8d7da',
          border: '2px solid #dc3545',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h3 style={{ marginTop: 0, color: '#721c24' }}>
            🚨 USE AT YOUR OWN RISK
          </h3>
          <p style={{ color: '#721c24', marginBottom: '10px' }}>
            You are solely responsible for:
          </p>
          <ul style={{ lineHeight: '1.8', color: '#721c24' }}>
            <li>Verifying who you are betting with</li>
            <li>Understanding the bet terms</li>
            <li>Ensuring the arbitrator (if any) is trustworthy</li>
            <li>Reading and understanding the contract parameters</li>
          </ul>
          <p style={{ 
            fontWeight: 'bold', 
            color: '#721c24',
            marginTop: '15px',
            fontSize: '16px'
          }}>
            ⚠️ Only bet what you can afford to lose
          </p>
        </div>

        <div className="scam-warning" style={{ 
          backgroundColor: '#e7f3ff',
          border: '2px solid #2196f3',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <h3 style={{ marginTop: 0, color: '#0d47a1' }}>
            🛡️ How to Spot Scams
          </h3>
          <div style={{ color: '#0d47a1', fontSize: '14px', lineHeight: '1.6' }}>
            <strong>Red Flags - DO NOT participate if:</strong>
            <ul>
              <li>You don't know the other participants personally</li>
              <li>Terms are vague or unclear</li>
              <li>Arbitrator is one of the participants</li>
              <li>You're being pressured to act quickly</li>
              <li>Offers seem "too good to be true"</li>
            </ul>
            <p>
              <a href="/docs/FRIEND_MARKET_SAFETY_GUIDE.md" target="_blank" style={{ 
                color: '#1976d2',
                textDecoration: 'underline',
                fontWeight: 'bold'
              }}>
                → Read Full Safety Guide (REQUIRED READING)
              </a>
            </p>
          </div>
        </div>

        <div className="best-practices" style={{ 
          backgroundColor: '#e8f5e9',
          border: '2px solid #4caf50',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <h3 style={{ marginTop: 0, color: '#2e7d32' }}>
            ✅ Best Practices
          </h3>
          <ul style={{ color: '#2e7d32', fontSize: '14px', lineHeight: '1.6' }}>
            <li><strong>Only bet with trusted friends</strong> you know in real life</li>
            <li><strong>Use clear, specific terms</strong> for resolution</li>
            <li><strong>Consider market pegging</strong> to public markets for automatic settlement</li>
            <li><strong>Start with small amounts</strong> to test the system</li>
            <li><strong>Choose neutral arbitrators</strong> (never a participant)</li>
          </ul>
        </div>

        <div className="acknowledgments" style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block',
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '5px',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={hasReadSafety}
              onChange={(e) => setHasReadSafety(e.target.checked)}
              style={{ marginRight: '10px', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 'bold' }}>
              I have read and understand the{' '}
              <a href="/docs/FRIEND_MARKET_SAFETY_GUIDE.md" target="_blank">
                Complete Safety Guide
              </a>
            </span>
          </label>

          <label style={{ 
            display: 'block',
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '5px',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={acknowledgeNoControl}
              onChange={(e) => setAcknowledgeNoControl(e.target.checked)}
              style={{ marginRight: '10px', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 'bold' }}>
              I understand that <span style={{ color: '#d32f2f' }}>
                neither party nor FairWins can control or reverse
              </span> the smart contract outcome
            </span>
          </label>

          <label style={{ 
            display: 'block',
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '5px',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={acknowledgeRisk}
              onChange={(e) => setAcknowledgeRisk(e.target.checked)}
              style={{ marginRight: '10px', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 'bold' }}>
              I am using this <span style={{ color: '#d32f2f' }}>at my own risk</span> and 
              only betting what I can afford to lose
            </span>
          </label>
        </div>

        <div className="buttons" style={{ 
          display: 'flex',
          gap: '10px',
          justifyContent: 'space-between'
        }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '15px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            disabled={!canProceed}
            style={{
              flex: 1,
              padding: '15px',
              backgroundColor: canProceed ? '#4caf50' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              cursor: canProceed ? 'pointer' : 'not-allowed',
              fontWeight: 'bold'
            }}
          >
            I Understand - Proceed
          </button>
        </div>

        <div style={{ 
          marginTop: '15px',
          padding: '10px',
          backgroundColor: '#f5f5f5',
          borderRadius: '5px',
          fontSize: '12px',
          color: '#666',
          textAlign: 'center'
        }}>
          <strong>Questions?</strong> Contact support@fairwins.app<br/>
          <em>(Note: We cannot reverse smart contracts or control outcomes)</em>
        </div>
      </div>
    </div>
  );
};
```

### Usage Example

```jsx
import React, { useState } from 'react';
import { FriendMarketWarningModal } from './FriendMarketWarningModal';

export const CreateFriendMarketButton = () => {
  const [showWarning, setShowWarning] = useState(false);

  const handleCreateClick = () => {
    setShowWarning(true);
  };

  const handleAccept = () => {
    setShowWarning(false);
    // Proceed to market creation form
    navigateToMarketCreation();
  };

  const handleCancel = () => {
    setShowWarning(false);
  };

  return (
    <>
      <button onClick={handleCreateClick}>
        Create Friend Market
      </button>
      
      {showWarning && (
        <FriendMarketWarningModal
          onAccept={handleAccept}
          onCancel={handleCancel}
        />
      )}
    </>
  );
};
```

## Additional Warning Badges/Indicators

### Market Page Warning Banner

```jsx
export const FriendMarketBanner = () => (
  <div style={{
    backgroundColor: '#fff3cd',
    border: '2px solid #ffc107',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  }}>
    <span style={{ fontSize: '32px' }}>⚠️</span>
    <div>
      <strong style={{ color: '#856404', fontSize: '16px' }}>
        Friend Market - Use Caution
      </strong>
      <p style={{ margin: '5px 0 0 0', color: '#856404' }}>
        Smart contracts are irreversible. Neither party nor FairWins controls outcomes.{' '}
        <a href="/docs/FRIEND_MARKET_SAFETY_GUIDE.md" style={{ color: '#856404', textDecoration: 'underline' }}>
          Read Safety Guide
        </a>
      </p>
    </div>
  </div>
);
```

### Before Transaction Confirmation

```jsx
export const TransactionWarning = ({ amount, action }) => (
  <div style={{
    backgroundColor: '#f8d7da',
    border: '1px solid #dc3545',
    borderRadius: '5px',
    padding: '10px',
    marginBottom: '15px'
  }}>
    <div style={{ color: '#721c24', fontSize: '14px' }}>
      <strong>⚠️ Final Warning</strong>
      <p style={{ margin: '5px 0 0 0' }}>
        You are about to {action} {amount}. This transaction is <strong>irreversible</strong>.
        Make sure you trust all participants and understand the terms.
      </p>
    </div>
  </div>
);
```

## Implementation Checklist

### Required Before Launch

- [ ] Implement warning modal on all friend market creation flows
- [ ] Add warning banner on friend market detail pages
- [ ] Show transaction warning before each bet placement
- [ ] Link to complete safety guide in all warnings
- [ ] Require all three checkboxes before proceeding
- [ ] Add "Report Suspicious Market" button on all friend markets
- [ ] Display scam indicators on market pages
- [ ] Test that warnings cannot be bypassed
- [ ] Add analytics to track warning acknowledgment rates
- [ ] Legal review of warning language

### Best Practices for Display

1. **Always Show Before First Action**
   - First time creating friend market
   - First time joining friend market
   - Before each transaction (abbreviated)

2. **Cannot Be Dismissed Without Reading**
   - Require scrolling through content
   - Require checking all boxes
   - Add delay before "Proceed" button activates (5 seconds)

3. **Multiple Reinforcement Points**
   - At market creation
   - Before joining
   - Before placing bets
   - On confirmation screens

4. **Link to Full Guide**
   - Always accessible
   - Highlighted and obvious
   - Required reading checkbox

5. **Visual Hierarchy**
   - Use warning colors (yellow/red)
   - Large, bold text for critical warnings
   - Icons to draw attention
   - Clear separation between sections

## Testing Requirements

- [ ] Unit tests for warning modal component
- [ ] Integration tests for warning flow
- [ ] E2E tests ensuring warnings display correctly
- [ ] Accessibility testing (screen readers, keyboard navigation)
- [ ] Mobile responsiveness testing
- [ ] User testing to ensure warnings are understood
- [ ] A/B testing to optimize clarity
- [ ] Analytics to track user behavior after warnings

## Legal Considerations

- Consult legal counsel for final warning language
- Ensure compliance with local gambling/betting regulations
- Include proper disclaimers and liability limitations
- Consider terms of service updates
- Document that users have acknowledged warnings
- Keep audit trail of warning acknowledgments
