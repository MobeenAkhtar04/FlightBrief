import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'flightbrief_token'

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))

  async function login(username: string, password: string): Promise<void> {
    const body = new URLSearchParams({ username, password })
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Login failed')
    }
    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setToken(data.access_token)
  }

  async function register(username: string, password: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Registration failed')
    }
    // register returns a token directly — store it and log in
    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setToken(data.access_token)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  return { token, login, register, logout }
}
