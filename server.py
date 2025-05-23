# Add this route to help debug the sync loop issue
@app.route('/api/debug/last_sync', methods=['GET'])
def debug_last_sync():
    """Debug endpoint to track auto-sync calls"""
    try:
        # Get debug info from flask.session 
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'Not authenticated'
            }), 401
            
        # Get sync info from database
        client = get_supabase_client()
        
        # Log this request for debugging
        print(f"\n=== DEBUG: Sync info request from user {user_id} ===")
        print(f"Session data: {dict(session)}")
        print(f"Headers: {dict(request.headers)}")
        print(f"Cookies: {dict(request.cookies)}")
        
        # Return debug info
        return jsonify({
            'success': True,
            'data': {
                'user_id': user_id,
                'session_id': session.sid if hasattr(session, 'sid') else None,
                'request_time': datetime.datetime.now().isoformat(),
                'session_data': {k: v for k, v in dict(session).items() if k not in ['_permanent', '_id']}
            }
        })
        
    except Exception as e:
        print(f"Error in debug endpoint: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error: {str(e)}'
        }), 500

# Modify the auto-sync endpoint to add more debugging info
@app.route('/api/spotify/auto_sync_playlists', methods=['GET'])
def auto_sync_playlists():
    """API endpoint to automatically sync Spotify playlists"""
    try:
        print("\n=== Auto Sync Playlists API Call ===")
        print(f"Request time: {datetime.datetime.now().isoformat()}")
        print(f"Request headers: {dict(request.headers)}")
        
        # Check if user is authenticated
        user_id = session.get('user_id')
        if not user_id:
            print("No user_id in session")
            return jsonify({
                'success': False,
                'error': 'Not authenticated'
            }), 401
            
        print(f"Auto-sync request from user {user_id}")
        
        # Get the currently subscribed playlist
        result = get_subscribed_playlist()
        
        if not result['success'] or not result['data']:
            print("No subscribed playlist found")
            return jsonify({
                'success': True,
                'message': 'No subscribed playlist found',
                'data': {
                    'total_added': 0,
                    'added_albums': []
                }
            })
            
        # Sync the playlist
        sync_result = sync_subscribed_playlists(is_automated=True)
        print(f"Sync result: {sync_result}")
        
        return jsonify(sync_result)
    except Exception as e:
        print(f"Error in auto_sync_playlists: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Error: {str(e)}'
        }), 500 
