import { useState } from 'react'
import { SUPPORTED_BIP39_LANGS } from '../../lib/pools/bip39Lists'
import { WORDLIST_LANGUAGE_LABELS, getWordListLang, setWordListLang } from '../../utils/wordListLanguage'

/**
 * WordListLanguageSelector (spec 034, US2) — pick the BIP-39 language used to render and read the
 * four-word group-pool phrases. The choice only changes how the language-independent index tuple is
 * displayed/typed; the same pool resolves regardless of language (SC-008). Per-device preference.
 */
export default function WordListLanguageSelector({ onChange }) {
  const [lang, setLang] = useState(() => getWordListLang())

  const handleChange = (e) => {
    const next = e.target.value
    setLang(next)
    setWordListLang(next)
    onChange?.(next)
  }

  return (
    <div className="wordlist-lang-selector account-utilities-row">
      <label className="account-utilities-label" htmlFor="wordlist-language">
        Pool phrase language
      </label>
      <select id="wordlist-language" value={lang} onChange={handleChange}>
        {SUPPORTED_BIP39_LANGS.map((code) => (
          <option key={code} value={code}>
            {WORDLIST_LANGUAGE_LABELS[code] || code}
          </option>
        ))}
      </select>
    </div>
  )
}
