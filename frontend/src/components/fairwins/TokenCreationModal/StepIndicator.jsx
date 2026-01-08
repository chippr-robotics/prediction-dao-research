/**
 * StepIndicator Component
 *
 * Visual step progress indicator for the token creation wizard.
 * Shows completed, active, and pending steps.
 */
function StepIndicator({ steps, currentStep, onStepClick }) {
  return (
    <nav className="tcm-steps" aria-label="Creation steps">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isActive = index === currentStep
        const isClickable = index <= currentStep

        return (
          <button
            key={step.id}
            className={`tcm-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            onClick={() => isClickable && onStepClick?.(index)}
            disabled={!isClickable}
            aria-current={isActive ? 'step' : undefined}
            type="button"
          >
            <span className="tcm-step-number">
              {isCompleted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className="tcm-step-label">{step.label}</span>
            {index < steps.length - 1 && <span className="tcm-step-connector" aria-hidden="true" />}
          </button>
        )
      })}
    </nav>
  )
}

export default StepIndicator
