"""Public Discogs lookup routes (barcode, release id, URL, artist/album).

These are unauthenticated and therefore rate-limited per IP; authenticated
requests are exempted so bulk/batch imports are never throttled.
"""

from flask import Blueprint, jsonify, request

from barcode_scanner.extensions import limiter, is_authenticated_request
from discogs_lookup import (
    search_by_barcode,
    search_by_discogs_id,
    search_by_discogs_url,
    search_by_artist_album,
)

bp = Blueprint('lookup', __name__)


@bp.route('/lookup/<barcode>')
@limiter.limit("30 per minute", exempt_when=is_authenticated_request)
def lookup(barcode):
    try:
        result = search_by_barcode(barcode)

        if result:
            response_data = {
                'success': True,
                'title': f"{result.get('artist')} - {result.get('album')}" if result.get('artist') and result.get('album') else result.get('title'),
                'year': result.get('year'),
                'format': ', '.join(result.get('format', [])),
                'label': result.get('label'),
                'web_url': result.get('uri'),
                'master_url': result.get('master_url'),
                'genres': result.get('genres'),
                'styles': result.get('styles'),
                'is_master': result.get('is_master', False),
                'release_year': result.get('release_year'),
                'release_url': result.get('release_url'),
                'musicians': result.get('musicians'),
                'added_from': result.get('added_from', 'barcode')
            }
            return jsonify(response_data)
        else:
            return jsonify({
                'success': False,
                'message': 'No results found'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@bp.route('/api/lookup/barcode/<barcode>')
@limiter.limit("30 per minute", exempt_when=is_authenticated_request)
def lookup_barcode(barcode):
    try:
        # Handle UPC to EAN conversion
        search_barcodes = [barcode]
        if len(barcode) == 12:
            # If it's a 12-digit UPC, also try with a leading zero
            search_barcodes.append('0' + barcode)
        elif len(barcode) == 13 and barcode.startswith('0'):
            # If it's a 13-digit EAN starting with 0, also try without it
            search_barcodes.append(barcode[1:])

        # Try each barcode format
        for search_barcode in search_barcodes:
            result = search_by_barcode(search_barcode)

            if result:
                # Found a match, process it
                record = {
                    'artist': result.get('artist', 'Unknown Artist'),
                    'album': result.get('album'),
                    'year': result.get('year'),
                    'current_release_year': result.get('current_release_year') if result.get('added_from') == 'barcode' else None,
                    'barcode': barcode,
                    'genres': result.get('genres', []),
                    'styles': result.get('styles', []),
                    'musicians': result.get('musicians', []),
                    'tracklist': result.get('tracklist', []),
                    'master_url': result.get('master_url'),
                    'master_id': result.get('master_id'),
                    'master_format': result.get('master_format'),
                    'original_release_url': result.get('original_release_url'),
                    'original_release_id': result.get('original_release_id'),
                    'original_catno': result.get('original_catno'),
                    'original_release_date': result.get('original_release_date'),
                    'original_identifiers': result.get('original_identifiers', []),
                    'current_release_url': result.get('current_release_url') if result.get('added_from') == 'barcode' else None,
                    'current_release_id': result.get('current_release_id') if result.get('added_from') == 'barcode' else None,
                    'current_release_format': result.get('current_release_format') if result.get('added_from') == 'barcode' else None,
                    'current_label': result.get('current_label'),
                    'current_catno': result.get('current_catno') if result.get('added_from') == 'barcode' else None,
                    'current_country': result.get('current_country'),
                    'current_release_date': result.get('current_release_date') if result.get('added_from') == 'barcode' else None,
                    'current_identifiers': result.get('current_identifiers', []) if result.get('added_from') == 'barcode' else [],
                    'label': result.get('label'),
                    'country': result.get('country'),
                    'added_from': result.get('added_from', 'barcode')
                }
                return jsonify({
                    'success': True,
                    'data': record
                })

        # No match found
        return jsonify({
            'success': False,
            'error': 'No record found for this barcode'
        }), 404

    except Exception as e:
        print(f"Error looking up barcode: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to lookup barcode'
        }), 500


@bp.route('/api/lookup/discogs/<release_id>')
@limiter.limit("30 per minute", exempt_when=is_authenticated_request)
def lookup_discogs(release_id):
    """Look up a release by Discogs release ID."""
    try:
        result = search_by_discogs_id(release_id)

        if not result:
            return jsonify({
                'success': False,
                'message': 'No results found'
            })

        return jsonify(result)  # result already contains success and data fields with added_from

    except Exception as e:
        print(f"Error looking up Discogs release: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@bp.route('/api/lookup/discogs-url')
@limiter.limit("30 per minute", exempt_when=is_authenticated_request)
def lookup_discogs_url():
    """Look up a release by Discogs URL."""
    try:
        url = request.args.get('url')
        if not url:
            return jsonify({
                'success': False,
                'message': 'No URL provided'
            })

        result = search_by_discogs_url(url)
        if result and result.get('success'):
            return jsonify(result)
        else:
            return jsonify({
                'success': False,
                'message': 'No results found'
            })

    except Exception as e:
        print(f"Error looking up Discogs URL: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@bp.route('/api/lookup/artist-album')
@limiter.limit("30 per minute", exempt_when=is_authenticated_request)
def lookup_artist_album():
    """Look up a release by artist and album name."""
    try:
        artist = request.args.get('artist')
        album = request.args.get('album')

        if not artist or not album:
            return jsonify({
                'success': False,
                'error': 'Artist and album names are required'
            })

        result = search_by_artist_album(artist, album, source='discogs_url')
        if result and result.get('success'):
            # Ensure current_release fields are null for artist-album lookup
            if result.get('data'):
                result['data']['current_release_url'] = None
                result['data']['current_release_year'] = None
            return jsonify(result)
        else:
            # If no match was found, return a basic structure for manual entry
            return jsonify({
                'success': True,
                'data': {
                    'artist': artist,
                    'album': album,
                    'added_from': 'manual',
                    'genres': [],
                    'styles': [],
                    'musicians': [],
                    'current_release_url': None,
                    'current_release_year': None
                }
            })

    except Exception as e:
        print(f"Error looking up by artist/album: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
