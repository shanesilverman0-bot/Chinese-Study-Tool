import React from 'react'
import { DATA_MODE } from '../lib/dataMode.js'

// Always visible outside live mode (DESIGN §3.1).
export default function DataBanner({ gh }) {
  if (DATA_MODE === 'live') return null
  if (DATA_MODE === 'local') {
    return (
      <div className="bg-gray-500 py-1 text-center font-mono text-xs text-paper">
        LOCAL ONLY · not synced
      </div>
    )
  }
  return (
    <div className="bg-amber-500 py-1 text-center font-mono text-xs text-ink">
      DEV DATA · {gh.repo}/{gh.path}
    </div>
  )
}
