"""Vinyl record routes: list, add, delete, per-record custom values, and
standard-field updates."""

import json
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from barcode_scanner.auth_utils import require_auth
from barcode_scanner.db import (
    get_supabase_client,
    add_record_to_collection,
    remove_record_from_collection,
    get_contributors_for_records,
)

bp = Blueprint('records', __name__)


def _user_owns_record(client, record_id, user_id):
    """Return True if the given record belongs to the user.

    RLS already scopes vinyl_records to the authenticated user, but we check
    ownership explicitly at the Flask layer so record-scoped endpoints cannot be
    used to read or write rows tied to another user's record_id.
    """
    owned = client.table('vinyl_records').select('id').eq(
        'id', record_id
    ).eq('user_id', user_id).execute()
    return bool(owned.data)


@bp.route('/api/records', methods=['GET'])
@require_auth
def get_records():
    try:
        # Get authenticated client
        client = get_supabase_client()
        user_id = session['user_id']

        response = client.table('vinyl_records').select('*').eq(
            'user_id', user_id
        ).execute()

        if response.data:
            # Fetch contributors for all records
            record_ids = [record['id'] for record in response.data]
            contributors_by_record = get_contributors_for_records(user_id, record_ids)

            # Attach contributors to each record
            for record in response.data:
                record['contributors'] = contributors_by_record.get(record['id'], {})

            return jsonify({
                'success': True,
                'data': response.data
            })
        return jsonify({
            'success': False,
            'error': 'No records found'
        })
    except Exception as e:
        print(f"Error fetching records: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to fetch records'
        })


@bp.route('/api/records', methods=['POST'])
@require_auth
def add_record():
    try:
        data = request.get_json()
        user_id = session.get('user_id')

        # Use the centralized add_record_to_collection function which handles relational inserts
        result = add_record_to_collection(user_id, data)

        if result['success']:
            return jsonify({
                'success': True,
                'data': result['record']
            }), 201
        return jsonify({
            'success': False,
            'error': result.get('error', 'Failed to add record')
        }), 400
    except Exception as e:
        print(f"Error adding record: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/api/records/<record_id>', methods=['DELETE'])
@require_auth
def delete_record(record_id):
    """Delete a record from the user's collection."""
    user_id = session['user_id']

    result = remove_record_from_collection(user_id, record_id)
    if result['success']:
        return jsonify({'success': True}), 200
    return jsonify({'success': False, 'error': result['error']}), 400


@bp.route('/api/records/<record_id>/custom-values', methods=['GET'])
@require_auth
def get_custom_values(record_id):
    """Get all custom values for a record."""
    user_id = session['user_id']

    try:
        client = get_supabase_client()
        if not _user_owns_record(client, record_id, user_id):
            return jsonify({'success': False, 'error': 'Record not found'}), 404
        response = client.table('custom_column_values').select('*').eq('record_id', record_id).execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/records/<record_id>/custom-values', methods=['PUT'])
@require_auth
def update_custom_values(record_id):
    """Update custom values for a record."""
    user_id = session['user_id']

    try:
        values = request.get_json()
        if not isinstance(values, dict):
            return jsonify({'success': False, 'error': 'Invalid data format'}), 400

        client = get_supabase_client()
        if not _user_owns_record(client, record_id, user_id):
            return jsonify({'success': False, 'error': 'Record not found'}), 404

        # Get existing values
        existing = client.table('custom_column_values').select('*').eq('record_id', record_id).execute()
        existing_map = {v['column_id']: v for v in existing.data}

        results = []
        for column_id, value in values.items():
            if column_id in existing_map:
                # Update existing value
                response = client.table('custom_column_values').update({
                    'value': value,
                    'updated_at': datetime.utcnow().isoformat()
                }).eq('record_id', record_id).eq('column_id', column_id).execute()
            else:
                # Insert new value
                response = client.table('custom_column_values').insert({
                    'record_id': record_id,
                    'column_id': column_id,
                    'value': value,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }).execute()

            if response.data:
                results.extend(response.data)

        return jsonify({'success': True, 'data': results}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/records/<record_id>', methods=['PATCH'])
@require_auth
def update_record(record_id):
    """Update standard fields of a record."""
    user_id = session['user_id']

    try:
        updates = request.get_json()
        if not isinstance(updates, dict):
            return jsonify({'success': False, 'error': 'Invalid data format'}), 400

        client = get_supabase_client()

        # Define allowed fields to update (standard columns only)
        allowed_fields = {
            'artist', 'album', 'year', 'current_release_year', 'label', 'country',
            'master_format', 'current_release_format', 'genres', 'styles', 'musicians',
            'master_url', 'current_release_url',
            # New extended Discogs fields
            'master_id', 'tracklist', 'original_release_id', 'original_catno',
            'original_release_date', 'original_identifiers', 'current_release_id',
            'current_label', 'current_catno', 'current_country', 'current_release_date',
            'current_identifiers', 'original_release_url'
        }

        # Filter to only allowed fields
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

        if not filtered_updates:
            return jsonify({'success': False, 'error': 'No valid fields to update'}), 400

        # Special handling for JSONB fields - convert to JSON string
        jsonb_fields = ['tracklist', 'original_identifiers', 'current_identifiers']
        for field in jsonb_fields:
            if field in filtered_updates and filtered_updates[field] is not None:
                if isinstance(filtered_updates[field], (list, dict)):
                    filtered_updates[field] = json.dumps(filtered_updates[field])

        # Add updated_at timestamp
        filtered_updates['updated_at'] = datetime.utcnow().isoformat()

        # Update the record
        response = client.table('vinyl_records').update(filtered_updates).eq('id', record_id).eq('user_id', user_id).execute()

        if response.data:
            return jsonify({'success': True, 'data': response.data[0]}), 200
        else:
            return jsonify({'success': False, 'error': 'Record not found or update failed'}), 404

    except Exception as e:
        print(f"Error updating record: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
