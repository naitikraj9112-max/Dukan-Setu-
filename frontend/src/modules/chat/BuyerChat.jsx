import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, AudioLines, Check, CheckCircle2, ChevronDown, ChevronUp,
  LoaderCircle, Mic, Package, Send, ShoppingBag, Sparkles, Store, Zap
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

const apiBase = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

const DEMO_CATALOG = [
  { id: 'rice', name: 'Basmati Rice', unit: 'kg', price: 120, aliases: ['rice', 'chawal', 'basmati'] },
  { id: 'milk', name: 'Amul Taaza Milk', unit: 'L', price: 56, aliases: ['milk', 'doodh', 'dudh', 'amul'] },
  { id: 'atta', name: 'Whole Wheat Atta', unit: 'kg', price: 52, aliases: ['atta', 'flour', 'wheat', 'gehun'] },
  { id: 'oil', name: 'Sunflower Oil', unit: 'L', price: 145, aliases: ['oil', 'tel', 'sunflower'] },
  { id: 'dal', name: 'Toor Dal', unit: 'kg', price: 135, aliases: ['dal', 'daal', 'toor', 'arhar'] },
  { id: 'sugar', name: 'White Sugar', unit: 'kg', price: 46, aliases: ['sugar', 'cheeni', 'chini', 'shakkar'] },
  { id: 'tea', name: 'Assam Tea', unit: 'pack', price: 110, aliases: ['tea', 'chai', 'tea powder', 'patti'] },
  { id: 'poha', name: 'Thick Poha', unit: 'kg', price: 66, aliases: ['poha', 'aval', 'flattened rice'] },
]

const DEMO_SHOP = {
  id: 'demo',
  name: 'DukanSetu Demo Store',
  demo: true,
  description: 'Voice-enabled demo kirana store',
}

const actionLabels = {
  new_order: 'New order request',
  modify_order: 'Order change request',
  confirm_order: 'Voice order confirmation',
  reject_order: 'Order cancellation',
  unknown: 'Needs clarification',
}

const langNames = {
  'hi-IN': 'Hindi',
  'kn-IN': 'Kannada',
  'en-IN': 'English',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'mr-IN': 'Marathi',
  'gu-IN': 'Gujarati',
  'bn-IN': 'Bengali',
  'pa-IN': 'Punjabi',
  'ml-IN': 'Malayalam',
}

function clock() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function matchProductPrice(productName) {
  if (!productName) return null
  const clean = String(productName).toLowerCase()
  const found = DEMO_CATALOG.find(p =>
    p.name.toLowerCase().includes(clean) ||
    clean.includes(p.name.toLowerCase()) ||
    p.aliases.some(alias => clean.includes(alias))
  )
  return found || null
}

