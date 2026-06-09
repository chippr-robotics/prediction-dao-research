import { useEffect, useMemo } from 'react'
import { getCurrentDocument } from '../../utils/legalDocs'
import './LegalDocPage.css'

/**
 * Versioned legal-document pages (Spec 007 — FR-017/FR-024, SC-010/SC-015).
 * Renders a document's current version + its SHA-256 version identifier. Public routes
 * (/terms, /risk, /privacy) so the docs are readable before the entry gate. WCAG 2.1 AA:
 * semantic headings/lists, keyboard-accessible links, a labelled version region.
 *
 * Dependency-free markdown rendering (no new bundle dep) covering the subset the drafts use:
 * headings, lists, blockquotes, horizontal rules, paragraphs, and inline bold/code/links.
 */

function renderInline(text, keyPrefix) {
  const nodes = []
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/
  let rest = text
  let i = 0
  let m
  while ((m = re.exec(rest)) !== null) {
    if (m.index > 0) nodes.push(rest.slice(0, m.index))
    if (m[1]) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[2]}</strong>)
    } else if (m[3]) {
      nodes.push(<code key={`${keyPrefix}-c${i}`}>{m[4]}</code>)
    } else if (m[5]) {
      const href = m[7]
      const internal = href.startsWith('/') || href.startsWith('#')
      nodes.push(
        <a key={`${keyPrefix}-a${i}`} href={href} {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
          {m[6]}
        </a>,
      )
    }
    rest = rest.slice(m.index + m[0].length)
    i++
  }
  if (rest) nodes.push(rest)
  return nodes
}

/** Slugify heading text into a URL-fragment-safe id (e.g. "Account Moderation" → "account-moderation"). */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function renderMarkdown(md) {
  const lines = md.split('\n')
  const blocks = []
  let list = null
  let para = []
  // Heading ids must be unique within the document (duplicate ids are an a11y violation).
  const seenIds = new Set()
  const uniqueId = (base) => {
    let id = base || 'section'
    let n = 2
    while (seenIds.has(id)) id = `${base}-${n++}`
    seenIds.add(id)
    return id
  }

  const flushPara = () => {
    if (para.length) {
      const text = para.join(' ')
      blocks.push(<p key={`p${blocks.length}`}>{renderInline(text, `p${blocks.length}`)}</p>)
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push(<ul key={`ul${blocks.length}`}>{list}</ul>)
      list = null
    }
  }

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '')
    if (line.trim() === '') { flushPara(); flushList(); return }
    if (/^---+$/.test(line.trim())) { flushPara(); flushList(); blocks.push(<hr key={`hr${idx}`} />); return }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara(); flushList()
      const level = Math.min(h[1].length + 1, 6) // shift down one (page owns the h1)
      const Tag = `h${level}`
      blocks.push(<Tag key={`h${idx}`} id={uniqueId(slugify(h[2]))}>{renderInline(h[2], `h${idx}`)}</Tag>)
      return
    }
    const li = line.match(/^[-*]\s+(.*)$/)
    if (li) {
      flushPara()
      if (!list) list = []
      list.push(<li key={`li${idx}`}>{renderInline(li[1], `li${idx}`)}</li>)
      return
    }
    const bq = line.match(/^>\s?(.*)$/)
    if (bq) {
      flushPara(); flushList()
      blocks.push(<blockquote key={`bq${idx}`}>{renderInline(bq[1], `bq${idx}`)}</blockquote>)
      return
    }
    para.push(line.trim())
  })
  flushPara(); flushList()
  return blocks
}

export function LegalDocPage({ docType }) {
  const doc = useMemo(() => getCurrentDocument(docType), [docType])

  // Deep-link support: scroll to the #fragment section once the doc has rendered
  // (SPA navigation paints the content client-side, so the browser's native
  // fragment scroll can fire before the target exists). FR-002 / SC-003.
  useEffect(() => {
    if (!doc || typeof window === 'undefined' || !window.location.hash) return
    const id = decodeURIComponent(window.location.hash.slice(1))
    const el = id && document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    try {
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    } catch { /* jsdom: scrollIntoView not implemented */ }
  }, [doc])

  if (!doc) {
    return (
      <main className="legal-doc-page">
        <h1>Document not found</h1>
        <p role="status">No such legal document.</p>
      </main>
    )
  }

  return (
    <main className="legal-doc-page" aria-labelledby="legal-doc-title">
      <h1 id="legal-doc-title">{doc.label}</h1>
      <p className="legal-doc-version" aria-label="Document version">
        Version (SHA-256): <code>{doc.hash}</code>
      </p>
      <nav aria-label="Legal documents" className="legal-doc-nav">
        <a href="/terms">Terms &amp; Conditions</a> · <a href="/risk">Risk Disclosure</a> ·{' '}
        <a href="/privacy">Privacy Policy</a>
      </nav>
      <article className="legal-doc-body">{renderMarkdown(doc.content)}</article>
    </main>
  )
}

export function TermsPage() { return <LegalDocPage docType="terms" /> }
export function RiskPage() { return <LegalDocPage docType="risk" /> }
export function PrivacyPage() { return <LegalDocPage docType="privacy" /> }

export default LegalDocPage
