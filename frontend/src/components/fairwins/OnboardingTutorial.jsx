import { useState, useEffect, useRef, useCallback } from 'react'
import './OnboardingTutorial.css'

/**
 * OnboardingTutorial Component
 *
 * Interactive multi-step tutorial that guides new users through the FairWins platform.
 * Features a carousel-style interface with swipe/keyboard navigation.
 * Shows once per wallet address and can be permanently dismissed.
 */

const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to FairWins',
    subtitle: 'Private wagers between friends',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    content: (
      <>
        <p>
          FairWins lets you <strong>create private wagers with friends</strong> that automatically
          resolve using trusted oracles like Polymarket, Chainlink, and UMA.
        </p>
        <div className="tutorial-highlight-box">
          <span className="highlight-icon">💡</span>
          <span>Create a wager, share via <strong>QR code</strong>, and let the smart contract handle stakes and payouts.</span>
        </div>
        <p className="tutorial-note">
          All stakes are held in escrow until the outcome is determined. No trust required.
        </p>
      </>
    )
  },
  {
    id: 'create-wager',
    title: 'Creating a Wager',
    subtitle: 'Set the terms and stake',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v20"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    content: (
      <>
        <ol className="tutorial-steps-list">
          <li>
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>Pick your topic</strong>
              <span>Any event with a clear outcome</span>
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>Set the stake</strong>
              <span>Choose the token and amount to wager</span>
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>Choose an oracle</strong>
              <span>Polymarket, Chainlink, UMA, or manual resolution</span>
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div className="step-content">
              <strong>Share the invite</strong>
              <span>Send a QR code or link to your friend</span>
            </div>
          </li>
        </ol>
        <div className="tutorial-tip">
          <span className="tip-icon">&#9889;</span>
          <span>Both stakes are <strong>locked in escrow</strong> until the outcome is determined. No trust required.</span>
        </div>
      </>
    )
  },
  {
    id: 'wager-cards',
    title: 'Reading Wager Cards',
    subtitle: 'Understanding the dashboard',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/>
        <path d="M9 21V9"/>
      </svg>
    ),
    content: (
      <>
        <div className="tutorial-card-anatomy">
          <div className="anatomy-card">
            <div className="anatomy-header">
              <span className="anatomy-category">Active</span>
              <span className="anatomy-time">14d 6h</span>
            </div>
            <div className="anatomy-title">Will BTC hit $100k by March?</div>
            <div className="anatomy-stats">
              <span>50 USC</span>
              <span>1v1 &bull; Chainlink</span>
            </div>
          </div>
          <div className="anatomy-labels">
            <div className="anatomy-label" style={{ top: '5%' }}>
              <span className="label-line"></span>
              <span className="label-text">Status &amp; time remaining</span>
            </div>
            <div className="anatomy-label" style={{ top: '35%' }}>
              <span className="label-line"></span>
              <span className="label-text">Wager description</span>
            </div>
            <div className="anatomy-label" style={{ top: '70%' }}>
              <span className="label-line"></span>
              <span className="label-text">Stake amount, type &amp; oracle</span>
            </div>
          </div>
        </div>
      </>
    )
  },
  {
    id: 'oracles',
    title: 'Oracle Resolution',
    subtitle: 'How wagers get settled',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    content: (
      <>
        <p>
          Wagers resolve automatically using <strong>trusted oracle sources</strong>,
          so there's no arguing about results.
        </p>
        <div className="tutorial-next-steps">
          <div className="next-step-item">
            <span className="next-icon">&#127919;</span>
            <div className="next-content">
              <strong>Polymarket</strong>
              <span>Peg to real-world event outcomes</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">&#128279;</span>
            <div className="next-content">
              <strong>Chainlink</strong>
              <span>Price feeds for crypto wagers</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">&#9878;&#65039;</span>
            <div className="next-content">
              <strong>UMA</strong>
              <span>Custom truth assertions</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">&#9995;</span>
            <div className="next-content">
              <strong>Manual + Challenge</strong>
              <span>Creator resolves, 24h dispute window</span>
            </div>
          </div>
        </div>
      </>
    )
  },
  {
    id: 'tracking',
    title: 'Tracking Your Wagers',
    subtitle: 'Manage active and past bets',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    content: (
      <>
        <p>
          Your dashboard shows all wagers at a glance. Track status updates
          and claim winnings when wagers resolve.
        </p>
        <div className="tutorial-positions-preview">
          <div className="position-row winning">
            <div className="position-market">BTC above $100k</div>
            <div className="position-shares">50 USC staked</div>
            <div className="position-pnl positive">Won &mdash; Claim 100 USC</div>
          </div>
          <div className="position-row losing">
            <div className="position-market">Snow in Austin</div>
            <div className="position-shares">10 USC staked</div>
            <div className="position-pnl negative">Active &mdash; 12d left</div>
          </div>
        </div>
        <div className="tutorial-highlight-box">
          <span className="highlight-icon">&#128274;</span>
          <span>Stakes stay <strong>locked in escrow</strong> until resolution. Unclaimed winnings return after 90 days.</span>
        </div>
      </>
    )
  },
  {
    id: 'ready',
    title: "You're Ready!",
    subtitle: 'Start creating wagers with friends',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    content: (
      <>
        <p>
          You now know the basics. Here's what to explore next:
        </p>
        <div className="tutorial-next-steps">
          <div className="next-step-item">
            <span className="next-icon">&#128101;</span>
            <div className="next-content">
              <strong>Create a 1v1 Wager</strong>
              <span>Challenge a friend to a direct bet</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">&#128244;</span>
            <div className="next-content">
              <strong>Scan a QR Code</strong>
              <span>Accept a wager from a friend</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">&#127942;</span>
            <div className="next-content">
              <strong>Explore Oracle Sources</strong>
              <span>See how wagers get resolved</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">&#128200;</span>
            <div className="next-content">
              <strong>Browse Markets</strong>
              <span>Find events to wager on</span>
            </div>
          </div>
        </div>
      </>
    )
  }
]

