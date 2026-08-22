/* Written by scripts/ui/capture-agentic-access.mjs; deleted when it exits.

   Two scaffolds, both deliberately thin:
     /settings  reproduces the Settings tab's real container chain (.wallet-page > .tab-content >
                .settings-section > AccordionGroup) so the two cards are photographed inside the
                spacing they actually ship in.
     /home      a screen that HAS a bottom nav — the real SectionIconNav, because the launcher
                MEASURES that element. The content behind it is scaffolding and is labelled as such
                in the screenshots README.
   The launcher is mounted on both, exactly as App.jsx mounts it once for every in-app route. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext.jsx'
import AccordionGroup from '../components/account/AccordionGroup'
import ApiAccessPanel from '../components/account/ApiAccessPanel'
import AssistantPreferencesPanel from '../components/account/AssistantPreferencesPanel'
import AssistantLauncher from '../components/assistant/AssistantLauncher'
import SectionIconNav from '../components/nav/SectionIconNav'
import '../theme.css'
import '../index.css'
import '../App.css'
import '../pages/WalletPage.css'

const q = new URLSearchParams(window.location.search)
const entry = q.get('entry') || '/settings'

function SettingsScaffold() {
  return (
    <div className="wallet-page-wrapper">
      <div className="wallet-page">
        <div className="wallet-portal wallet-portal--flat">
          <div className="wallet-portal-main">
            <div className="tab-content">
              <div className="settings-section" role="tabpanel">
                <p className="settings-section__intro">
                  How this app looks and behaves. Open a card to change it.
                </p>
                <AccordionGroup>
                  <AssistantPreferencesPanel />
                  <ApiAccessPanel />
                </AccordionGroup>
              </div>
            </div>
          </div>
        </div>
      </div>
      <AssistantLauncher />
    </div>
  )
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'transfer', label: 'Transfer', icon: 'transfer' },
  { id: 'earn', label: 'Earn', icon: 'sprout' },
  { id: 'trade', label: 'Trade', icon: 'trade' },
  { id: 'predict', label: 'Predict', icon: 'predict' },
]

function HomeScaffold() {
  return (
    <div className="wallet-page-wrapper">
      <div className="wallet-page">
        <div className="wallet-portal wallet-portal--flat">
          <div className="wallet-portal-main">
            <div className="tab-content">
              <div className="settings-section" role="tabpanel">
                <p className="settings-section__intro">
                  Harness scaffolding — a screen that has a bottom nav, so the launcher can be
                  photographed tethered to the real one.
                </p>
                {['Open wagers', 'Your pools', 'Recent activity'].map((title) => (
                  <section key={title} className="acc" data-open="false">
                    <h3 className="acc__heading">
                      <button type="button" className="acc__trigger">
                        <span className="acc__text">
                          <span className="acc__title">{title}</span>
                          <span className="acc__summary">Scaffolding row</span>
                        </span>
                      </button>
                    </h3>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <SectionIconNav items={NAV_ITEMS} activeId="home" onSelect={() => {}} />
      <AssistantLauncher />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/settings" element={<SettingsScaffold />} />
          <Route path="/home" element={<HomeScaffold />} />
          <Route path="*" element={<SettingsScaffold />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>,
)
