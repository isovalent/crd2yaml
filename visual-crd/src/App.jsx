import React, { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { Card, CardContent } from './components/ui/card.jsx'
import { Button } from './components/ui/button.jsx'
import { Input as UIInput } from './components/ui/input.jsx'

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsText(file)
  })
}

const scaleSvg = (svgText, scale) => {
  try {
    if (!svgText) return svgText
    if (scale <= 0) scale = 1
    let out = svgText
    // Prefer viewBox to compute dimensions
    const vb = out.match(/viewBox="(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/)
    let baseW = 800, baseH = 600
    if (vb) {
      baseW = parseFloat(vb[3])
      baseH = parseFloat(vb[4])
    } else {
      const wM = out.match(/width="(\d+(?:\.\d+)?)/)
      const hM = out.match(/height="(\d+(?:\.\d+)?)/)
      if (wM && hM) {
        baseW = parseFloat(wM[1])
        baseH = parseFloat(hM[1])
      }
    }
    const w = Math.max(1, Math.round(baseW * scale))
    const h = Math.max(1, Math.round(baseH * scale))
    // Update only the root <svg> tag's width/height to avoid altering child shapes
    out = out.replace(/<svg\b([^>]*)>/, (m, attrs) => {
      let a = attrs.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')
      if (!/xmlns=/.test(a)) a += ' xmlns="http://www.w3.org/2000/svg"'
      if (!/xmlns:xlink=/.test(a)) a += ' xmlns:xlink="http://www.w3.org/1999/xlink"'
      return `<svg${a} width="${w}" height="${h}">`
    })
    return out
  } catch {
    return svgText
  }
}

const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const downloadSvg = (filename, svgText) => {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function extractSchema(doc) {
  // Accept a full CRD or a plain schema. Try common CRD shapes.
  const v = doc?.spec?.versions?.find?.(x => x?.schema?.openAPIV3Schema) || doc?.spec?.validation
  const openapi = v?.schema?.openAPIV3Schema || v?.openAPIV3Schema || doc?.openAPIV3Schema || doc
  return openapi || {}
}

function toDefaultFromSchema(schema, onlyRequired = false, isRequired = true) {
  if (!schema) return undefined
  if (onlyRequired && !isRequired && !(schema.type === 'object' || schema.properties)) return undefined
  if (schema.default !== undefined) return schema.default
  if (schema.type === 'object' || schema.properties) {
    const o = {}
    const req = new Set(schema.required || [])
    for (const [k, v] of Object.entries(schema.properties || {})) {
      if (!onlyRequired || req.has(k) || (onlyRequired && req.size === 0)) {
        const d = toDefaultFromSchema(v, onlyRequired, true)
        if (d !== undefined) o[k] = d
      }
    }
    return o
  }
  if (schema.type === 'array' || schema.items) return onlyRequired && !isRequired ? undefined : []
  if (schema.type === 'string') return onlyRequired && !isRequired ? undefined : ''
  if (schema.type === 'number' || schema.type === 'integer') return onlyRequired && !isRequired ? undefined : 0
  if (schema.type === 'boolean') return onlyRequired && !isRequired ? undefined : false
  return undefined
}

const isNonEmpty = (v) => {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

function Field({ schema, path, value, onChange, required, showOptional }) {
  const t = schema?.type || (schema.properties ? 'object' : schema.items ? 'array' : 'string')
  const title = schema?.title || path[path.length - 1]
  const desc = schema?.description
  const hasVal = isNonEmpty(value)
  if (!required && t !== 'object' && !hasVal && !showOptional) return null

  if (t === 'object') {
    const props = schema.properties || {}
    const req = new Set(schema.required || [])
    const isFreeForm = Object.keys(props).length === 0
    if (isFreeForm) {
      const objVal = (value && typeof value === 'object') ? value : {}
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
          <div>
            <div className="text-sm font-semibold text-slate-700">{title}</div>
            {desc && <div className="text-xs text-slate-500">{desc}</div>}
          </div>
          <textarea
            className="w-full border border-slate-300 bg-slate-100 rounded p-2 font-mono text-sm min-h-32 focus:outline-none focus:ring-2 focus:ring-slate-300"
            value={JSON.stringify(objVal, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value || '{}')
                onChange(parsed)
              } catch {
                // keep typing even if invalid JSON
              }
            }}
          />
          <div className="text-xs text-slate-500">Free-form object</div>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          {desc && <div className="text-xs text-slate-500">{desc}</div>}
        </div>
        {(showOptional ? Object.entries(props) : (req.size > 0 ? Object.entries(props).filter(([k]) => req.has(k)) : Object.entries(props))).map(([k, s]) => {
          const childRequired = showOptional ? req.has(k) : (req.size > 0 ? req.has(k) : true)
          return (
            <Field key={k}
              schema={s}
              path={[...path, k]}
              value={value?.[k]}
              onChange={(v) => onChange({ ...(value || {}), [k]: v })}
              required={childRequired}
              showOptional={showOptional}
            />
          )
        })}
      </div>
    )
  }

  if (t === 'array') {
    if (!required && !hasVal && !showOptional) return null
    const items = Array.isArray(value) ? value : []
    const freeFormItems = !schema.items
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          {desc && <div className="text-xs text-slate-500">{desc}</div>}
        </div>
        {!freeFormItems && items.map((it, i) => (
          <div key={i} className="flex gap-2 items-start">
            <Field schema={schema.items} path={[...path, i]} value={it}
              onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} showOptional={showOptional} />
            <button className="px-2 py-1 text-sm border rounded hover:bg-gray-50" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        {freeFormItems ? (
          <textarea
            className="w-full border border-slate-300 bg-slate-100 rounded p-2 font-mono text-sm min-h-32 focus:outline-none focus:ring-2 focus:ring-slate-300"
            value={JSON.stringify(items, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value || '[]')
                onChange(Array.isArray(parsed) ? parsed : [])
              } catch {}
            }}
          />
        ) : (
          <button className="px-2 py-1 text-sm border rounded hover:bg-gray-50" onClick={() => onChange([...(items || []), toDefaultFromSchema(schema.items, true, true)])}>+ Add</button>
        )}
      </div>
    )
  }

  if (t === 'boolean') {
    if (!required && !hasVal && !showOptional) return null
    return (
      <div className="grid gap-1">
        <label className="text-sm font-medium text-slate-600 inline-flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {title} {required && <span className="text-red-500">*</span>}
        </label>
        {desc && <div className="text-xs text-slate-500">{desc}</div>}
      </div>
    )
  }

  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium text-slate-600">{title} {required && <span className="text-red-500">*</span>}</label>
      <UIInput className="border-slate-300 bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-400" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={schema?.example ?? ''} />
      {desc && <div className="text-xs text-slate-500">{desc}</div>}
    </div>
  )
}

export default function App() {
  const [schema, setSchema] = useState(null)
  const [form, setForm] = useState({})
  const [yamlOut, setYamlOut] = useState('')
  const [header, setHeader] = useState({ apiVersion: '', kind: '', metadata: { name: '' } })
  const [hasSpecInSchema, setHasSpecInSchema] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [showOptional, setShowOptional] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [showDefaultsInYaml, setShowDefaultsInYaml] = useState(false)
  const [mermaidText, setMermaidText] = useState('')
  const [mermaidHtml, setMermaidHtml] = useState('')
  const [showMermaidSource, setShowMermaidSource] = useState(false)
  const [mermaidScale, setMermaidScale] = useState(1.0)
  const baseMermaidScale = 3.0 // Make 1x behave like previous 3x
  const valuesInputRef = React.useRef(null)
  const crdInputRef = React.useRef(null)
  // Examples pane state (GitHub-only)
  const [ghToken, setGhToken] = useState('')
  const [extraKeyword, setExtraKeyword] = useState('')
  const [examples, setExamples] = useState([])
  const [examplesLoading, setExamplesLoading] = useState(false)
  const [examplesError, setExamplesError] = useState('')
  const [selectedExample, setSelectedExample] = useState(null)
  // CRD search state (GitHub only)
  const [crdResults, setCrdResults] = useState([])
  const [crdResultsLoading, setCrdResultsLoading] = useState(false)
  const [crdResultsError, setCrdResultsError] = useState('')
  const [selectedCrd, setSelectedCrd] = useState(null)
  const [crdSearchCache, setCrdSearchCache] = useState({ key: '', items: [], shown: 0 })

  // Remember GitHub token client-side (localStorage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('visual-crd:gh_token')
      if (saved) setGhToken(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      if (ghToken && ghToken.trim()) localStorage.setItem('visual-crd:gh_token', ghToken.trim())
      else localStorage.removeItem('visual-crd:gh_token')
    } catch {}
  }, [ghToken])

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) { setErrorMsg('No file selected.'); return }
    const text = await readFileAsText(file)

    // Heuristic: users sometimes paste `kubectl describe crd ...` output which is not YAML.
    if (/^Name:\s+/m.test(text) && !/^apiVersion:\s+/m.test(text)) {
      setErrorMsg('The file looks like "kubectl describe" output. Use: kubectl get <crd-name> -o yaml and upload that YAML.')
      return
    }

    let docs = []
    // Try JSON first
    try {
      const asJson = JSON.parse(text)
      docs = Array.isArray(asJson) ? asJson : [asJson]
    } catch {
      // Try YAML (supports multi-doc)
      try {
        docs = yaml.loadAll(text).filter(Boolean)
      } catch {
        setErrorMsg('Could not parse file as YAML or JSON. If you used kubectl describe, use: kubectl get <crd-name> -o yaml')
        return
      }
    }

    // If multiple docs, pick the CRD or the one with openAPIV3Schema
    const pick = docs.find(d => d?.kind === 'CustomResourceDefinition')
      || docs.find(d => d?.spec?.versions?.some?.(v => v?.schema?.openAPIV3Schema))
      || docs[0]

    const openapi = extractSchema(pick)
    if (!openapi || Object.keys(openapi).length === 0) {
      setErrorMsg('Could not locate openAPIV3Schema in the uploaded file (CRD).')
      return
    }
    // Populate header from CRD definition (group/version/kind)
    try {
      const group = pick?.spec?.group || ''
      const version = (pick?.spec?.versions?.[0]?.name) || pick?.spec?.version || ''
      const kind = pick?.spec?.names?.kind || ''
      const apiVersion = group && version ? `${group}/${version}` : (version || '')
      setHeader((prev) => ({
        apiVersion: apiVersion || prev.apiVersion,
        kind: kind || prev.kind,
        metadata: prev.metadata || { name: '' },
      }))
    } catch {}
    const hasSpec = Boolean(openapi?.properties?.spec)
    setHasSpecInSchema(hasSpec)
    setSchema(openapi)
    const rootSchema = hasSpec ? openapi.properties.spec : openapi
    const defaults = toDefaultFromSchema(rootSchema, !showOptional, true) || {}
    setForm(defaults)
    setHeader({ apiVersion: pick?.spec?.group ? `${pick.spec.group}/${pick?.spec?.versions?.[0]?.name || ''}` : (pick?.apiVersion || ''), kind: pick?.spec?.names?.kind || pick?.kind || '', metadata: { name: '' } })
    // New CRD uploaded: reset configured paths
    configuredPathsRef.current = new Set()
    e.target.value = ''
    setErrorMsg('')
  }

  const clearAll = () => {
    try {
      setSchema(null)
      setHasSpecInSchema(false)
      setForm({})
      setHeader({ apiVersion: '', kind: '', metadata: { name: '' } })
      configuredPathsRef.current = new Set()
      setExamples([])
      setExamplesError('')
      setExamplesLoading(false)
      setSelectedExample(null)
      setCrdResults([])
      setCrdResultsError('')
      setCrdResultsLoading(false)
      setSelectedCrd(null)
      setYamlOut('')
      setMermaidText('')
      setMermaidHtml('')
      setErrorMsg('')
    } catch {}
  }

  const parseAny = (text) => {
    // Try JSON, then YAML (multi-doc)
    try {
      const asJson = JSON.parse(text)
      return Array.isArray(asJson) ? asJson : [asJson]
    } catch {}
    const docs = yaml.loadAll(text).filter(Boolean)
    return docs
  }

  const deepMerge = (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) return b
    if (a && typeof a === 'object' && b && typeof b === 'object') {
      const out = { ...a }
      for (const k of Object.keys(b)) out[k] = deepMerge(a?.[k], b[k])
      return out
    }
    return b === undefined ? a : b
  }

  const deepEqual = (a, b) => {
    if (a === b) return true
    if (typeof a !== typeof b) return false
    if (a && b && typeof a === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
        return true
      }
      const ak = Object.keys(a || {}).sort()
      const bk = Object.keys(b || {}).sort()
      if (ak.length !== bk.length) return false
      for (let i = 0; i < ak.length; i++) if (ak[i] !== bk[i]) return false
      for (const k of ak) if (!deepEqual(a[k], b[k])) return false
      return true
    }
    return false
  }

  const configuredPathsRef = React.useRef(new Set())
  const pathKey = (pathArr) => pathArr.join('.')
  const collectPaths = (obj, base = []) => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
      const p = [...base, k]
      configuredPathsRef.current.add(pathKey(p))
      if (v && typeof v === 'object') collectPaths(v, p)
    }
  }

  const isEmptyContainer = (v) => (Array.isArray(v) ? v.length === 0 : (v && typeof v === 'object') ? Object.keys(v).length === 0 : false)

  // Remove fields that are not required and equal to their default values,
  // except when the field path was explicitly configured (uploaded/loaded).
  const pruneDefaults = (value, schema, path = []) => {
    if (!schema) return value
    if (value === undefined) return value
    if (schema.type === 'object' || schema.properties) {
      const props = schema.properties || {}
      const req = new Set(schema.required || [])
      const out = {}
      for (const [k, v] of Object.entries(value || {})) {
        const ps = props[k] || {}
        const defVal = ps && ps.default !== undefined ? ps.default : toDefaultFromSchema(ps, false, true)
        const isConfigured = configuredPathsRef.current.has(pathKey([...path, k]))
        // If the raw value equals the default, skip entirely
        if (!req.has(k) && !isConfigured && defVal !== undefined && deepEqual(v, defVal)) {
          continue
        }
        const pruned = pruneDefaults(v, ps, [...path, k])
        // If after pruning it becomes empty, and it's not required or configured, drop it
        if (!req.has(k) && !isConfigured && (ps.type === 'object' || ps.properties || ps.items) && isEmptyContainer(pruned)) {
          continue
        }
        out[k] = pruned
      }
      return out
    }
    if ((schema.type === 'array' || schema.items) && Array.isArray(value)) {
      // Prune elements recursively (do not drop entire array here; caller decides for the parent key)
      const itemSchema = schema.items || {}
      return value.map((el, idx) => pruneDefaults(el, itemSchema, [...path, String(idx)]))
    }
    return value
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // Fetch example YAML text for a result
  const fetchExampleContent = async (ex) => {
    if (ex?.html_url && /https:\/\/github\.com\/.+\/blob\/.+\.(ya?ml|json)$/i.test(ex.html_url)) {
      const raw = ex.html_url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
      try {
        const r = await fetch(raw)
        if (r.ok) return await r.text()
      } catch {}
    }
    if (ex?.repo && ex?.path) {
      const url = `https://api.github.com/repos/${ex.repo}/contents/${encodeURIComponent(ex.path)}`
      try {
        const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json', ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}) } })
        if (r.ok) {
          const data = await r.json()
          if (data?.content && data?.encoding === 'base64') {
            try { return atob(data.content.replace(/\n/g, '')) } catch {}
          }
        }
      } catch {}
    }
    if (ex?.html_url) {
      try {
        const r = await fetch(ex.html_url)
        if (r.ok) return await r.text()
      } catch {}
    }
    return ''
  }

  const loadExample = async (index) => {
    try {
      const ex = examples[index]
      if (!ex) return
      const text = await fetchExampleContent(ex)
      if (!text) { setExamplesError('Failed to fetch example content.'); return }
      const docs = parseAny(text)
      if (!docs.length) { setExamplesError('Example content could not be parsed as YAML/JSON.'); return }
      const d = docs[0]
      const hasSchema = Boolean(schema)
      const raw = d?.spec ?? d
      setForm((prev) => {
        if (!hasSchema) return raw || {}
        if (hasSpecInSchema) return deepMerge(prev || {}, raw || {})
        return deepMerge(prev || {}, raw || {})
      })
      // Record configured paths from loaded example
      try { collectPaths(raw || {}, []) } catch {}
      setHeader((prev) => ({
        apiVersion: d?.apiVersion ?? prev.apiVersion,
        kind: d?.kind ?? prev.kind,
        metadata: d?.metadata ?? prev.metadata,
      }))
      setExamplesError('')
    } catch (e) {
      setExamplesError(String(e.message || e))
    }
  }

  // Search CRDs on GitHub without relying on 'kind' content.
  // Heuristics: filename and path patterns common for CRDs, plus any user-provided qualifiers (e.g., repo:owner/name, org:foo, path:bar).
  const searchCrdsGithub = async () => {
    setCrdResultsError('')
    setCrdResultsLoading(true)
    try {
      const headers = { 'Accept': 'application/vnd.github+json', ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}) }
      const kw = (extraKeyword || '').trim()
      const normalizeQualifiers = (s) => (s || '')
        .replace(/\b(repo|org|user|path)\s*:\s*/gi, '$1:')
        .replace(/\s+/g, ' ')
        .trim()
      const qualifiers = normalizeQualifiers(kw) // allow passing repo:, org:, path:, etc.
      const noQualifiers = qualifiers.length === 0
      const startedAt = Date.now()
      const budgetMs = noQualifiers ? 8000 : 15000

      const fetchWithTimeout = async (url, opts = {}, ms = 6000) => {
        const ctl = new AbortController()
        const id = setTimeout(() => ctl.abort(), ms)
        try { return await fetch(url, { ...opts, signal: ctl.signal }) } finally { clearTimeout(id) }
      }

      // If same query as before and we have cached items, show next 25 and prepend them to the top
      if (crdSearchCache.key === qualifiers && crdSearchCache.items?.length) {
        const prevShown = crdSearchCache.shown || 0
        const nextShown = Math.min(crdSearchCache.items.length, prevShown + 25)
        const nextChunk = crdSearchCache.items.slice(prevShown, nextShown)
        setCrdResults((prev) => [...nextChunk, ...(prev || [])])
        setCrdSearchCache({ key: qualifiers, items: crdSearchCache.items, shown: nextShown })
        setCrdResultsLoading(false)
        return
      }
      // New query: reset results while searching
      setCrdResults([])

      // Start with: customresourcedefinition + extension filters, plus qualifiers (as requested)
      // Then fall back to broader filename/path heuristics.
      const primary = [
        `customresourcedefinition extension:yaml ${qualifiers}`.trim(),
        `customresourcedefinition extension:yml ${qualifiers}`.trim(),
      ]
      const fallbacks = [
        'extension:yaml filename:customresourcedefinition',
        'extension:yml filename:customresourcedefinition',
        'extension:yaml path:crds',
        'extension:yml path:crds',
        'extension:yaml filename:*crd*',
        'extension:yml filename:*crd*',
        'extension:yaml path:install/kubernetes/**/crds',
        'extension:yml path:install/kubernetes/**/crds',
        // Specific well-known paths that show up in popular projects
        'extension:yaml path:install/kubernetes/cilium/crds',
        'extension:yml path:install/kubernetes/cilium/crds',
      ].map((p) => `${p} ${qualifiers}`.trim())

      // If no qualifiers, keep the query set small to avoid long searches
      const queries = noQualifiers ? primary : [...primary, ...fallbacks]
      const seen = new Map()
      const maxCandidates = 50

      for (const q0 of queries) {
        if (Date.now() - startedAt > budgetMs) break
        const q = encodeURIComponent(q0)
        const url = `https://api.github.com/search/code?q=${q}&per_page=${noQualifiers ? 20 : 50}`
        const r = await fetchWithTimeout(url, { headers }, 5000)
        if (!r.ok) {
          // Skip invalid query errors (e.g., 422 for bad wildcard combos) and continue others
          continue
        }
        const data = await r.json()
        for (const it of (data.items || [])) {
          const key = it?.html_url || `${it?.repository?.full_name}/${it?.path}`
          if (key && !seen.has(key)) {
            seen.set(key, {
              repo: it?.repository?.full_name || '',
              path: it?.path || '',
              html_url: it?.html_url || '',
            })
          }
          if (seen.size >= maxCandidates) break
        }
        if (seen.size >= maxCandidates) break
      }

      // If nothing found and user provided repo:, try a very broad fallback inside that repo.
      if (seen.size === 0 && /\brepo:\S+\/\S+/.test(qualifiers) && (Date.now() - startedAt) < budgetMs) {
        const m = qualifiers.match(/repo:(\S+\/\S+)/)
        const repoPart = m ? m[1] : ''
        const q = encodeURIComponent(`extension:yaml repo:${repoPart} path:crd path:crds`)
        const url = `https://api.github.com/search/code?q=${q}&per_page=50`
        try {
          const r = await fetchWithTimeout(url, { headers }, 5000)
          if (r.ok) {
            const data = await r.json()
            for (const it of (data.items || [])) {
              const key = it?.html_url || `${it?.repository?.full_name}/${it?.path}`
              if (key && !seen.has(key)) {
                seen.set(key, {
                  repo: it?.repository?.full_name || '',
                  path: it?.path || '',
                  html_url: it?.html_url || '',
                })
              }
            }
          }
        } catch {}
      }

      // Filter out Helm templates. If no qualifiers, avoid heavy content fetch: rely on path-based exclusions for speed.
      const preliminary = Array.from(seen.values()).slice(0, maxCandidates)
      const looksHelmPath = (p) => /(^|\/)templates(\/|$)|(^|\/)charts(\/|$)|(^|\/)helm(\/|$)/i.test(p || '')
      let filtered = preliminary.filter((it) => !looksHelmPath(it.path))
      if (!noQualifiers && (Date.now() - startedAt) < budgetMs) {
        const chunk = async (items, size) => {
          const out = []
          for (let i = 0; i < items.length; i += size) {
            const batch = items.slice(i, i + size)
            const results = await Promise.all(batch.map(async (it) => {
              try {
                const ownerRepo = it.repo
                const path = it.path
                if (!ownerRepo || !path) return null
                const contentsUrl = `https://api.github.com/repos/${ownerRepo}/contents/${encodeURIComponent(path)}`
                const cres = await fetchWithTimeout(contentsUrl, { headers }, 5000)
                if (!cres.ok) return null
                const cdata = await cres.json()
                if (!cdata || !cdata.content || cdata.encoding !== 'base64') return it // keep if cannot decode
                let text = ''
                try { text = atob(cdata.content.replace(/\n/g, '')) } catch { text = '' }
                if (text.includes('{{') || text.includes('}}')) return null
                return it
              } catch { return null }
            }))
            for (const r of results) if (r) out.push(r)
            if (out.length >= maxCandidates || (Date.now() - startedAt) > budgetMs) break
          }
          return out
        }
        filtered = await chunk(filtered, 10)
      }
      // Cache up to 50, show first 25
      const cacheItems = filtered.slice(0, 50)
      const shown = Math.min(25, cacheItems.length)
      setCrdSearchCache({ key: qualifiers, items: cacheItems, shown })
      setCrdResults(cacheItems.slice(0, shown))
    } catch (e) {
      setCrdResultsError(String(e.message || e))
    } finally {
      setCrdResultsLoading(false)
    }
  }

  const loadCrdFromGithubItem = async (item) => {
    try {
      const html = item?.html_url || ''
      const raw = html.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
      const r = await fetch(raw)
      if (!r.ok) throw new Error(`Failed to fetch CRD: ${r.status}`)
      const text = await r.text()
      const docs = parseAny(text)
      const d = docs.find((x) => x?.kind === 'CustomResourceDefinition') || docs[0]
      if (!d) throw new Error('No CRD found in file')
      const openapi = extractSchema(d)
      const hasSpec = Boolean(openapi?.properties?.spec)
      setHasSpecInSchema(hasSpec)
      setSchema(openapi)
      const rootSchema = hasSpec ? openapi.properties.spec : openapi
      const defaults = toDefaultFromSchema(rootSchema, !showOptional, true) || {}
      setForm(defaults)
      setHeader({
        apiVersion: d?.spec?.group ? `${d.spec.group}/${d?.spec?.versions?.[0]?.name || ''}` : (d?.apiVersion || ''),
        kind: d?.spec?.names?.kind || d?.kind || '',
        metadata: { name: '' },
      })
      configuredPathsRef.current = new Set()
    } catch (e) {
      setCrdResultsError(String(e.message || e))
    }
  }

  const previewCrdAtIndex = async (idx) => {
    try {
      const item = crdResults[idx]
      if (!item) return
      // Toggle off if already selected and preview present
      if (selectedCrd === idx && item.preview) {
        setSelectedCrd(null)
        return
      }
      let text = item.preview
      if (!text) {
        const html = item?.html_url || ''
        const raw = html.startsWith('https://github.com/')
          ? html.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
          : html
        const r = await fetch(raw)
        if (!r.ok) throw new Error(`Failed to fetch content: ${r.status}`)
        text = await r.text()
      }
      const next = [...crdResults]
      next[idx] = { ...item, preview: (text || '').slice(0, 4000) }
      setCrdResults(next)
      setSelectedCrd(idx)
    } catch (e) {
      setCrdResultsError(String(e.message || e))
    }
  }

  const onUploadValues = async (e) => {
    const file = e.target.files?.[0]
    if (!file) { setErrorMsg('No file selected.'); return }
    const text = await readFileAsText(file)
    const docs = parseAny(text)
    if (!docs.length) { setErrorMsg('The values file is empty or could not be parsed.'); return }
    const d = docs[0]
    const hasSchema = Boolean(schema)
    const raw = d?.spec ?? d
    setForm((prev) => {
      if (!hasSchema) {
        return raw || {}
      }
      if (hasSpecInSchema) {
        return deepMerge(prev || {}, raw || {})
      }
      return deepMerge(prev || {}, raw || {})
    })
    // Record configured paths from uploaded values
    try { collectPaths(raw || {}, []) } catch {}
    setHeader((prev) => ({
      apiVersion: d?.apiVersion ?? prev.apiVersion,
      kind: d?.kind ?? prev.kind,
      metadata: d?.metadata ?? prev.metadata,
    }))
    e.target.value = ''
    setErrorMsg('')
  }

  // Auto-generate YAML when form or header changes
  useEffect(() => {
    try {
      // Optionally prune non-required default values from spec
      const effectiveSchema = hasSpecInSchema ? schema?.properties?.spec : schema
      const specSource = form || {}
      const specForYaml = !showDefaultsInYaml && effectiveSchema ? pruneDefaults(specSource, effectiveSchema) : specSource
      const manifest = {
        apiVersion: header.apiVersion || '',
        kind: header.kind || '',
        metadata: header.metadata || { name: '' },
        spec: specForYaml
      }
      setYamlOut(yaml.dump(manifest))
    } catch (e) {
      setYamlOut('# Failed to generate YAML')
    }
  }, [form, header, schema, hasSpecInSchema, showDefaultsInYaml])

  const toMermaid = (rootSchema, title) => {
    const lines = ['graph TD']
    const maxNodes = 120
    let count = 0
    const esc = (s) => String(s || '').replaceAll('"', '\\"')
    const node = (id, label) => `  ${id}["${esc(label)}"]`
    const edge = (a, b, lbl) => `  ${a} -->${lbl ? `|${esc(lbl)}|` : ''} ${b}`
    const makeId = (path) => 'N_' + path.join('_').replace(/[^A-Za-z0-9_]/g, '_')
    const seen = new Set()
    const walk = (schema, path, parentId) => {
      if (count >= maxNodes) return
      const id = makeId(path.length ? path : ['root'])
      if (seen.has(id)) return
      seen.add(id)
      const t = schema?.type || (schema?.properties ? 'object' : schema?.items ? 'array' : 'any')
      const label = `${path[path.length-1] || title} : ${t}`
      lines.push(node(id, label))
      count++
      if (parentId) lines.push(edge(parentId, id))
      if (count >= maxNodes) return
      if (schema?.properties && typeof schema.properties === 'object') {
        for (const [k, v] of Object.entries(schema.properties)) {
          walk(v || {}, [...path, k], id)
          if (count >= maxNodes) break
        }
      } else if (schema?.items) {
        walk(schema.items, [...path, '[]'], id)
      }
    }
    walk(rootSchema || {}, [], null)
    return lines.join('\n')
  }

  useEffect(() => {
    try {
      if (!schema) { setMermaidText(''); return }
      const rootSchema = hasSpecInSchema ? schema.properties?.spec : schema
      const title = header.kind || 'Resource'
      const mm = toMermaid(rootSchema, title)
      setMermaidText(mm)
    } catch {
      setMermaidText('')
    }
  }, [schema, hasSpecInSchema, header.kind])

  // Render Mermaid diagram from text using CDN-loaded Mermaid
  useEffect(() => {
    setMermaidHtml('')
    if (!mermaidText) return
    const ensureMermaid = () => new Promise((resolve) => {
      if (window.mermaid) return resolve(window.mermaid)
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
      s.async = true
      s.onload = () => resolve(window.mermaid)
      document.head.appendChild(s)
    })
    let cancelled = false
    ensureMermaid().then((mermaid) => {
      if (!mermaid || cancelled) return
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        const id = 'mmd_' + Math.random().toString(36).slice(2)
        mermaid.render(id, mermaidText).then(({ svg }) => {
          // Keep raw SVG for on-screen rendering; scale with CSS transform to avoid layout shifts
          if (!cancelled) setMermaidHtml(svg || '')
        }).catch(() => {})
      } catch {}
    })
    return () => { cancelled = true }
  }, [mermaidText])

  // Fetch examples from GitHub Code Search
  const searchExamples = async () => {
    setExamplesError('')
    setExamples([])
    setSelectedExample(null)
    const apiVersion = (header.apiVersion || '').trim()
    const kind = (header.kind || '').trim()
    if (!kind) {
      setExamplesError('Set kind first to search examples.')
      return
    }
    setExamplesLoading(true)
    try {
      const headers = {
        Accept: 'application/vnd.github.text-match+json',
        ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
      }
      const startedAt = Date.now()
      const budgetMs = 15000
      const fetchWithTimeout = async (url, opts = {}, ms = 6000) => {
        const ctl = new AbortController()
        const id = setTimeout(() => ctl.abort(), ms)
        try { return await fetch(url, { ...opts, signal: ctl.signal }) } finally { clearTimeout(id) }
      }
      const nap = (ms) => new Promise((r) => setTimeout(r, ms))
      const kw = (extraKeyword || '').trim()
      const suffix = kw ? ` ${kw}` : ''
      const queries = [
        // strict apiVersion+kind, only if apiVersion is set
        ...(apiVersion ? [
          `apiVersion:"${apiVersion}" kind:"${kind}" extension:yaml${suffix}`,
          `apiVersion:"${apiVersion}" kind:"${kind}" extension:yml${suffix}`,
        ] : []),
        // kind only
        `kind:"${kind}" extension:yaml${suffix}`,
        `kind:"${kind}" extension:yml${suffix}`,
        // filename and path heuristics
        `filename:${kind}.yaml${suffix ? ' ' + kw : ''}`,
        `filename:${kind}.yml${suffix ? ' ' + kw : ''}`,
        `filename:*${kind}* extension:yaml${suffix}`,
        `filename:*${kind}* extension:yml${suffix}`,
        // common example dirs
        `path:examples extension:yaml${suffix}`,
        `path:examples extension:yml${suffix}`,
        `path:samples extension:yaml${suffix}`,
        `path:samples extension:yml${suffix}`,
        // kind in path
        `path:${kind} extension:yaml${suffix}`,
        `path:${kind} extension:yml${suffix}`,
      ]

      const seen = new Set()
      const out = []

      const fetchPreview = async (ownerRepo, path, html_url, name) => {
        if (Date.now() - startedAt > budgetMs) return
        const contentsUrl = `https://api.github.com/repos/${ownerRepo}/contents/${encodeURIComponent(path)}`
        const cres = await fetchWithTimeout(contentsUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
            ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
          },
        }, 5000)
        if (!cres.ok) return
        const cdata = await cres.json()
        let text = ''
        if (cdata && cdata.content && cdata.encoding === 'base64') {
          try { text = atob(cdata.content.replace(/\n/g, '')) } catch {}
        }
        // Exclude templated YAMLs (e.g., Helm) containing Mustache/Go templates
        if (text.includes('{{') || text.includes('}}')) return
        // Exclude CRD definitions from YAML examples (they belong to CRD results)
        const isCrdByContent = /\bkind\s*:\s*['"]?CustomResourceDefinition['"]?/i.test(text) || /"kind"\s*:\s*"CustomResourceDefinition"/i.test(text)
        const isCrdByName = /customresourcedefinition/i.test(String(name || '')) || /customresourcedefinition/i.test(String(path || ''))
        if (isCrdByContent || isCrdByName) return
        // Require at least one YAML document with kind exactly equal to the searched Kind
        let hasMatchingKind = false
        try {
          const docs = yaml.loadAll(text).filter(Boolean)
          for (const d of docs) {
            if (d && typeof d === 'object' && String(d.kind || '') === kind) { hasMatchingKind = true; break }
          }
        } catch {}
        if (!hasMatchingKind) return
        out.push({
          name,
          repo: ownerRepo,
          path,
          html_url,
          preview: text.split('\n').slice(0, 80).join('\n'),
        })
      }

      for (let i = 0; i < queries.length; i++) {
        if (Date.now() - startedAt > budgetMs || out.length >= 50) break
        const q = encodeURIComponent(queries[i])
        if (i > 0) await nap(400)
        const res = await fetchWithTimeout(`https://api.github.com/search/code?q=${q}&per_page=50`, { headers }, 5000)
        if (!res.ok) {
          const t = await res.text()
          if (res.status === 401 || res.status === 403) {
            const remaining = res.headers.get('x-ratelimit-remaining')
            const reset = res.headers.get('x-ratelimit-reset')
            if (remaining === '0' && reset) {
              const secs = Math.max(0, Math.floor(Number(reset) - Date.now() / 1000))
              setExamplesError(`GitHub rate limit reached. Try again in ~${secs}s or use a token.`)
            } else {
              setExamplesError('GitHub search failed or was rate limited. Adding a GitHub token can help (public repo read).')
            }
          } else {
            setExamplesError(`GitHub search failed: ${res.status} ${t}`)
          }
          break
        }
        const data = await res.json()
        const items = (data.items || []).slice(0, 80)
        const batch = []
        for (const it of items) {
          if (Date.now() - startedAt > budgetMs || out.length >= 50) break
          const ownerRepo = it.repository?.full_name
          const path = it.path
          if (!ownerRepo || !path) continue
          const key = `${ownerRepo}::${path}`
          if (seen.has(key)) continue
          seen.add(key)
          batch.push(fetchPreview(ownerRepo, path, it.html_url, it.name))
          if (batch.length >= 10) {
            await Promise.all(batch.splice(0, batch.length))
            if (out.length >= 50 || Date.now() - startedAt > budgetMs) break
          }
        }
        if (batch.length) await Promise.all(batch)
        if (out.length >= 50) break
      }
      setExamples(out)
    } catch (e) {
      setExamplesError(String(e.message || e))
    } finally {
      setExamplesLoading(false)
    }
  }

return (
  <div className="min-h-screen p-6 bg-gray-50">
    <div className="max-w-6xl w-full mx-auto grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">visual-crd</h1>
      </div>
      {errorMsg && (
        <Card className="p-0">
          <CardContent>
            <div className="text-sm text-red-700">{errorMsg}</div>
          </CardContent>
        </Card>
      )}
      {/* Header + Examples side by side, equal height */}
      <div className="grid gap-6 md:grid-cols-2 items-stretch">
        <div className="grid gap-3 h-full">
          <Card className="p-0 h-full">
            <CardContent className="h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Header</div>
                <div className="flex items-center gap-3">
                  <input ref={crdInputRef} type="file" accept=".yaml,.yml,application/yaml,application/json,.json" onChange={onUpload} className="hidden" />
                  <input ref={valuesInputRef} type="file" accept=".yaml,.yml,application/yaml,application/json,.json" onChange={onUploadValues} className="hidden" />
                  <Button variant="outline" onClick={clearAll}>Clear All</Button>
                  <Button variant="outline" onClick={() => crdInputRef.current?.click()}>Upload CRD</Button>
                  <Button variant="outline" onClick={() => valuesInputRef.current?.click()}>Load Values</Button>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="grid gap-1">
                  <label className="text-sm font-medium">apiVersion</label>
                  <UIInput value={header.apiVersion} onChange={(e) => setHeader((h) => ({ ...h, apiVersion: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm font-medium">kind</label>
                  <UIInput value={header.kind} onChange={(e) => setHeader((h) => ({ ...h, kind: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm font-medium">metadata.name</label>
                  <UIInput value={header.metadata?.name || ''} onChange={(e) => setHeader((h) => ({ ...h, metadata: { ...(h.metadata || {}), name: e.target.value } }))} />
                </div>
              </div>
              <div className="grid gap-1 mt-3">
                <label className="text-sm font-medium">metadata.labels (JSON)</label>
                <textarea
                  className="w-full border rounded p-2 font-mono text-sm min-h-24"
                  value={JSON.stringify(header.metadata?.labels || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value || '{}')
                      setHeader((h) => ({ ...h, metadata: { ...(h.metadata || {}), labels: parsed } }))
                    } catch {}
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="p-0 h-full">
          <CardContent className="h-full">
            <div className="text-sm font-semibold mb-3">Examples from GitHub</div>
            <div className="grid gap-2 mb-3">
              <label className="text-xs text-slate-600">GitHub Token (it is stored on the client side only)</label>
              <UIInput type="password" autoComplete="off" className="border-slate-300 bg-slate-100" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="ghp_..." />
            </div>
            <div className="grid gap-2 mb-3">
              <label className="text-xs text-slate-600">GitHub search (optional)</label>
              <UIInput className="border-slate-300 bg-slate-100" value={extraKeyword} onChange={(e) => setExtraKeyword(e.target.value)} placeholder="eg. repo:owner/name keyword" />
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={searchCrdsGithub}
                disabled={
                  crdResultsLoading ||
                  (crdSearchCache.key === (extraKeyword || '').trim() && crdSearchCache.items.length > 0 && crdSearchCache.shown >= crdSearchCache.items.length)
                }
              >Search CRD examples</Button>
              <Button variant="outline" onClick={searchExamples}>{`Search ${header.kind ? header.kind + ' ' : ''} YAML examples`}</Button>
            </div>
            {examplesLoading && <div className="text-xs text-slate-500">Searching...</div>}
            {examplesError && <div className="text-xs text-red-700">{examplesError}</div>}
            {!examplesLoading && !examplesError && examples.length === 0 && (
              <div className="text-xs text-slate-500">No results found after broad search. Try a different kind/version or add more keywords.</div>
            )}
            {!!examples.length && (
              <div className="text-xs font-semibold mb-1">{`${header.kind || 'Kind'} YAML (GitHub)`}</div>
            )}
            <div className="space-y-3 overflow-auto max-h-80">
              {examples.map((ex, i) => (
                <div key={`${ex.repo}/${ex.path}`} className="rounded border border-slate-200 p-2 bg-white">
                  <div className="text-xs font-medium text-slate-700 truncate">{ex.repo}</div>
                  <div className="text-xs text-slate-500 truncate">{ex.path}</div>
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" className="text-xs px-2 py-1" onClick={() => setSelectedExample(i)}>Preview</Button>
                    <Button variant="outline" className="text-xs px-2 py-1" onClick={() => loadExample(i)}>Load values</Button>
                    <a href={ex.html_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs underline">View on GitHub</a>
                  </div>
                  {selectedExample === i && (
                    <pre className="mt-2 max-h-56 overflow-auto text-xs bg-slate-50 p-2 rounded border border-slate-200">{ex.preview}</pre>
                  )}
                </div>
              ))}
            </div>
            {!!crdResultsError && <div className="text-xs text-red-700 mt-2">{crdResultsError}</div>}
            {crdResultsLoading && <div className="text-xs text-slate-500 mt-2">Searching CRDs...</div>}
            {!!crdResults.length && (
              <div className="mt-3">
                <div className="text-xs font-semibold mb-1">
                  CRD results (GitHub)
                  {crdSearchCache.items.length > 0 && crdSearchCache.key === (extraKeyword || '').trim() && (
                    <span className="ml-2 text-slate-500 font-normal">Showing {crdResults.length} of {crdSearchCache.items.length}</span>
                  )}
                </div>
                <div className="space-y-3 overflow-auto max-h-80">
                  {crdResults.map((it, i) => (
                    <div key={`${it.repo}/${it.path}`} className="rounded border border-slate-200 p-2 bg-white">
                      <div className="text-xs font-medium text-slate-700 truncate">{it.repo}</div>
                      <div className="text-xs text-slate-500 truncate">{it.path}</div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="outline" className="text-xs px-2 py-1" onClick={() => previewCrdAtIndex(i)}>Preview</Button>
                        <Button variant="outline" className="text-xs px-2 py-1" onClick={() => loadCrdFromGithubItem(it)}>Load CRD</Button>
                        <a className="text-blue-600 text-xs underline" href={it.html_url} target="_blank" rel="noreferrer">View on GitHub</a>
                      </div>
                      {selectedCrd === i && (
                        <pre className="mt-2 max-h-56 overflow-auto text-xs bg-slate-50 p-2 rounded border border-slate-200">{it.preview}</pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="p-0">
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Form</div>
            <div className="flex items-center gap-3">
              <label className="text-xs inline-flex items-center gap-2 opacity-100">
                <input type="checkbox" className="h-4 w-4" checked={showOptional} onChange={(e) => setShowOptional(e.target.checked)} disabled={!schema} /> Show optional fields
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  if (!schema) return
                  const rootSchema = hasSpecInSchema ? schema.properties.spec : schema
                  const next = toDefaultFromSchema(rootSchema, !showOptional, true) || {}
                  setForm(next)
                }}
                disabled={!schema}
              >Reset form</Button>
              <Button variant="outline" onClick={() => setFormOpen((v) => !v)}>{formOpen ? 'Fold' : 'Unfold'}</Button>
            </div>
          </div>
          {!schema && (
            <div className="text-xs text-slate-500 mb-2">Upload a CRD to enable the form.</div>
          )}
          {schema && formOpen && (
            <Field schema={hasSpecInSchema ? schema.properties.spec : schema} path={[hasSpecInSchema ? 'spec' : 'root']} value={form} onChange={setForm} required={true} showOptional={showOptional} />
          )}
        </CardContent>
      </Card>
      <Card className="p-0">
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">YAML</div>
            <div className="flex gap-3 items-center">
              <label className="text-xs inline-flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={showDefaultsInYaml} onChange={(e) => setShowDefaultsInYaml(e.target.checked)} /> Show default values
              </label>
              <Button variant="outline" onClick={() => setYamlOut('')}>Clear</Button>
              <Button
                variant="outline"
                onClick={() => downloadText((header.kind || 'resource').toLowerCase() + '.yaml', yamlOut)}
              >Download YAML</Button>
            </div>
          </div>
          <pre className="bg-gray-900 text-white p-3 rounded min-h-40 overflow-auto">{yamlOut}</pre>
        </CardContent>
      </Card>
      <Card className="p-0">
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Mermaid</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowMermaidSource((v) => !v)} disabled={!mermaidText}>{showMermaidSource ? 'Show diagram' : 'Show source'}</Button>
              <label className="text-xs inline-flex items-center gap-2">
                Scale
                <select className="border rounded px-2 py-1 text-xs" value={mermaidScale} onChange={(e) => setMermaidScale(parseFloat(e.target.value))}>
                  <option value={1}>1x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
              </label>
              <Button
                variant="outline"
                onClick={() => downloadText((header.kind || 'resource').toLowerCase() + '.mmd', mermaidText || 'graph TD\n')}
                disabled={!mermaidText}
              >Download .mmd</Button>
              <Button
                variant="outline"
                onClick={() => downloadSvg((header.kind || 'resource').toLowerCase() + '.svg', mermaidHtml)}
                disabled={!mermaidHtml}
              >Download SVG</Button>
              <Button
                variant="outline"
                onClick={() => downloadSvg((header.kind || 'resource').toLowerCase() + '_scaled.svg', scaleSvg(mermaidHtml, mermaidScale * baseMermaidScale))}
                disabled={!mermaidHtml}
              >Download SVG (scaled)</Button>
            </div>
          </div>
          {!mermaidText && (
            <div className="text-xs text-slate-500">Upload a CRD to generate a Mermaid graph.</div>
          )}
          {mermaidText && showMermaidSource && (
            <pre className="bg-gray-900 text-white p-3 rounded min-h-32 overflow-auto">{mermaidText}</pre>
          )}
          {mermaidText && !showMermaidSource && (
            mermaidHtml ? (
              <div className="bg-white p-3 rounded border overflow-auto max-h-96">
                <div style={{ transform: `scale(${mermaidScale * baseMermaidScale})`, transformOrigin: 'top left' }}>
                  <div
                    className="inline-block"
                    // Ensure the SVG doesn't shrink; we rely on transform scaling
                    dangerouslySetInnerHTML={{ __html: mermaidHtml.replace('<svg', '<svg style=\"display:block;max-width:none;height:auto\"') }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Rendering diagram...</div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  </div>
)
}
