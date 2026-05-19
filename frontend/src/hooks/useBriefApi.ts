import { useState } from 'react'
import type { BriefResponse, BriefingSummary } from '../types/brief'

// ?? instead of || so that VITE_API_URL="" (empty string, relative URLs) is respected
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem('flightbrief_token')
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : extra
}

interface BriefFormData {
  departure: string
  arrival: string
  alternate?: string
  cruise_speed_kts?: number
  fuel_flow_gph?: number
  usable_fuel_gal?: number
  cruise_alt_ft?: number
  approach_type?: string
}

export function useBriefApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brief, setBrief] = useState<BriefResponse | null>(null)

  async function fetchBrief(data: BriefFormData) {
    setLoading(true)
    setError(null)
    setBrief(null)

    try {
      const resp = await fetch(`${API_BASE}/brief`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data),
      })

      if (!resp.ok) {
        const err = await resp.text()
        throw new Error(`API error ${resp.status}: ${err}`)
      }

      const result: BriefResponse = await resp.json()
      setBrief(result)
      return result
    } catch (e: any) {
      const msg = e?.message || 'Something went wrong'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }

  // load a brief from history without making a new API call
  function loadBrief(b: BriefResponse) {
    setBrief(b)
    setError(null)
  }

  return { fetchBrief, loadBrief, loading, error, brief }
}


export function useBriefHistory() {
  const [loading, setLoading] = useState(false)
  const [briefings, setBriefings] = useState<BriefingSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  async function loadHistory(departure?: string, arrival?: string) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (departure) params.set('departure', departure)
      if (arrival) params.set('arrival', arrival)

      const url = `${API_BASE}/briefings${params.toString() ? '?' + params : ''}`
      const resp = await fetch(url, { headers: authHeaders() })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data: BriefingSummary[] = await resp.json()
      setBriefings(data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  async function loadSingle(id: string): Promise<BriefResponse | null> {
    try {
      const resp = await fetch(`${API_BASE}/briefings/${id}`, { headers: authHeaders() })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return await resp.json()
    } catch (e: any) {
      setError(e?.message || 'Failed to load briefing')
      return null
    }
  }

  return { loadHistory, loadSingle, loading, briefings, error }
}
