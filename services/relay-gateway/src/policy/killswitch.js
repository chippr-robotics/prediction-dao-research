/**
 * Global kill switch (FR-015): when active, POST /v1/intents returns 503 killswitch_active and
 * all flows continue via self-submit (SC-004). Status polling and /healthz stay up so clients
 * and operators can still observe state.
 *
 * Sources:
 *  - boot: env KILL_SWITCH=true
 *  - runtime: SIGUSR2 toggles it (wired in server.js bootstrap; `kill -USR2 <pid>`)
 *  - tests/admin tooling: the returned setter
 */
export function createKillSwitch(initial = false) {
  let active = Boolean(initial)
  return {
    isActive: () => active,
    set(value) {
      active = Boolean(value)
    },
    toggle() {
      active = !active
      return active
    },
  }
}
