import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SYNC_SECRET_KEY = Deno.env.get('SYNC_SECRET_KEY')
const API_URL = Deno.env.get('API_URL')

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Verify this is a cron job invocation
    const authorization = req.headers.get('Authorization')
    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Call the sync endpoint
    const response = await fetch(`${API_URL}/api/spotify/playlist/sync`, {
      method: 'POST',
      headers: {
        'X-Sync-Key': SYNC_SECRET_KEY || '',
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()
    
    return new Response(
      JSON.stringify(data),
      { status: response.status, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error syncing playlists:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}) 
