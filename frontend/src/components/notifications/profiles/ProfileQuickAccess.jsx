import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationProfiles } from '../../../hooks/useNotificationProfiles'
import { getNextScheduleEnd, oneHourFrom } from '../../../lib/notifications/notificationProfiles'
import { formatTime, profileStatusText } from './statusText'
import './ProfileQuickAccess.css'

/**
 * ProfileQuickAccess — the Signal-style quick sheet for notification profiles
 * (spec 059 US3), pinned at the top of the ActivityFeed panel (FairWins'
 * chat-list analog). Shows the active/first profile at a glance; expanding it
 * reveals every profile with manual on/off durations (on, "For 1 hour",
 * "Until <schedule end>"), plus "New profile" and "View settings" links into
 * the Preferences tab.
 *
 * @param {{ onClose: () => void }} props onClose closes the parent feed panel
 *   before navigating away.
 */
function ProfileQuickAccess({ onClose }) {
  const navigate = useNavigate()
  const { profiles, activeStatus, enableProfile, disableActiveProfile } = useNotificationProfiles()
  const [expanded, setExpanded] = useState(false)

  const go = (hash) => {
    onClose()
    navigate(`/wallet?tab=preferences${hash}`)
  }

  const headline = activeStatus.profile || profiles[0] || null

  if (!headline) {
    return (
      <div className="profile-qa">
        <button type="button" className="profile-qa-new" onClick={() => go('#notification-profiles-new')}>
          <span className="profile-qa-new-plus" aria-hidden="true">+</span> New notification profile
        </button>
      </div>
    )
  }

  return (
    <div className="profile-qa">
      <div className="profile-qa-headline">
        <span className="profile-qa-emoji" aria-hidden="true">{headline.emoji || '🔔'}</span>
        <div className="profile-qa-headline-text">
          <span className="profile-qa-name">{headline.name}</span>
          <span className="profile-qa-status">{profileStatusText(headline, activeStatus)}</span>
        </div>
        <button
          type="button"
          className="profile-qa-expand"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide notification profiles' : 'Show notification profiles'}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className="profile-qa-body">
          <ul className="profile-qa-list">
            {profiles.map((profile) => {
              const isActive = activeStatus.profile?.id === profile.id
              const scheduleEnd = getNextScheduleEnd(profile)
              return (
                <li key={profile.id} className="profile-qa-row">
                  <span className="profile-qa-row-name">
                    <span aria-hidden="true">{profile.emoji || '🔔'}</span> {profile.name}
                  </span>
                  <div className="profile-qa-row-actions" role="group" aria-label={`Turn ${profile.name} on or off`}>
                    {isActive ? (
                      <button type="button" className="profile-qa-action" onClick={() => disableActiveProfile()}>
                        Turn off
                      </button>
                    ) : (
                      <>
                        <button type="button" className="profile-qa-action" onClick={() => enableProfile(profile.id)}>
                          On
                        </button>
                        <button
                          type="button"
                          className="profile-qa-action"
                          onClick={() => enableProfile(profile.id, { until: oneHourFrom() })}
                        >
                          For 1 hour
                        </button>
                        {scheduleEnd != null && (
                          <button
                            type="button"
                            className="profile-qa-action"
                            onClick={() => enableProfile(profile.id, { until: scheduleEnd })}
                          >
                            Until {formatTime(scheduleEnd)}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="profile-qa-footer">
            <button type="button" className="profile-qa-link" onClick={() => go('#notification-profiles-new')}>
              New profile
            </button>
            <button type="button" className="profile-qa-link" onClick={() => go('#notification-profiles')}>
              View settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfileQuickAccess
