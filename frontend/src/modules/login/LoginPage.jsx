import { useState } from 'react'
import { ArrowRight, Headphones, Mic, Store } from 'lucide-react'
import './login.css'

export function LoginPage({ onLogin }) {
  const [role, setRole] = useState('buyer')
  const [shopMode, setShopMode] = useState('demo')
  const [error, setError] = useState('')

  function selectRole(value) {
    setRole(value)
    setError('')
  }

  function submit(event) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)

    if (role === 'buyer') {
      const name = String(form.get('name') || '').trim()
      const phone = String(form.get('phone') || '').trim()
      if (!name) {
        setError('Please enter your name to continue.')
        return
      }
      onLogin({
        role: 'buyer',
        mode: 'live',
        name,
        phone,
      })
      return
    }

    // Shopkeeper role
    const storeName = String(form.get('storeName') || '').trim()
    if (shopMode === 'demo') {
      onLogin({
        role: 'shopkeeper',
        mode: 'demo',
        storeName: storeName || 'Kirana Store',
      })
      return
    }

    // Shopkeeper live mode
    const shopId = String(form.get('shopId') || '').trim()
    const accessToken = String(form.get('accessToken') || '').trim()
    if (!shopId) {
      setError('Enter your registered shop ID (UUID).')
      return
    }
    onLogin({
      role: 'shopkeeper',
      mode: accessToken ? 'live' : 'demo',
      storeName: storeName || 'My Store',
      shopId,
      accessToken: accessToken || undefined,
    })
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">
            <Store size={23} />
          </span>
          <div>
            <strong>DukanSetu</strong>
            <span>Voice-first commerce for local shops</span>
          </div>
        </div>

        <div className="login-intro">
          <p className="login-eyebrow">WELCOME</p>
          <h1>How would you like to continue?</h1>
          <p>Choose the workspace that fits you.</p>
        </div>

        <div className="role-tabs" role="tablist" aria-label="Choose your role">
          <button
            type="button"
            className={role === 'buyer' ? 'selected' : ''}
            onClick={() => selectRole('buyer')}
            role="tab"
            aria-selected={role === 'buyer'}
          >
            <Headphones size={17} /> Buyer
          </button>
          <button
            type="button"
            className={role === 'shopkeeper' ? 'selected' : ''}
            onClick={() => selectRole('shopkeeper')}
            role="tab"
            aria-selected={role === 'shopkeeper'}
          >
            <Store size={17} /> Shopkeeper
          </button>
        </div>

        <form className="login-form" onSubmit={submit}>
          {role === 'buyer' && (
            <>
              <div className="login-panel-note">
                <Mic size={17} />
                <span>
                  Order groceries from local registered shops using voice notes in Hindi,
                  Kannada, or English.
                </span>
              </div>
              <label>
                Your name
                <input
                  name="name"
                  placeholder="e.g. Rahul Sharma"
                  autoComplete="name"
                  required
                />
              </label>
              <label>
                Phone number <span className="optional-label">(optional)</span>
                <input
                  name="phone"
                  type="tel"
                  placeholder="e.g. 98765 43210"
                  autoComplete="tel"
                />
              </label>
              <button className="login-submit" type="submit">
                Continue to local shops <ArrowRight size={18} />
              </button>
            </>
          )}

          {role === 'shopkeeper' && (
            <>
              <p className="login-label">Choose your workspace mode</p>
              <div className="mode-options">
                <button
                  type="button"
                  className={shopMode === 'demo' ? 'selected' : ''}
                  onClick={() => {
                    setShopMode('demo')
                    setError('')
                  }}
                >
                  <strong>Demo mode</strong>
                  <span>Open sample dashboard with instant mock data.</span>
                </button>
                <button
                  type="button"
                  className={shopMode === 'live' ? 'selected' : ''}
                  onClick={() => {
                    setShopMode('live')
                    setError('')
                  }}
                >
                  <strong>Live mode</strong>
                  <span>Connect your registered shop with its shop ID.</span>
                </button>
              </div>

              <label>
                Store name
                <input
                  name="storeName"
                  placeholder={shopMode === 'demo' ? 'Kirana Store' : 'Your registered store name'}
                />
              </label>

              {shopMode === 'live' && (
                <>
                  <label>
                    Shop ID
                    <input
                      name="shopId"
                      autoComplete="off"
                      placeholder="Registered shop UUID (e.g. from Supabase)"
                      required
                    />
                  </label>
                  <label>
                    Access Token <span className="optional-label">(Supabase JWT token)</span>
                    <input
                      name="accessToken"
                      type="password"
                      autoComplete="off"
                      placeholder="Paste Supabase JWT token"
                    />
                  </label>
                  <p style={{ fontSize: '0.72rem', color: '#66766c', margin: '4px 0 8px' }}>
                    💡 Tip: Switch to <strong>Demo mode</strong> above to test the shopkeeper console with full sample data and zero configuration.
                  </p>
                </>
              )}

              <button className="login-submit" type="submit">
                {shopMode === 'demo' ? 'Open demo dashboard' : 'Open live dashboard'}{' '}
                <ArrowRight size={18} />
              </button>
            </>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
        </form>
        <p className="login-footer">Local businesses, connected by voice.</p>
      </section>
    </main>
  )
}
