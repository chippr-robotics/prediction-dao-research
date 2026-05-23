import { useState, useCallback } from 'react'
import OnboardingTutorial from '../fairwins/OnboardingTutorial'

const DEV_WARNING_SEEN_KEY = 'dev_warning_modal_seen_v2'

function DevelopmentWarningModal() {
  const [isOpen, setIsOpen] = useState(
    () => !sessionStorage.getItem(DEV_WARNING_SEEN_KEY) && !localStorage.getItem(DEV_WARNING_SEEN_KEY)
  )

  const handleDismiss = useCallback((dontShowAgain) => {
    if (dontShowAgain) {
      localStorage.setItem(DEV_WARNING_SEEN_KEY, 'true')
    }
    sessionStorage.setItem(DEV_WARNING_SEEN_KEY, 'true')
    setIsOpen(false)
  }, [])

  return (
    <OnboardingTutorial
      isOpen={isOpen}
      onDismiss={handleDismiss}
      onComplete={handleDismiss}
    />
  )
}

export default DevelopmentWarningModal
