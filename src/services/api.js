import axios from 'axios'

export const SESSION_KEY = 'erp_session'
export const AUTH_EXPIRED_EVENT = 'erp:auth-expired'

export function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    if (session?.access_token && Date.parse(session.expires_at) > Date.now()) return session
  } catch { /* Invalid storage is treated as signed out. */ }
  localStorage.removeItem(SESSION_KEY)
  return null
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  // Remove credentials left by the former demo login.
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

const publicAuthPaths = ['/auth/login', '/auth/forgot-password', '/auth/reset-password']

export const api = axios.create({ baseURL: '/api/v1', timeout: 10000 })
api.interceptors.request.use((config) => {
  const session = readSession()
  if (session && !publicAuthPaths.includes(config.url)) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401 && !publicAuthPaths.includes(error.config?.url)) {
    clearSession()
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
  return Promise.reject(error)
})

export function authError(error) {
  if (error.response?.status === 401) return 'The email or password is incorrect.'
  if (error.response?.status === 422) return 'Enter a valid email and a password of 12–128 characters.'
  if (error.response?.status === 429) return 'Too many attempts. Please try again later.'
  return 'Cannot reach the local pharmacy service. Make sure the backend is running and try again.'
}

export async function signIn(email, password) {
  const { data } = await api.post('/auth/login', { email: email.trim(), password })
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    access_token: data.access_token, expires_at: data.expires_at,
  }))
  return data
}
