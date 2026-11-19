import { useCallback, useEffect, useRef, useState } from 'react'

export function useResource(load, { interval = 0, enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null })
  const pending = useRef(null)
  const generation = useRef(0)

  const refresh = useCallback(function refresh({ afterCurrent = false } = {}) {
    if (!enabled) return Promise.resolve()
    const current = pending.current
    if (current) {
      if (!afterCurrent) return current.promise
      current.ignoreResult = true
      current.followup ??= current.promise.then(() => {
        if (generation.current === current.generation) return refresh()
      })
      return current.followup
    }
    const request = { generation: generation.current }
    pending.current = request
    request.promise = Promise.resolve().then(async () => {
      if (pending.current !== request) return
      try {
        const data = await load()
        if (pending.current === request && !request.ignoreResult) setState({ data, error: null })
      } catch (error) {
        if (pending.current === request && !request.ignoreResult) setState(previous => ({ ...previous, error }))
      } finally {
        if (pending.current === request) pending.current = null
      }
    })
    return request.promise
  }, [enabled, load])

  useEffect(() => {
    setState({ data: undefined, error: null })
    refresh()
    const timer = enabled && interval ? window.setInterval(() => refresh(), interval) : undefined
    return () => {
      generation.current += 1
      pending.current = null
      window.clearInterval(timer)
    }
  }, [enabled, interval, refresh])

  const updateData = useCallback(update => {
    setState(previous => ({ data: update(previous.data), error: null }))
  }, [])

  return { ...state, refresh, updateData }
}
