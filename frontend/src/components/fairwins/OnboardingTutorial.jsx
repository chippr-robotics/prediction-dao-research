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
    subtitle: 'Your gateway to prediction markets',
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
          FairWins lets you <strong>trade on the outcome of real-world events</strong> using
          prediction markets. Make predictions on sports, politics, crypto, and more.
        </p>
        <div className="tutorial-highlight-box">
          <span className="highlight-icon">💡</span>
          <span>Think an event will happen? Buy <strong>YES</strong>. Think it won't? Buy <strong>NO</strong>.</span>
        </div>
        <p className="tutorial-note">
          If you're right, your shares pay out $1 each. If you're wrong, they're worth $0.
        </p>
      </>
    )
  },
  {
    id: 'markets',
    title: 'How Prediction Markets Work',
    subtitle: 'Prices reflect probability',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3v18h18"/>
        <path d="M18 17V9"/>
        <path d="M13 17V5"/>
        <path d="M8 17v-3"/>
      </svg>
    ),
    content: (
      <>
        <p>
          Each market has a <strong>current price</strong> between $0.00 and $1.00 that reflects
          the crowd's estimated probability of an event occurring.
        </p>
        <div className="tutorial-example">
          <div className="example-market">
            <span className="example-title">"Will Team A win the championship?"</span>
            <div className="example-prices">
              <div className="price-item yes">
                <span className="price-label">YES</span>
                <span className="price-value">$0.65</span>
                <span className="price-meaning">65% likely</span>
              </div>
              <div className="price-item no">
                <span className="price-label">NO</span>
                <span className="price-value">$0.35</span>
                <span className="price-meaning">35% likely</span>
              </div>
            </div>
          </div>
        </div>
        <p className="tutorial-note">
          Prices update in real-time as traders buy and sell based on new information.
        </p>
      </>
    )
  },
  {
    id: 'cards',
    title: 'Reading Market Cards',
    subtitle: 'Understanding the interface',
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
              <span className="anatomy-category">🏀 Sports</span>
              <span className="anatomy-time">3d 12h</span>
            </div>
            <div className="anatomy-title">Will the Lakers win tonight?</div>
            <div className="anatomy-gauge">
              <div className="gauge-bar" style={{ width: '72%' }}></div>
              <span className="gauge-label">72%</span>
            </div>
            <div className="anatomy-stats">
              <span>Vol: 15.2K</span>
              <span>Traders: 234</span>
            </div>
          </div>
          <div className="anatomy-labels">
            <div className="anatomy-label" style={{ top: '5%' }}>
              <span className="label-line"></span>
              <span className="label-text">Category & time remaining</span>
            </div>
            <div className="anatomy-label" style={{ top: '30%' }}>
              <span className="label-line"></span>
              <span className="label-text">Market question</span>
            </div>
            <div className="anatomy-label" style={{ top: '55%' }}>
              <span className="label-line"></span>
              <span className="label-text">Current YES probability</span>
            </div>
            <div className="anatomy-label" style={{ top: '80%' }}>
              <span className="label-line"></span>
              <span className="label-text">Trading volume & activity</span>
            </div>
          </div>
        </div>
      </>
    )
  },
  {
    id: 'trading',
    title: 'Placing Your First Trade',
    subtitle: 'It only takes a few clicks',
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
              <strong>Click a market card</strong>
              <span>Opens the trading modal</span>
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>Choose YES or NO</strong>
              <span>Based on your prediction</span>
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>Enter your amount</strong>
              <span>Or use quick buttons (5, 25, 100, 500)</span>
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div className="step-content">
              <strong>Review & confirm</strong>
              <span>Check shares and potential payout</span>
            </div>
          </li>
        </ol>
        <div className="tutorial-tip">
          <span className="tip-icon">⚡</span>
          <span>Use <strong>Market Orders</strong> for instant execution, or <strong>Limit Orders</strong> to set your own price.</span>
        </div>
      </>
    )
  },
  {
    id: 'positions',
    title: 'Managing Your Positions',
    subtitle: 'Track and close your trades',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 12a9 9 0 1 1-9-9"/>
        <path d="M21 3v6h-6"/>
        <path d="M12 12l3-3"/>
      </svg>
    ),
    content: (
      <>
        <p>
          After trading, you can <strong>track your positions</strong> from the Dashboard.
          Watch your potential profit/loss update in real-time.
        </p>
        <div className="tutorial-positions-preview">
          <div className="position-row winning">
            <div className="position-market">Lakers win tonight</div>
            <div className="position-shares">50 YES @ $0.65</div>
            <div className="position-pnl positive">+$12.50</div>
          </div>
          <div className="position-row losing">
            <div className="position-market">BTC above $100k</div>
            <div className="position-shares">30 NO @ $0.40</div>
            <div className="position-pnl negative">-$3.20</div>
          </div>
        </div>
        <div className="tutorial-highlight-box">
          <span className="highlight-icon">📊</span>
          <span>You can <strong>sell anytime</strong> before the market settles to lock in profits or cut losses.</span>
        </div>
      </>
    )
  },
  {
    id: 'ready',
    title: "You're Ready!",
    subtitle: 'Start exploring prediction markets',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    content: (
      <>
        <p>
          You now know the basics of prediction markets. Here's what to explore next:
        </p>
        <div className="tutorial-next-steps">
          <div className="next-step-item">
            <span className="next-icon">📈</span>
            <div className="next-content">
              <strong>Trending Markets</strong>
              <span>See what's hot right now</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">👥</span>
            <div className="next-content">
              <strong>Friend Markets</strong>
              <span>Create private bets with friends</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">⚡</span>
            <div className="next-content">
              <strong>Perpetual Futures</strong>
              <span>Advanced leveraged trading</span>
            </div>
          </div>
          <div className="next-step-item">
            <span className="next-icon">🏛️</span>
            <div className="next-content">
              <strong>ClearPath DAO</strong>
              <span>Participate in governance</span>
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
  }, [isOpen, currentStep, isLastStep, isFirstStep])

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

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

  const handleSkip = () => {
    onDismiss?.(dontShowAgain)
  }

  const handleComplete = () => {
    onComplete?.(dontShowAgain)
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