function OnboardingTutorial({ isOpen, onDismiss, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const modalRef = useRef(null)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const totalSteps = TUTORIAL_STEPS.length
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === totalSteps - 1

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
      setDontShowAgain(false)
      setIsAnimating(false)
    }
  }, [isOpen])

  // Navigation callbacks - defined before useEffect that uses them
  const goToNext = useCallback(() => {
    if (isAnimating || isLastStep) return
    setIsAnimating(true)
    setCurrentStep(prev => prev + 1)
    setTimeout(() => setIsAnimating(false), 300)
  }, [isAnimating, isLastStep])

  const goToPrev = useCallback(() => {
    if (isAnimating || isFirstStep) return
    setIsAnimating(true)
    setCurrentStep(prev => prev - 1)
    setTimeout(() => setIsAnimating(false), 300)
  }, [isAnimating, isFirstStep])

  const goToStep = useCallback((stepIndex) => {
    if (isAnimating || stepIndex === currentStep) return
    setIsAnimating(true)
    setCurrentStep(stepIndex)
    setTimeout(() => setIsAnimating(false), 300)
  }, [isAnimating, currentStep])

  const handleSkip = useCallback(() => {
    onDismiss?.(dontShowAgain)
  }, [onDismiss, dontShowAgain])

  const handleComplete = useCallback(() => {
    onComplete?.(dontShowAgain)
  }, [onComplete, dontShowAgain])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleSkip()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (!isLastStep) goToNext()
        else handleComplete()
      } else if (e.key === 'ArrowLeft') {
        if (!isFirstStep) goToPrev()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLastStep, isFirstStep, goToNext, goToPrev, handleSkip, handleComplete])

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  // Touch handlers for swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    const swipeThreshold = 50
    const diff = touchStartX.current - touchEndX.current

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0 && !isLastStep) {
        goToNext()
      } else if (diff < 0 && !isFirstStep) {
        goToPrev()
      }
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleSkip()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="onboarding-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        className="onboarding-modal"
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress indicator */}
        <div className="onboarding-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
          <span className="progress-text">{currentStep + 1} of {totalSteps}</span>
        </div>

        {/* Skip button */}
        <button
          className="onboarding-skip"
          onClick={handleSkip}
          aria-label="Skip tutorial"
        >
          Skip
        </button>

        {/* Step content carousel */}
        <div className="onboarding-carousel">
          <div
            className="carousel-track"
            style={{ transform: `translateX(-${currentStep * 100}%)` }}
          >
            {TUTORIAL_STEPS.map((s, index) => (
              <div
                key={s.id}
                className={`carousel-slide ${index === currentStep ? 'active' : ''}`}
                aria-hidden={index !== currentStep}
              >
                <div className="step-icon">{s.icon}</div>
                <h2 id={index === currentStep ? 'onboarding-title' : undefined} className="step-title">{s.title}</h2>
                <p className="step-subtitle">{s.subtitle}</p>
                <div className="step-content">{s.content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Step dots */}
        <div className="onboarding-dots" aria-label="Tutorial steps">
          {TUTORIAL_STEPS.map((s, index) => (
            <button
              key={s.id}
              className={`dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => goToStep(index)}
              aria-label={`Go to step ${index + 1}: ${s.title}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="onboarding-footer">
          <label className="onboarding-checkbox">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>Don't show this again</span>
          </label>

          <div className="onboarding-nav">
            {!isFirstStep && (
              <button
                className="nav-btn secondary"
                onClick={goToPrev}
                disabled={isAnimating}
              >
                Back
              </button>
            )}
            <button
              className="nav-btn primary"
              onClick={isLastStep ? handleComplete : goToNext}
              disabled={isAnimating}
            >
              {isLastStep ? "Let's Go!" : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnboardingTutorial
