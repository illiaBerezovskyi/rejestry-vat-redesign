import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight,
  Columns3, Download, FileSearch, FileText, Info, MoreHorizontal, Printer, RefreshCw,
  Search, SlidersHorizontal, Tag, X, Sun, Moon, Send, CircleCheck, ShieldCheck, Inbox,
} from 'lucide-react'
import {
  Doc, Kind, KsefStatus, LoadMode, VatRate, MONTHS, YEARS, OP_TYPES, JPK_CODES, SERIES, LABELS,
  RATE_LABEL, KSEF_LABEL, MONTHS_SHORT, MonthTotal, loadDocs, yearTotals, ksefNumberFor, fmt, fmtDate, fmtDay, fmtShort,
} from './data'
import { Chip, Popover, Sheet } from './ui'

/* ---------- types & config ---------- */

type ColKey = 'contractor' | 'date' | 'number' | 'ksef' | 'id' | 'rate' | 'net' | 'vat' | 'gross'
type Col = { key: ColKey; visible: boolean }
type Filters = { opTypes: string[]; jpk: string[]; series: string[]; labels: string[]; ksef: KsefStatus[] }
type Sort = { key: ColKey; dir: 'asc' | 'desc' }

const COL_LABEL: Record<ColKey, string> = {
  contractor: 'Kontrahent', date: 'Data', number: 'Numer dokumentu', ksef: 'Numer KSeF',
  id: 'Identyfikator', rate: 'Stawka', net: 'Netto', vat: 'VAT', gross: 'Brutto',
}
const NUMERIC: ColKey[] = ['net', 'vat', 'gross']
const DEFAULT_COLS: Col[] = [
  { key: 'contractor', visible: true }, { key: 'date', visible: true }, { key: 'number', visible: true },
  { key: 'ksef', visible: true }, { key: 'id', visible: true }, { key: 'rate', visible: false },
  { key: 'net', visible: false }, { key: 'vat', visible: false }, { key: 'gross', visible: true },
]
const EMPTY_FILTERS: Filters = { opTypes: [], jpk: [], series: [], labels: [], ksef: [] }
const RATE_COLOR: Record<VatRate, string> = {
  '23': 'var(--accent)', '8': '#4f9e8f', '5': '#93c5b8', '0': '#c9b37a', zw: '#d9a35b', np: '#c4c9c6',
}

function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage unavailable — not critical */
  }
}

const sortValue = (d: Doc, k: ColKey): string | number =>
  k === 'ksef' ? d.ksefStatus : k === 'id' ? d.id : (d[k as keyof Doc] as string | number)

function downloadCsv(docs: Doc[], name: string) {
  const head = ['Kontrahent', 'NIP', 'Data', 'Numer dokumentu', 'Seria', 'Rodzaj operacji', 'Kody JPK', 'Status KSeF', 'Numer KSeF', 'Identyfikator', 'Stawka', 'Netto', 'VAT', 'Brutto', 'Etykiety']
  const rows = docs.map((d) => [d.contractor, d.nip, d.date, d.number, d.series, d.opType, d.jpk.join(' '), KSEF_LABEL[d.ksefStatus], d.ksefNumber ?? '', d.id, RATE_LABEL[d.rate], d.net, d.vat, d.gross, d.labels.join(' ')])
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

/* ---------- app ---------- */

export default function App() {
  const [kind, setKind] = useState<Kind>('sales')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(9)
  const [mode, setMode] = useState<LoadMode>(() => {
    const s = new URLSearchParams(location.search).get('state')
    return s === 'empty' || s === 'error' ? s : 'ok'
  })
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  const [docs, setDocs] = useState<Doc[]>([])
  const [labelEdits, setLabelEdits] = useState<Record<string, string[]>>({})
  const [ksefEdits, setKsefEdits] = useState<Record<string, { status: KsefStatus; number?: string }>>({})
  const [sending, setSending] = useState(false)
  const [reload, setReload] = useState(0)

  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(() => store('vat.perPage', 10))
  const [cols, setCols] = useState<Col[]>(() => store('vat.cols', DEFAULT_COLS))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'filters' | 'columns' | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    store('vat.theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    save('vat.theme', theme)
  }, [theme])

  useEffect(() => save('vat.cols', cols), [cols])
  useEffect(() => save('vat.perPage', perPage), [perPage])

  useEffect(() => {
    let live = true
    setStatus('loading')
    setSelected(new Set())
    loadDocs(kind, year, month, mode)
      .then((d) => live && (setDocs(d), setStatus('ok')))
      .catch((e: Error) => live && (setError(e.message), setStatus('error')))
    return () => {
      live = false
    }
  }, [kind, year, month, mode, reload])

  useEffect(() => setPage(1), [kind, year, month, query, filters, perPage])

  const allDocs = useMemo(
    () =>
      docs.map((d) => {
        const k = ksefEdits[d.id]
        const withLabels = labelEdits[d.id] ? { ...d, labels: labelEdits[d.id] } : d
        return k ? { ...withLabels, ksefStatus: k.status, ksefNumber: k.number } : withLabels
      }),
    [docs, labelEdits, ksefEdits],
  )
  const totals = useMemo(() => yearTotals(kind, year, mode), [kind, year, mode])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const f = filters
    const res = allDocs.filter(
      (d) =>
        (!q || [d.contractor, d.number, d.id, d.nip, d.ksefNumber ?? ''].some((v) => v.toLowerCase().includes(q))) &&
        (!f.opTypes.length || f.opTypes.includes(d.opType)) &&
        (!f.jpk.length || d.jpk.some((c) => f.jpk.includes(c))) &&
        (!f.series.length || f.series.includes(d.series)) &&
        (!f.labels.length || d.labels.some((l) => f.labels.includes(l))) &&
        (!f.ksef.length || f.ksef.includes(d.ksefStatus)),
    )
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...res].sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key)
      return (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y), 'pl', { numeric: true })) * dir
    })
  }, [allDocs, query, filters, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageDocs = filtered.slice((page - 1) * perPage, page * perPage)
  const visibleCols = cols.filter((c) => c.visible)
  const filterCount = Object.values(filters).reduce((n, v) => n + v.length, 0)
  const hasNarrowing = filterCount > 0 || query.trim() !== ''
  const openDoc = allDocs.find((d) => d.id === openId) ?? null
  const periodName = `${MONTHS[month]} ${year}`

  const shiftMonth = (delta: number) => {
    const m = month + delta
    if (m < 0 && year > YEARS[0]) (setYear(year - 1), setMonth(11))
    else if (m > 11 && year < YEARS[YEARS.length - 1]) (setYear(year + 1), setMonth(0))
    else if (m >= 0 && m <= 11) setMonth(m)
  }
  const canPrev = !(year === YEARS[0] && month === 0)

  const toggleSort = (key: ColKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const allOnPage = pageDocs.length > 0 && pageDocs.every((d) => selected.has(d.id))
  const togglePage = () =>
    setSelected((s) => {
      const n = new Set(s)
      pageDocs.forEach((d) => (allOnPage ? n.delete(d.id) : n.add(d.id)))
      return n
    })
  const setLabels = (ids: string[], label: string, on: boolean) =>
    setLabelEdits((e) => {
      const n = { ...e }
      ids.forEach((id) => {
        const cur = n[id] ?? allDocs.find((d) => d.id === id)?.labels ?? []
        n[id] = on ? Array.from(new Set([...cur, label])) : cur.filter((l) => l !== label)
      })
      return n
    })
  const clearAll = () => (setFilters(EMPTY_FILTERS), setQuery(''))
  const fileBase = `rejestr-vat-${kind === 'sales' ? 'sprzedaz' : 'zakupy'}-${year}-${String(month + 1).padStart(2, '0')}`
  const retry = useCallback(() => setReload((r) => r + 1), [])

  const selectedDocs = allDocs.filter((d) => selected.has(d.id))

  const ksefTodo = allDocs.filter((d) => d.ksefStatus !== 'confirmed')
  const sendToKsef = async () => {
    setSending(true)
    for (const d of ksefTodo) {
      setKsefEdits((e) => ({ ...e, [d.id]: { status: 'pending' } }))
      await new Promise((r) => setTimeout(r, 260))
      setKsefEdits((e) => ({ ...e, [d.id]: { status: 'confirmed', number: ksefNumberFor(d) } }))
    }
    setSending(false)
  }
  const ksefFilterOn = filters.ksef.length > 0
  const toggleKsefFilter = () => setFilters({ ...filters, ksef: ksefFilterOn ? [] : ['missing', 'pending'] })

  const grouped = sort.key === 'date'
  const groups = grouped ? dayGroups(pageDocs) : [{ date: '', docs: pageDocs }]
  const dayStats = (date: string) => {
    const ds = filtered.filter((d) => d.date === date)
    return { count: ds.length, gross: ds.reduce((a, d) => a + d.gross, 0) }
  }

  return (
    <div className="page">
      {/* ---------- header ---------- */}
      <header className="head">
        <div className="head-title">
          <span className="eyebrow">Onsaldo Preview Sp. z o.o.</span>
          <div className="title-row">
            <h1>Rejestry i VAT</h1>
            <ContextBadge confirmed={confirmed} onConfirm={() => setConfirmed(true)} />
          </div>
        </div>
        <div className="head-side">
        <button
          className="icon-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Motyw jasny' : 'Motyw ciemny'}
          title={theme === 'dark' ? 'Motyw jasny' : 'Motyw ciemny'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        </div>
      </header>

      <div className="segmented" role="tablist" aria-label="Rodzaj rejestru">
        {(['sales', 'purchases'] as Kind[]).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {k === 'sales' ? 'Sprzedaż' : 'Zakupy'}
          </button>
        ))}
        <span className="seg-thumb" style={{ transform: `translateX(${kind === 'sales' ? 0 : 100}%)` }} />
      </div>

      {/* ---------- overview ---------- */}
      <MonthStrip
        totals={totals} year={year} month={month} kind={kind}
        onPick={setMonth}
        onShift={shiftMonth}
        onYear={(d) => setYear(year + d)}
        canPrevYear={year > YEARS[0]} canNextYear={year < YEARS[YEARS.length - 1]}
      />
      <div className="overview">
        <Summary status={status} docs={filtered} narrowed={hasNarrowing} />
        {status === 'ok' && allDocs.length > 0 && (
          <KsefCard
            confirmed={allDocs.length - ksefTodo.length} total={allDocs.length}
            sending={sending} onSend={sendToKsef}
            filterOn={ksefFilterOn} onToggleFilter={toggleKsefFilter}
          />
        )}
      </div>

      {/* ---------- toolbar ---------- */}
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj kontrahenta, numeru, NIP…"
            aria-label="Szukaj"
          />
          {query && (
            <button className="icon-btn ghost sm" onClick={() => setQuery('')} aria-label="Wyczyść wyszukiwanie">
              <X size={16} />
            </button>
          )}
        </label>
        <button className={`btn ${filterCount ? 'btn-tint' : ''}`} onClick={() => setSheet('filters')}>
          <SlidersHorizontal size={17} />
          <span className="hide-xs">Filtry</span>
          {filterCount > 0 && <span className="count">{filterCount}</span>}
        </button>
        <Popover
          trigger={({ toggle, open }) => (
            <button className={`icon-btn ${open ? 'pressed' : ''}`} onClick={toggle} aria-label="Więcej akcji" aria-expanded={open}>
              <MoreHorizontal size={18} />
            </button>
          )}
        >
          {(close) => (
            <div className="menu" role="menu">
              <button role="menuitem" disabled={!filtered.length} onClick={() => (downloadCsv(filtered, fileBase + '.csv'), close())}>
                <Download size={16} /> Eksportuj CSV <small>{filtered.length}</small>
              </button>
              <button role="menuitem" disabled={!filtered.length} onClick={() => (close(), setTimeout(() => window.print(), 50))}>
                <Printer size={16} /> Drukuj rejestr
              </button>
              <hr />
              <button role="menuitem" onClick={() => (close(), setSheet('filters'))}>
                <Tag size={16} /> Etykiety i serie
              </button>
              <button role="menuitem" onClick={() => (close(), setSheet('columns'))}>
                <Columns3 size={16} /> Kolumny tabeli
              </button>
            </div>
          )}
        </Popover>
      </div>

      {filterCount > 0 && (
        <div className="active-chips">
          {(Object.keys(filters) as (keyof Filters)[]).flatMap((k) =>
            filters[k].map((v) => (
              <button key={k + v} className="chip on removable" onClick={() => setFilters({ ...filters, [k]: filters[k].filter((x) => x !== v) })}>
                {k === 'ksef' ? `KSeF: ${KSEF_LABEL[v as KsefStatus]}` : v}
                <X size={14} />
              </button>
            )),
          )}
          <button className="link" onClick={() => setFilters(EMPTY_FILTERS)}>Wyczyść</button>
        </div>
      )}

      {/* ---------- list ---------- */}
      <section className="card list-card" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'loading' && <Skeleton />}
        {status === 'error' && (
          <State
            tone="error" icon={<AlertTriangle size={26} />}
            title="Nie udało się wczytać rejestru"
            text={error}
            action={<button className="btn btn-primary" onClick={retry}><RefreshCw size={16} /> Spróbuj ponownie</button>}
          />
        )}
        {status === 'ok' && docs.length === 0 && (
          <State
            icon={<Inbox size={26} />}
            title={`Brak dokumentów · ${periodName}`}
            text={`W rejestrze ${kind === 'sales' ? 'sprzedaży' : 'zakupów'} nie ma jeszcze dokumentów za ten okres.`}
            action={canPrev && <button className="btn" onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /> Poprzedni miesiąc</button>}
          />
        )}
        {status === 'ok' && docs.length > 0 && filtered.length === 0 && (
          <State
            icon={<FileSearch size={26} />}
            title="Nic nie pasuje do wyszukiwania"
            text="Zmień frazę lub usuń część filtrów."
            action={<button className="btn" onClick={clearAll}>Wyczyść filtry</button>}
          />
        )}
        {status === 'ok' && filtered.length > 0 && (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input type="checkbox" checked={allOnPage} onChange={togglePage} aria-label="Zaznacz stronę" />
                  </th>
                  {visibleCols.map((c) => (
                    <th key={c.key} className={NUMERIC.includes(c.key) ? 'num' : ''} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button className="th-btn" onClick={() => toggleSort(c.key)}>
                        {COL_LABEL[c.key]}
                        {sort.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} className="faint" />}
                      </button>
                    </th>
                  ))}
                  <th className="col-end">
                    <button className="icon-btn ghost sm" onClick={() => setSheet('columns')} aria-label="Kolumny tabeli" title="Kolumny tabeli">
                      <Columns3 size={16} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.date || 'all'}>
                  {g.date && (
                    <tr className="day-row">
                      <td colSpan={visibleCols.length + 2}><DayHead date={g.date} {...dayStats(g.date)} /></td>
                    </tr>
                  )}
                  {g.docs.map((d) => (
                  <tr key={d.id} className={selected.has(d.id) ? 'sel' : ''} onClick={() => setOpenId(d.id)}>
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSel(d.id)} aria-label={`Zaznacz ${d.number}`} />
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.key} className={NUMERIC.includes(c.key) ? 'num' : ''}>
                        <Cell doc={d} col={c.key} />
                      </td>
                    ))}
                    <td className="col-end"><ChevronRight size={16} className="faint" /></td>
                  </tr>
                  ))}
                  </Fragment>
                ))}
              </tbody>
            </table>

            <ul className="cards">
              {groups.map((g) => (
                <Fragment key={g.date || 'all'}>
                {g.date && <li className="day-head"><DayHead date={g.date} {...dayStats(g.date)} /></li>}
                {g.docs.map((d) => (
                <li key={d.id} className={selected.has(d.id) ? 'sel' : ''}>
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSel(d.id)} aria-label={`Zaznacz ${d.number}`} />
                  <button className="card-row" onClick={() => setOpenId(d.id)}>
                    <span className="cr-top">
                      <strong>{d.contractor}</strong>
                      <span className={`amount ${d.gross < 0 ? 'neg' : ''}`}>{fmt(d.gross)}</span>
                    </span>
                    <span className="cr-sub">{grouped ? d.number : `${d.number} · ${fmtDate(d.date)}`}</span>
                    <span className="cr-meta">
                      <KsefBadge status={d.ksefStatus} />
                      {d.labels.map((l) => <span key={l} className="label">{l}</span>)}
                    </span>
                  </button>
                </li>
                ))}
                </Fragment>
              ))}
            </ul>

            <footer className="pager">
              <span className="muted">
                {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} z {filtered.length}
              </span>
              <div className="pager-ctrl">
                <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} aria-label="Wierszy na stronie" className="select-mini">
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / str.</option>)}
                </select>
                <button className="icon-btn sm" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Poprzednia strona"><ChevronLeft size={16} /></button>
                <span className="page-no">{page} / {pages}</span>
                <button className="icon-btn sm" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Następna strona"><ChevronRight size={16} /></button>
              </div>
            </footer>
          </>
        )}
      </section>

      {/* ---------- bulk bar ---------- */}
      {selected.size > 0 && (
        <div className="bulk">
          <span><b>{selected.size}</b> zaznaczone</span>
          <Popover
            align="start"
            trigger={({ toggle }) => <button className="bulk-btn" onClick={toggle}><Tag size={16} /> <span className="hide-xs">Etykieta</span></button>}
          >
            {(close) => (
              <div className="menu up">
                {LABELS.map((l) => {
                  const all = selectedDocs.every((d) => d.labels.includes(l))
                  return (
                    <button key={l} onClick={() => (setLabels([...selected], l, !all), close())}>
                      <span className="check-slot">{all && <Check size={15} />}</span> {l}
                    </button>
                  )
                })}
              </div>
            )}
          </Popover>
          <button className="bulk-btn" onClick={() => downloadCsv(selectedDocs, fileBase + '-wybrane.csv')}><Download size={16} /> <span className="hide-xs">Eksportuj</span></button>
          <button className="bulk-btn" onClick={() => setSelected(new Set())} aria-label="Odznacz wszystko"><X size={16} /></button>
        </div>
      )}

      {/* ---------- sheets ---------- */}
      <FiltersSheet
        open={sheet === 'filters'} onClose={() => setSheet(null)} kind={kind}
        value={filters} onChange={setFilters} resultCount={filtered.length}
      />
      <ColumnsSheet open={sheet === 'columns'} onClose={() => setSheet(null)} cols={cols} onChange={setCols} />
      <DocSheet
        doc={openDoc} onClose={() => setOpenId(null)}
        onToggleLabel={(l, on) => openDoc && setLabels([openDoc.id], l, on)}
        onStep={(dir) => {
          const i = filtered.findIndex((d) => d.id === openId)
          const next = filtered[i + dir]
          if (next) setOpenId(next.id)
        }}
        position={filtered.findIndex((d) => d.id === openId)} total={filtered.length}
      />

      <PrintTable docs={filtered} title={`Rejestr VAT ${kind === 'sales' ? 'sprzedaży' : 'zakupów'} · ${periodName}`} />

      {/* ---------- demo state switcher (for reviewers) ---------- */}
      <div className="demo-switch" aria-label="Podgląd stanu ekranu">
        <span>Stan</span>
        {(['ok', 'empty', 'error'] as LoadMode[]).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {m === 'ok' ? 'Dane' : m === 'empty' ? 'Pusto' : 'Błąd'}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- pieces ---------- */

function ContextBadge({ confirmed, onConfirm }: { confirmed: boolean; onConfirm: () => void }) {
  return (
    <Popover
      align="start"
      trigger={({ toggle }) => (
        <button className={`badge ${confirmed ? 'badge-ok' : 'badge-warn'}`} onClick={toggle}>
          {confirmed ? <ShieldCheck size={14} /> : <Info size={14} />}
          {confirmed ? 'Demo · potwierdzony' : 'Demo · wymaga potwierdzenia'}
        </button>
      )}
    >
      {(close) => (
        <div className="note">
          <b>Dane demonstracyjne</b>
          <p>Poniżej wyłącznie dane demonstracyjne, nie ewidencja organizacji. {confirmed ? 'Kontekst VAT został potwierdzony.' : 'Kontekst VAT wymaga potwierdzenia.'}</p>
          {!confirmed && <button className="btn btn-primary sm" onClick={() => (onConfirm(), close())}>Potwierdź kontekst VAT</button>}
        </div>
      )}
    </Popover>
  )
}

function dayGroups(docs: Doc[]) {
  const out: { date: string; docs: Doc[] }[] = []
  docs.forEach((d) => {
    const last = out[out.length - 1]
    if (last && last.date === d.date) last.docs.push(d)
    else out.push({ date: d.date, docs: [d] })
  })
  return out
}

function DayHead({ date, count, gross }: { date: string; count: number; gross: number }) {
  const { day, weekday } = fmtDay(date)
  return (
    <div className="day">
      <span><b>{day}</b> <span className="muted">{weekday}</span></span>
      <span className="muted">{count} dok. · <span className="amount">{fmt(gross)}</span></span>
    </div>
  )
}

function MonthStrip({ totals, year, month, kind, onPick, onShift, onYear, canPrevYear, canNextYear }: {
  totals: MonthTotal[]; year: number; month: number; kind: Kind
  onPick: (m: number) => void; onShift: (d: number) => void; onYear: (d: number) => void
  canPrevYear: boolean; canNextYear: boolean
}) {
  const max = Math.max(...totals.map((t) => t.gross), 1)
  const yearGross = totals.reduce((a, t) => a + t.gross, 0)
  const cur = totals[month]
  const prev = month > 0 ? totals[month - 1] : null
  const delta = prev && prev.gross && cur.gross ? Math.round(((cur.gross - prev.gross) / prev.gross) * 100) : null
  return (
    <section className="card strip" aria-label="Okres rozliczeniowy">
      <div className="strip-head">
        <div>
          <span className="eyebrow">Okres · {kind === 'sales' ? 'sprzedaż' : 'zakupy'}</span>
          <div className="strip-title">
            <span className="cap">{MONTHS[month]}</span> <span className="title-year">{year}</span>
            {delta !== null && (
              <span className={`delta ${delta >= 0 ? 'up' : 'down'}`} title="Zmiana brutto względem poprzedniego miesiąca">
                {delta >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(delta)}%
              </span>
            )}
          </div>
        </div>
        <div className="year-switch">
          <button className="icon-btn ghost sm" disabled={!canPrevYear} onClick={() => onYear(-1)} aria-label="Poprzedni rok"><ChevronLeft size={16} /></button>
          <div className="year-info"><b>{year}</b><span className="muted">{yearGross ? `${fmtShort(yearGross)} zł` : '—'}</span></div>
          <button className="icon-btn ghost sm" disabled={!canNextYear} onClick={() => onYear(1)} aria-label="Następny rok"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div
        className="months" role="listbox" aria-label="Miesiąc" tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') (e.preventDefault(), onShift(-1))
          if (e.key === 'ArrowRight') (e.preventDefault(), onShift(1))
        }}
      >
        {totals.map((t, i) => (
          <button
            key={i} role="option" aria-selected={i === month} tabIndex={-1}
            className={`m ${i === month ? 'on' : ''} ${t.count ? '' : 'empty'}`}
            onClick={() => onPick(i)}
            aria-label={`${MONTHS[i]} ${year}: ${t.count ? `${fmt(t.gross)}, ${t.count} dokumentów` : 'brak dokumentów'}`}
          >
            <span className="m-val">{t.count ? fmtShort(t.gross) : '—'}</span>
            <span className="m-track">
              <span className="m-bar" style={{ height: t.count ? `${Math.max(6, (t.gross / max) * 100)}%` : '3px' }}>
                {t.count > 0 && <span className="m-vat" style={{ height: `${(t.vat / t.gross) * 100}%` }} />}
              </span>
            </span>
            <span className="m-label">{MONTHS_SHORT[i]}</span>
          </button>
        ))}
      </div>
      <div className="strip-legend muted">
        <span><i className="lg-gross" />Brutto</span>
        <span><i className="lg-vat" />w tym VAT</span>
      </div>
    </section>
  )
}

function KsefCard({ confirmed, total, sending, onSend, filterOn, onToggleFilter }: {
  confirmed: number; total: number; sending: boolean; onSend: () => void; filterOn: boolean; onToggleFilter: () => void
}) {
  const done = confirmed === total
  const R = 26
  const C = 2 * Math.PI * R
  return (
    <section className={`card ksef-card ${done ? 'done' : ''}`} aria-live="polite">
      <div className="ring">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r={R} className="ring-bg" />
          <circle cx="32" cy="32" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - confirmed / total)} />
        </svg>
        <span>{done ? <CircleCheck size={22} /> : `${confirmed}/${total}`}</span>
      </div>
      <div className="ksef-body">
        <b>{done ? 'Wszystko w KSeF' : 'Potwierdzenie w KSeF'}</b>
        <span className="muted small">
          {done ? 'Wszystkie dokumenty okresu mają numer KSeF.' : `${total - confirmed} z ${total} dokumentów czeka na numer KSeF.`}
        </span>
        {!done && (
          <div className="ksef-actions">
            <button className="btn btn-primary sm" onClick={onSend} disabled={sending}>
              {sending ? <RefreshCw size={15} className="spin" /> : <Send size={15} />} {sending ? 'Wysyłanie…' : 'Wyślij do KSeF'}
            </button>
            <button className={`btn sm ${filterOn ? 'btn-tint' : ''}`} onClick={onToggleFilter} aria-pressed={filterOn}>
              {filterOn ? 'Pokaż wszystkie' : 'Pokaż oczekujące'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function Summary({ status, docs, narrowed }: { status: string; docs: Doc[]; narrowed: boolean }) {
  const [open, setOpen] = useState(false)
  if (status === 'loading') return <section className="card summary"><div className="sk sk-lg" /><div className="sk" /></section>
  if (status !== 'ok' || docs.length === 0) return null
  const t = docs.reduce((a, d) => ({ net: a.net + d.net, vat: a.vat + d.vat, gross: a.gross + d.gross }), { net: 0, vat: 0, gross: 0 })
  const byRate = (['23', '8', '5', '0', 'zw', 'np'] as VatRate[])
    .map((r) => {
      const ds = docs.filter((d) => d.rate === r)
      return { r, n: ds.length, net: ds.reduce((s, d) => s + d.net, 0), vat: ds.reduce((s, d) => s + d.vat, 0) }
    })
    .filter((x) => x.n > 0)
  const totalAbs = byRate.reduce((s, x) => s + Math.abs(x.net), 0) || 1
  return (
    <section className="card summary">
      <div className="sum-main">
        <div className="sum-gross">
          <span className="muted">Brutto{narrowed && ' · po filtrach'}</span>
          <strong>{fmt(t.gross)}</strong>
        </div>
        <dl className="sum-side">
          <div><dt>Netto</dt><dd>{fmt(t.net)}</dd></div>
          <div><dt>VAT</dt><dd>{fmt(t.vat)}</dd></div>
          <div><dt>Dokumenty</dt><dd>{docs.length}</dd></div>
        </dl>
      </div>
      <button className="rate-bar" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Kwoty według stawek VAT">
        <span className="bar">
          {byRate.map((x) => <span key={x.r} style={{ flexGrow: Math.abs(x.net) / totalAbs, background: RATE_COLOR[x.r] }} />)}
        </span>
        <span className="bar-legend">
          {byRate.map((x) => <span key={x.r}><i style={{ background: RATE_COLOR[x.r] }} />{RATE_LABEL[x.r]}</span>)}
          <ChevronDown size={15} className={`faint chev ${open ? 'up' : ''}`} />
        </span>
      </button>
      {open && (
        <table className="rate-table">
          <thead><tr><th>Stawka</th><th className="num">Netto</th><th className="num">VAT</th></tr></thead>
          <tbody>
            {byRate.map((x) => (
              <tr key={x.r}><td><i style={{ background: RATE_COLOR[x.r] }} />{RATE_LABEL[x.r]} <span className="muted">· {x.n} dok.</span></td><td className="num">{fmt(x.net)}</td><td className="num">{fmt(x.vat)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function KsefBadge({ status }: { status: KsefStatus }) {
  return <span className={`ksef ksef-${status}`}><i />{KSEF_LABEL[status]}</span>
}

function Cell({ doc: d, col }: { doc: Doc; col: ColKey }) {
  switch (col) {
    case 'contractor': return <span className="strong">{d.contractor}{d.labels.map((l) => <span key={l} className="label">{l}</span>)}</span>
    case 'date': return <span className="nowrap">{fmtDate(d.date)}</span>
    case 'number': return <span className="mono">{d.number}</span>
    case 'ksef': return <KsefBadge status={d.ksefStatus} />
    case 'id': return <span className="mono muted">{d.id}</span>
    case 'rate': return <>{RATE_LABEL[d.rate]}</>
    default: return <span className={`amount ${d[col] < 0 ? 'neg' : ''}`}>{fmt(d[col])}</span>
  }
}

function State({ icon, title, text, action, tone }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode; tone?: 'error' }) {
  return (
    <div className={`state ${tone ?? ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="state-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="skeleton">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="sk-row"><div className="sk" style={{ width: '28%' }} /><div className="sk" style={{ width: '18%' }} /><div className="sk" style={{ width: '22%' }} /></div>
      ))}
    </div>
  )
}

function Group<T extends string>({ title, options, value, onChange, render }: {
  title: string; options: T[]; value: T[]; onChange: (v: T[]) => void; render?: (v: T) => string
}) {
  return (
    <fieldset className="group">
      <legend>{title}</legend>
      <div className="chips">
        {options.map((o) => (
          <Chip key={o} active={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
            {render ? render(o) : o}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function FiltersSheet({ open, onClose, kind, value, onChange, resultCount }: {
  open: boolean; onClose: () => void; kind: Kind; value: Filters; onChange: (f: Filters) => void; resultCount: number
}) {
  const set = <K extends keyof Filters>(k: K) => (v: Filters[K]) => onChange({ ...value, [k]: v })
  return (
    <Sheet
      open={open} onClose={onClose} title="Filtry"
      footer={<>
        <button className="btn" onClick={() => onChange(EMPTY_FILTERS)}>Wyczyść</button>
        <button className="btn btn-primary grow" onClick={onClose}>Pokaż {resultCount} {resultCount === 1 ? 'dokument' : 'dokumenty'}</button>
      </>}
    >
      <Group title="Rodzaj operacji" options={OP_TYPES[kind]} value={value.opTypes} onChange={set('opTypes')} />
      <Group title="Kod JPK V7" options={JPK_CODES} value={value.jpk} onChange={set('jpk')} />
      <Group title="Serie dokumentów" options={SERIES} value={value.series} onChange={set('series')} />
      <Group title="Status KSeF" options={['confirmed', 'pending', 'missing'] as KsefStatus[]} value={value.ksef} onChange={set('ksef')} render={(s) => KSEF_LABEL[s]} />
      <Group title="Etykiety" options={LABELS} value={value.labels} onChange={set('labels')} />
    </Sheet>
  )
}

function ColumnsSheet({ open, onClose, cols, onChange }: { open: boolean; onClose: () => void; cols: Col[]; onChange: (c: Col[]) => void }) {
  const move = (i: number, d: number) => {
    const n = [...cols]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    onChange(n)
  }
  return (
    <Sheet open={open} onClose={onClose} title="Kolumny tabeli" footer={<>
      <button className="btn" onClick={() => onChange(DEFAULT_COLS)}>Przywróć domyślne</button>
      <button className="btn btn-primary grow" onClick={onClose}>Gotowe</button>
    </>}>
      <p className="muted small">Wybierz widoczne kolumny i ich kolejność.</p>
      <ul className="col-list">
        {cols.map((c, i) => (
          <li key={c.key}>
            <label>
              <input
                type="checkbox" checked={c.visible}
                disabled={c.key === 'contractor'}
                onChange={() => onChange(cols.map((x) => (x.key === c.key ? { ...x, visible: !x.visible } : x)))}
              />
              {COL_LABEL[c.key]}
            </label>
            <span>
              <button className="icon-btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Przesuń ${COL_LABEL[c.key]} wyżej`}><ArrowUp size={15} /></button>
              <button className="icon-btn ghost sm" disabled={i === cols.length - 1} onClick={() => move(i, 1)} aria-label={`Przesuń ${COL_LABEL[c.key]} niżej`}><ArrowDown size={15} /></button>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function DocSheet({ doc, onClose, onToggleLabel, onStep, position, total }: {
  doc: Doc | null; onClose: () => void; onToggleLabel: (l: string, on: boolean) => void; onStep: (d: number) => void; position: number; total: number
}) {
  return (
    <Sheet
      open={!!doc} onClose={onClose}
      title={doc && <><span className="eyebrow">{doc.opType}</span><div className="doc-title">{doc.number}</div></>}
      footer={doc && <>
        <button className="btn" disabled={position <= 0} onClick={() => onStep(-1)}><ChevronLeft size={16} /> Poprzedni</button>
        <span className="muted small">{position + 1} / {total}</span>
        <button className="btn" disabled={position >= total - 1} onClick={() => onStep(1)}>Następny <ChevronRight size={16} /></button>
      </>}
    >
      {doc && (
        <>
          <div className="doc-hero">
            <div>
              <div className="strong">{doc.contractor}</div>
              <div className="muted small">NIP {doc.nip}</div>
            </div>
            <div className={`doc-amount ${doc.gross < 0 ? 'neg' : ''}`}>{fmt(doc.gross)}</div>
          </div>
          <div className="doc-split">
            <div><span>Netto</span><b>{fmt(doc.net)}</b></div>
            <div><span>VAT {RATE_LABEL[doc.rate]}</span><b>{fmt(doc.vat)}</b></div>
          </div>
          <dl className="doc-grid">
            <div><dt>Data</dt><dd>{fmtDate(doc.date)}</dd></div>
            <div><dt>Seria</dt><dd>{doc.series}</dd></div>
            <div><dt>Identyfikator</dt><dd className="mono">{doc.id}</dd></div>
            <div><dt>Kody JPK V7</dt><dd>{doc.jpk.length ? doc.jpk.join(', ') : '—'}</dd></div>
            <div className="wide"><dt>KSeF</dt><dd><KsefBadge status={doc.ksefStatus} />{doc.ksefNumber && <div className="mono small">{doc.ksefNumber}</div>}</dd></div>
          </dl>
          <fieldset className="group">
            <legend>Etykiety</legend>
            <div className="chips">
              {LABELS.map((l) => (
                <Chip key={l} active={doc.labels.includes(l)} onClick={() => onToggleLabel(l, !doc.labels.includes(l))}>{l}</Chip>
              ))}
            </div>
          </fieldset>
          <div className="doc-actions">
            <button className="btn" onClick={() => downloadCsv([doc], `${doc.id}.csv`)}><Download size={16} /> Eksportuj</button>
            <button className="btn" onClick={() => window.print()}><FileText size={16} /> Drukuj</button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function PrintTable({ docs, title }: { docs: Doc[]; title: string }) {
  return (
    <div className="print-only">
      <h1>{title}</h1>
      <table>
        <thead><tr><th>Kontrahent</th><th>Data</th><th>Numer</th><th>KSeF</th><th>Identyfikator</th><th>Netto</th><th>VAT</th><th>Brutto</th></tr></thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}><td>{d.contractor}</td><td>{d.date}</td><td>{d.number}</td><td>{KSEF_LABEL[d.ksefStatus]}</td><td>{d.id}</td><td>{fmt(d.net)}</td><td>{fmt(d.vat)}</td><td>{fmt(d.gross)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
