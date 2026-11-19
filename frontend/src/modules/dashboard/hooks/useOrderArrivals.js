import { useEffect, useRef, useState } from 'react'
import { incomingOrders } from '../utils/incomingOrders'

export function useOrderArrivals(records) {
  const seen = useRef(null)
  const [arrivals, setArrivals] = useState([])
  const [latest, setLatest] = useState(null)
  useEffect(() => {
    if (!records) return
    const { known, additions } = incomingOrders(records, seen.current)
    seen.current = known
    if (additions.length) {
      setArrivals(previous => [...additions, ...previous].slice(0, 50))
      setLatest({ orderId: additions[0].orderId, count: additions.length })
    }
  }, [records])
  return { arrivals, latest, dismiss: () => setLatest(null) }
}