function OrderDraft({ result, onConfirm, confirmed }) {
  const itemsWithPrice = (result.items || []).map(item => {
    const matched = matchProductPrice(item.product)
    const unitPrice = matched ? matched.price : null
    const subtotal = (unitPrice && item.quantity) ? unitPrice * item.quantity : null
    return { ...item, matchedName: matched?.name || item.product, unitPrice, subtotal }
  })

  const totalEstimate = itemsWithPrice.reduce((sum, item) => sum + (item.subtotal || 0), 0)

  return (
    <div className="buyer-order-card">
      <div className="buyer-order-heading">
        <span><ShoppingBag size={16} /> Order assistant</span>
        <span className={result.needs_clarification ? 'review' : 'ready'}>
          {result.needs_clarification ? 'Needs clarification' : actionLabels[result.action] || 'Ready to review'}
        </span>
      </div>

      {result.transcript && (
        <div className="buyer-transcript">
          <small>VOICE TRANSCRIPT</small>
          <p>{result.transcript}</p>
          {result.language_code && <span>Detected language: {result.language_code}</span>}
        </div>
      )}

      {itemsWithPrice.length > 0 && (
        <div className="buyer-order-items">
          {itemsWithPrice.map((item, index) => (
            <div key={`${item.product}-${index}`}>
              <div>
                <strong>{item.matchedName}</strong>
                {item.unitPrice && <small style={{ display: 'block', color: '#88988d' }}>₹{item.unitPrice} per {item.unit || 'unit'}</small>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span>{item.quantity ?? '—'} {item.unit || ''}</span>
                {item.subtotal && <strong style={{ display: 'block', color: '#0c8756' }}>₹{item.subtotal}</strong>}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.changes?.length > 0 && (
        <div className="buyer-order-items">
          {result.changes.map((change, index) => (
            <div key={`${change.product}-${index}`}>
              <strong>{change.operation}: {change.product}</strong>
              <span>{change.quantity ?? ''} {change.unit || ''}</span>
            </div>
          ))}
        </div>
      )}

      {totalEstimate > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderTop: '1px dashed #dbe6df', fontWeight: '750', fontSize: '0.8rem', color: '#1a2a20' }}>
          <span>Estimated Total</span>
          <span style={{ color: '#0c8756' }}>₹{totalEstimate}</span>
        </div>
      )}

      {result.clarification_question && (
        <p className="buyer-clarification">{result.clarification_question}</p>
      )}

      {!result.needs_clarification && !confirmed && (
        <div className="buyer-confirm-actions">
          <button className="buyer-confirm-btn" onClick={() => onConfirm(result, itemsWithPrice, totalEstimate)}>
            <Check size={16} /> Confirm & Place Order
          </button>
        </div>
      )}

      {confirmed && (
        <div style={{ padding: '8px 12px', background: '#eafaf0', color: '#0c8756', fontSize: '0.72rem', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle2 size={16} /> Order has been confirmed and placed!
        </div>
      )}

      {!result.needs_clarification && !confirmed && (
        <p className="buyer-order-note">
          Review items above. Tap <strong>Confirm & Place Order</strong> to notify the shopkeeper.
        </p>
      )}
    </div>
  )
}

function ConfirmedOrderReceipt({ order }) {
  return (
    <div className="buyer-confirmed-card">
      <div className="buyer-confirmed-header">
        <CheckCircle2 size={18} /> Order Placed Successfully!
      </div>
      <div className="buyer-confirmed-id">
        Order ID: <strong>{order.id}</strong> · {order.time}
      </div>
      <div className="buyer-confirmed-items">
        {order.items.map((item, index) => (
          <div key={index}>
            <span>{item.quantity} {item.unit || ''} × {item.name || item.product}</span>
            <span>{item.subtotal ? `₹${item.subtotal}` : '—'}</span>
          </div>
        ))}
      </div>
      <div className="buyer-confirmed-total">
        <span>Total Bill</span>
        <span>{order.total ? `₹${order.total}` : 'Pending shop pricing'}</span>
      </div>
      <div className="buyer-confirmed-footer">
        Shopkeeper notified · Order is pending packing
      </div>
    </div>
  )
}

export function BuyerChat({ buyer, onSignOut }) {
  const [shops, setShops] = useState([])
  const [shopsLoading, setShopsLoading] = useState(true)
  const [activeShop, setActiveShop] = useState(null)
  const [messages, setMessages] = useState([])
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [showCatalog, setShowCatalog] = useState(false)
  const [recordingSupported, setRecordingSupported] = useState(true)
  const [confirmedOrders, setConfirmedOrders] = useState({})

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const orderDraftRef = useRef(null)

  useEffect(() => {
    let active = true
    async function loadShops() {
      setShopsLoading(true)
      let registered = []
      if (supabase) {
        try {
          const { data, error: queryError } = await supabase.from('shops').select('id,name').order('name')
          if (!active) return
          if (!queryError && data) registered = data
        } catch {
          // Supabase not reachable, continue with demo shop
        }
      }
      if (!active) return
      setShops([DEMO_SHOP, ...registered])
      setShopsLoading(false)
    }
    void loadShops()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!activeShop) return
    orderDraftRef.current = null
    const welcome = activeShop.demo
      ? `Namaste ${buyer.name}! Welcome to the DukanSetu Demo Store. 🎙️ Tap the microphone button below to order groceries using your voice in Hindi, English, Kannada, or Hinglish.`
      : `Namaste ${buyer.name}! Send a voice note with what you need from ${activeShop.name}. I can understand Hindi, Kannada, English, and mixed-language requests.`

    setMessages([
      { id: Date.now(), from: 'ai', text: welcome, time: clock() }
    ])
  }, [activeShop, buyer.name])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, processing])

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  async function processAudio(blob, audioUrl) {
    const messageId = Date.now()
    setMessages(current => [...current, { id: messageId, from: 'buyer', type: 'audio', audioUrl, time: clock() }])
    setProcessing(true)
    setError('')
    try {
      const body = new FormData()
      const extension = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      body.append('audio', blob, `voice-note.${extension}`)
      if (orderDraftRef.current) body.append('existing_order', JSON.stringify(orderDraftRef.current))

      const response = await fetch(`${apiBase}/v1/voice/orders/process`, { method: 'POST', body })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error?.message || `Voice processing failed (${response.status}).`)
      const result = payload?.data
      if (!result || typeof result.action !== 'string') throw new Error('The voice service returned an invalid response.')

      const langTitle = langNames[result.language_code] || result.language_code || 'regional language'

      // Case 1: Regional Voice Confirmation (e.g. "haan theek hai confirm kardo" / "haudu confirm maadi")
      if (result.action === 'confirm_order') {
        const existing = orderDraftRef.current
        if (existing && existing.items?.length > 0) {
          const itemsWithPrice = (existing.items || []).map(item => {
            const matched = matchProductPrice(item.product)
            const unitPrice = matched ? matched.price : 50
            const subtotal = unitPrice * (item.quantity || 1)
            return { ...item, matchedName: matched?.name || item.product, unitPrice, subtotal }
          })
          const totalEstimate = itemsWithPrice.reduce((sum, item) => sum + (item.subtotal || 0), 0)

          setMessages(current => [
            ...current,
            {
              id: Date.now(),
              from: 'ai',
              text: `🎙️ Voice confirmation recognized in ${langTitle}: "${result.transcript}". Confirming your order now!`,
              time: clock(),
            }
          ])

          handleConfirmOrder(result, itemsWithPrice, totalEstimate)
          return
        }
      }

      // Case 2: Regional Voice Rejection (e.g. "nahi cancel kardo" / "beda cancel maadi")
      if (result.action === 'reject_order') {
        orderDraftRef.current = null
        setMessages(current => [
          ...current,
          {
            id: Date.now(),
            from: 'ai',
            text: `❌ Order cancelled by voice in ${langTitle} ("${result.transcript}"). You can start a new order anytime.`,
            time: clock(),
          }
        ])
        return
      }

      // Case 3: Regional Voice Modification (e.g. "chawal 3 kilo kardo")
      if (result.action === 'modify_order' && orderDraftRef.current) {
        let updatedItems = [...(orderDraftRef.current.items || [])]
        for (const change of (result.changes || [])) {
          if (change.operation === 'remove') {
            updatedItems = updatedItems.filter(i => !i.product.toLowerCase().includes(change.product.toLowerCase()))
          } else if (change.operation === 'add') {
            updatedItems.push({ product: change.product, quantity: change.quantity, unit: change.unit })
          } else if (change.operation === 'update') {
            const idx = updatedItems.findIndex(i => i.product.toLowerCase().includes(change.product.toLowerCase()))
            if (idx >= 0) {
              updatedItems[idx] = { ...updatedItems[idx], quantity: change.quantity, unit: change.unit || updatedItems[idx].unit }
            } else {
              updatedItems.push({ product: change.product, quantity: change.quantity, unit: change.unit })
            }
          }
        }
        result.items = updatedItems
      }

      orderDraftRef.current = result
      setMessages(current => [...current, { id: Date.now(), from: 'ai', type: 'result', result, time: clock() }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not process that voice note. Please try again.')
      setMessages(current => [
        ...current,
        {
          id: Date.now(),
          from: 'ai',
          text: 'I could not connect to the Sarvam AI voice engine. Make sure the backend server is running with SARVAM_API_KEY.',
          time: clock(),
        }
      ])
    } finally {
      setProcessing(false)
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecordingSupported(false)
      setError('Audio recording is not supported here. Try Chrome or Edge on localhost/HTTPS.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        if (blob.size) void processAudio(blob, URL.createObjectURL(blob))
      }
      recorder.start()
      setSeconds(0)
      setRecording(true)
      setError('')
      let elapsed = 0
      timerRef.current = setInterval(() => {
        elapsed += 1
        setSeconds(elapsed)
        if (elapsed >= 30) {
          clearInterval(timerRef.current)
          timerRef.current = null
          setRecording(false)
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
        }
      }, 1000)
    } catch {
      setError('Microphone permission was denied. Allow microphone access in your browser and try again.')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRecording(false)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  // Simulated sample order for quick testing without microphone
  function triggerSampleVoiceOrder(textSample, detectedLang = 'hi-IN') {
    const messageId = Date.now()
    setProcessing(true)
    setError('')

    // Show simulated voice note
    setMessages(current => [
      ...current,
      {
        id: messageId,
        from: 'buyer',
        type: 'sample_voice',
        text: `🎙️ "${textSample}"`,
        time: clock(),
      }
    ])

    setTimeout(() => {
      const lower = textSample.toLowerCase()
      const isConfirmation = lower.includes('confirm') || lower.includes('theek hai') || lower.includes('haudu') || lower.includes('bhej do')
      const isRejection = lower.includes('cancel') || lower.includes('nahi') || lower.includes('beda')

      if (isConfirmation && orderDraftRef.current?.items?.length > 0) {
        const existing = orderDraftRef.current
        const itemsWithPrice = (existing.items || []).map(item => {
          const matched = matchProductPrice(item.product)
          const unitPrice = matched ? matched.price : 50
          const subtotal = unitPrice * (item.quantity || 1)
          return { ...item, matchedName: matched?.name || item.product, unitPrice, subtotal }
        })
        const totalEstimate = itemsWithPrice.reduce((sum, item) => sum + (item.subtotal || 0), 0)
        const langTitle = langNames[detectedLang] || 'regional language'

        setMessages(current => [
          ...current,
          {
            id: Date.now(),
            from: 'ai',
            text: `🎙️ Voice confirmation recognized in ${langTitle}: "${textSample}". Your order is placed!`,
            time: clock(),
          }
        ])
        handleConfirmOrder({ action: 'confirm_order', transcript: textSample, language_code: detectedLang }, itemsWithPrice, totalEstimate)
        setProcessing(false)
        return
      }

      if (isRejection) {
        orderDraftRef.current = null
        setMessages(current => [
          ...current,
          {
            id: Date.now(),
            from: 'ai',
            text: `❌ Order cancelled by voice ("${textSample}"). You can start a new order anytime.`,
            time: clock(),
          }
        ])
        setProcessing(false)
        return
      }

      // Parse sample text to extract items
      let items = []
      if (lower.includes('chawal') || lower.includes('rice')) {
        items.push({ product: 'Basmati Rice', quantity: 2, unit: 'kg' })
      }
      if (lower.includes('doodh') || lower.includes('milk')) {
        items.push({ product: 'Amul Taaza Milk', quantity: 1, unit: 'L' })
      }
      if (lower.includes('sugar') || lower.includes('cheeni')) {
        items.push({ product: 'White Sugar', quantity: 1, unit: 'kg' })
      }
      if (lower.includes('tea') || lower.includes('chai')) {
        items.push({ product: 'Assam Tea', quantity: 2, unit: 'pack' })
      }
      if (lower.includes('atta') || lower.includes('wheat')) {
        items.push({ product: 'Whole Wheat Atta', quantity: 5, unit: 'kg' })
      }
      if (!items.length) {
        items = [
          { product: 'Basmati Rice', quantity: 2, unit: 'kg' },
          { product: 'Amul Taaza Milk', quantity: 1, unit: 'L' }
        ]
      }

      const sampleResult = {
        action: 'new_order',
        transcript: textSample,
        language_code: detectedLang,
        items,
        changes: [],
        needs_clarification: false,
        clarification_question: null,
      }

      orderDraftRef.current = sampleResult
      setMessages(current => [
        ...current,
        {
          id: Date.now(),
          from: 'ai',
          type: 'result',
          result: sampleResult,
          time: clock(),
        }
      ])
      setProcessing(false)
    }, 700)
  }

  function handleConfirmOrder(result, itemsWithPrice, totalEstimate) {
    const orderId = 'DS-' + Math.floor(1000 + Math.random() * 9000)
    const confirmedTime = clock()

    setConfirmedOrders(prev => ({ ...prev, [result.transcript || 'current']: true }))

    const confirmedOrderData = {
      id: orderId,
      time: confirmedTime,
      items: itemsWithPrice.map(i => ({
        name: i.matchedName || i.product,
        quantity: i.quantity,
        unit: i.unit,
        subtotal: i.subtotal,
      })),
      total: totalEstimate,
    }

    // Persist to localStorage demo store so shopkeeper sees it!
    try {
      const storageKey = 'dukansetu-dashboard-demo-v1'
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const state = JSON.parse(raw)
        const newDemoOrder = {
          id: orderId,
          customer: {
            id: 'C-BUYER-' + Date.now().toString().slice(-4),
            name: buyer.name || 'Rahul Sharma',
            language: result.language_code || 'Hindi',
            phone: buyer.phone || '98765 43210',
          },
          createdAt: new Date().toISOString(),
          status: 'pending',
          items: itemsWithPrice.map(i => ({
            productId: i.product?.toLowerCase() || 'item',
            name: i.matchedName || i.product,
            quantity: i.quantity || 1,
            unit: i.unit || 'unit',
            unitPrice: i.unitPrice || 50,
          })),
          total: totalEstimate || 150,
          confirmation: { status: 'confirmed', updatedAt: new Date().toISOString() },
          issues: [],
          statusHistory: [{ status: 'pending', at: new Date().toISOString() }],
        }
        state.orders = [newDemoOrder, ...(state.orders || [])]
        state.notifications = [
          {
            id: 'notice-' + Date.now(),
            type: 'new_order',
            orderId: orderId,
            message: `${buyer.name || 'Buyer'} placed a voice order.`,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...(state.notifications || []),
        ]
        localStorage.setItem(storageKey, JSON.stringify(state))
      }
    } catch {
      // Local storage write ignored
    }

    setMessages(current => [
      ...current,
      {
        id: Date.now(),
        from: 'ai',
        type: 'confirmed',
        order: confirmedOrderData,
        time: confirmedTime,
      }
    ])
  }

  function sendText(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || processing) return
    setDraft('')

    // If text looks like an order, process it via sample parsing
    triggerSampleVoiceOrder(text, 'en-IN')
  }

  if (!activeShop) {
    return (
      <main className="buyer-chat-page">
        <section className="buyer-chat-shell buyer-shop-selector">
          <header className="buyer-chat-header">
            <button className="buyer-back" onClick={onSignOut} aria-label="Sign out">
              <ArrowLeft size={19} />
            </button>
            <div className="buyer-store-avatar">
              <Store size={20} />
            </div>
            <div className="buyer-store-title">
              <strong>DukanSetu</strong>
              <span>Signed in as {buyer.name || 'Buyer'}{buyer.phone ? ` (${buyer.phone})` : ''}</span>
            </div>
            <button className="buyer-signout" onClick={onSignOut}>Sign out</button>
          </header>

          <section className="buyer-shop-list">
            <div className="buyer-shop-list-intro">
              <p className="login-eyebrow">BUYER CONSOLE</p>
              <h1>Choose a local shop</h1>
              <p>Select the Demo Store to test voice ordering, or choose a registered shop in your area.</p>
            </div>

            {shopsLoading && (
              <p className="buyer-shop-state">
                <LoaderCircle size={17} /> Loading shops…
              </p>
            )}

            <div className="buyer-shop-options">
              {shops.map(shop => (
                <button
                  key={shop.id}
                  className={`buyer-shop-option ${shop.demo ? 'demo-option' : ''}`}
                  onClick={() => setActiveShop(shop)}
                >
                  <span className="buyer-store-avatar">
                    <Store size={20} />
                  </span>
                  <span>
                    <strong>{shop.name}</strong>
                    <small>
                      {shop.demo ? (
                        <span className="buyer-demo-tag">⭐ Demo Store · Voice Ordering Ready</span>
                      ) : (
                        'Registered DukanSetu shop'
                      )}
                    </small>
                  </span>
                  <ArrowLeft className="buyer-shop-arrow" size={17} />
                </button>
              ))}
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="buyer-chat-page">
      <section className="buyer-chat-shell">
        <header className="buyer-chat-header">
          <button className="buyer-back" onClick={() => setActiveShop(null)} aria-label="Back to shops">
            <ArrowLeft size={19} />
          </button>
          <div className="buyer-store-avatar">
            <Store size={20} />
          </div>
          <div className="buyer-store-title">
            <strong>{activeShop.name}</strong>
            <span>{activeShop.demo ? '⭐ Demo Store · Voice Ordering' : 'DukanSetu order assistant'}</span>
          </div>
          <span className="buyer-ai-pill">
            <Sparkles size={14} /> Sarvam AI
          </span>
          <button className="buyer-signout" onClick={onSignOut}>Sign out</button>
        </header>

        <section className="buyer-chat-messages" aria-live="polite">
          <div className="buyer-day-pill">TODAY</div>

          {activeShop.demo && (
            <div className="buyer-catalog-bar">
              <div className="buyer-catalog-title">
                <Package size={16} color="#0c8756" />
                <span>Demo Kirana Store Catalog (8 items)</span>
              </div>
              <button
                className="buyer-catalog-btn"
                onClick={() => setShowCatalog(!showCatalog)}
              >
                {showCatalog ? 'Hide items' : 'View products'} {showCatalog ? <ChevronUp size={13} style={{ display: 'inline' }} /> : <ChevronDown size={13} style={{ display: 'inline' }} />}
              </button>
            </div>
          )}

          {showCatalog && (
            <div className="buyer-catalog-grid" style={{ marginBottom: '14px' }}>
              {DEMO_CATALOG.map(item => (
                <div key={item.id} className="buyer-catalog-item">
                  <strong>{item.name}</strong>
                  <span>₹{item.price} / {item.unit}</span>
                </div>
              ))}
            </div>
          )}

          {activeShop.demo && (
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '0.68rem', color: '#68776e', marginBottom: '6px', fontWeight: 600 }}>
                💡 Quick voice prompts to try (or click to test):
              </p>
              <div className="buyer-prompts-bar">
                <button
                  className="buyer-prompt-chip highlight"
                  onClick={() => triggerSampleVoiceOrder('2 kilo chawal aur ek litre doodh', 'hi-IN')}
                >
                  <Zap size={11} style={{ display: 'inline', marginRight: '3px' }} /> "2 kilo chawal aur 1 litre doodh" (Hindi Order)
                </button>
                <button
                  className="buyer-prompt-chip"
                  onClick={() => triggerSampleVoiceOrder('1 kg sugar and 2 packets of Assam tea', 'en-IN')}
                >
                  "1 kg sugar and 2 packs tea" (English Order)
                </button>
                <button
                  className="buyer-prompt-chip highlight"
                  style={{ borderColor: '#2e9f65', background: '#effbf3', color: '#0c8756' }}
                  onClick={() => triggerSampleVoiceOrder('Haan theek hai, order confirm kar do', 'hi-IN')}
                >
                  🎙️ "Haan theek hai, confirm kardo" (Hindi Voice Confirmation)
                </button>
                <button
                  className="buyer-prompt-chip highlight"
                  style={{ borderColor: '#2e9f65', background: '#effbf3', color: '#0c8756' }}
                  onClick={() => triggerSampleVoiceOrder('Haudu, order confirm maadi', 'kn-IN')}
                >
                  🎙️ "Haudu, order confirm maadi" (Kannada Voice Confirmation)
                </button>
              </div>
            </div>
          )}

          <div className="buyer-encryption-note">
            Your voice note is transcribed and converted into a structured order draft using Sarvam AI.
          </div>

          {messages.map(message => (
            <div key={message.id} className={`buyer-message-row ${message.from === 'buyer' ? 'outgoing' : ''}`}>
              <div className={`buyer-message ${message.from === 'buyer' ? 'buyer-message-outgoing' : 'buyer-message-incoming'}`}>
                {message.type === 'audio' && (
                  <div className="buyer-audio-message">
                    <AudioLines size={18} />
                    <audio controls src={message.audioUrl} />
                    <span>Voice note</span>
                  </div>
                )}
                {message.type === 'sample_voice' && (
                  <p style={{ fontStyle: 'italic', color: '#144c2f', fontWeight: 550 }}>
                    {message.text}
                  </p>
                )}
                {message.type === 'text' && <p>{message.text}</p>}
                {message.type === 'result' && (
                  <OrderDraft
                    result={message.result}
                    onConfirm={handleConfirmOrder}
                    confirmed={Boolean(confirmedOrders[message.result.transcript || 'current'])}
                  />
                )}
                {message.type === 'confirmed' && (
                  <ConfirmedOrderReceipt order={message.order} />
                )}
                {message.type === 'ai' && (
                  <>
                    <div className="buyer-ai-label">
                      <Sparkles size={12} /> DukanSetu assistant
                    </div>
                    <p>{message.text}</p>
                  </>
                )}
                <div className="buyer-message-time">
                  {message.time}
                  {message.from === 'buyer' && <Check size={12} />}
                </div>
              </div>
            </div>
          ))}

          {processing && (
            <div className="buyer-message-row">
              <div className="buyer-message buyer-message-incoming">
                <div className="buyer-ai-label">
                  <Sparkles size={12} /> DukanSetu assistant
                </div>
                <p className="buyer-processing">
                  <LoaderCircle size={15} /> Listening with Sarvam AI & preparing your order…
                </p>
              </div>
            </div>
          )}

          {error && <p className="buyer-chat-error" role="alert">{error}</p>}
          <div ref={messagesEndRef} />
        </section>

        <footer className="buyer-chat-compose">
          {recording && (
            <div className="buyer-recording-status">
              <span /> Recording · 0:{String(seconds).padStart(2, '0')} / 0:30
            </div>
          )}

          <form className="buyer-compose-row" onSubmit={sendText}>
            <input
              aria-label="Type or message your shop"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Speak via mic or type grocery order (e.g. 2 kg rice)..."
              disabled={processing}
            />
            {draft.trim() ? (
              <button className="buyer-send-button" type="submit" disabled={processing} aria-label="Send order">
                <Send size={19} />
              </button>
            ) : (
              <button
                className={`buyer-mic-button ${recording ? 'recording' : ''}`}
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={processing || !recordingSupported}
                aria-label={recording ? 'Stop and send voice note' : 'Record a voice note'}
                title={recording ? 'Click to stop and send' : 'Click to record voice order'}
              >
                {recording ? <Check size={20} /> : <Mic size={20} />}
              </button>
            )}
          </form>
          <p className="buyer-compose-hint">
            {recording ? '🔴 Recording... Tap checkmark to stop & process' : '🎙️ Tap microphone to order by voice · Or click any prompt above'}
          </p>
        </footer>
      </section>
    </main>
  )
}
