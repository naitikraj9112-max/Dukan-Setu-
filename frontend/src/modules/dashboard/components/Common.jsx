import { useEffect, useRef } from 'react'
import { AlertCircle, Inbox, X } from 'lucide-react'
import { initials, STATUS_LABELS } from '../utils/orders'

export function Badge({ status, children }) {
  return <span className={'badge badge-' + status}><span />{children ?? STATUS_LABELS[status] ?? status}</span>
}

export function Avatar({ name }) {
  const tone = (name?.charCodeAt(0) ?? 0) % 5
  return <span className={'avatar avatar-' + tone} aria-hidden="true">{initials(name)}</span>
}

export function Empty({ title, children }) {
  return <div className="empty"><Inbox size={26} /><strong>{title}</strong>{children && <p>{children}</p>}</div>
}

export function ResourceState({ resource, loading = 'Loading…' }) {
  return <>
    {resource.error && <div className="inline-error" role="alert"><AlertCircle size={17} /><span>{resource.error.message}</span><button className="button compact" onClick={resource.refresh}>Retry</button></div>}
    {resource.data === undefined && !resource.error && <p className="loading" role="status">{loading}</p>}
  </>
}

export function Drawer({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="drawer" aria-label={title}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="drawer-inner">
      <header className="drawer-header"><h2>{title}</h2><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={21} /></button></header>
      {children}
    </div>
  </dialog>
}
