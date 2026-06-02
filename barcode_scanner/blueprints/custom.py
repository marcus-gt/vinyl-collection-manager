"""Custom columns, per-user settings, and saved column filters."""

from datetime import datetime

from flask import Blueprint, jsonify, request, session

from barcode_scanner.auth_utils import require_auth
from barcode_scanner.db import get_supabase_client

bp = Blueprint('custom', __name__)


@bp.route('/api/custom-columns', methods=['GET'])
def get_custom_columns():
    """Get all custom columns for the current user."""
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401

    try:
        client = get_supabase_client()

        response = client.table('custom_columns').select('*').eq('user_id', user_id).execute()

        if not response.data and response.data != []:  # None/undefined, but allow empty list
            return jsonify({'success': False, 'error': 'Failed to get columns'}), 500

        # Convert response data to camelCase
        response_data = []
        for column in response.data:
            column_data = dict(column)
            column_data['defaultValue'] = column_data.pop('default_value', None)
            column_data['applyToAll'] = column_data.pop('apply_to_all', False)
            response_data.append(column_data)

        return jsonify({'success': True, 'data': response_data}), 200
    except Exception as e:
        print(f"Error getting custom columns: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/custom-columns', methods=['POST'])
def create_custom_column():
    """Create a new custom column."""
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401

    try:
        data = request.get_json()

        if not data or not data.get('name') or not data.get('type'):
            return jsonify({'success': False, 'error': 'Name and type are required'}), 400

        now = datetime.utcnow().isoformat()
        column_data = {
            'user_id': user_id,
            'name': data['name'],
            'type': data['type'],
            'options': data.get('options', []),
            'defaultValue': data.get('defaultValue'),
            'applyToAll': data.get('applyToAll', False),
            'created_at': now,
            'updated_at': now
        }

        # Convert to snake_case for database
        db_column_data = {
            'user_id': column_data['user_id'],
            'name': column_data['name'],
            'type': column_data['type'],
            'options': column_data['options'],
            'default_value': column_data['defaultValue'],
            'apply_to_all': column_data['applyToAll'],
            'created_at': column_data['created_at'],
            'updated_at': column_data['updated_at']
        }

        client = get_supabase_client()
        response = client.table('custom_columns').insert(db_column_data).execute()

        if not response.data:
            return jsonify({'success': False, 'error': 'Failed to create column'}), 500

        # Convert response data back to camelCase for frontend
        response_data = response.data[0]
        response_data['defaultValue'] = response_data.pop('default_value', None)
        response_data['applyToAll'] = response_data.pop('apply_to_all', False)

        # If apply_to_all is true and there's a default value, apply it to all records
        if db_column_data['apply_to_all'] and db_column_data['default_value'] is not None:
            try:
                records_response = client.table('vinyl_records').select('id').eq('user_id', user_id).execute()
                if records_response.data:
                    values_data = [{
                        'record_id': record['id'],
                        'column_id': response.data[0]['id'],
                        'value': db_column_data['default_value'],
                        'created_at': now,
                        'updated_at': now
                    } for record in records_response.data]

                    if values_data:
                        client.table('custom_column_values').insert(values_data).execute()
            except Exception as e:
                print(f"Warning: Failed to apply default values: {str(e)}")
                # Don't fail the request if applying defaults fails

        return jsonify({'success': True, 'data': response_data}), 201
    except Exception as e:
        print(f"\nError creating custom column: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/custom-columns/<column_id>', methods=['PUT'])
def update_custom_column(column_id):
    """Update a custom column."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401

    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        update_data = {
            'name': data.get('name'),
            'type': data.get('type'),
            'options': data.get('options'),
            'option_colors': data.get('option_colors'),
            'default_value': data.get('defaultValue'),
            'apply_to_all': data.get('applyToAll'),
            'updated_at': datetime.utcnow().isoformat()
        }
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}

        client = get_supabase_client()
        response = client.table('custom_columns').update(update_data).eq('id', column_id).eq('user_id', user_id).execute()

        if not response.data:
            return jsonify({'success': False, 'error': 'Column not found'}), 404

        # If apply_to_all is true and there's a default value, apply it to all records
        if update_data.get('apply_to_all') and update_data.get('default_value') is not None:
            try:
                records_response = client.table('vinyl_records').select('id').eq('user_id', user_id).execute()
                if records_response.data:
                    now = datetime.utcnow().isoformat()
                    for record in records_response.data:
                        client.table('custom_column_values').upsert({
                            'record_id': record['id'],
                            'column_id': column_id,
                            'value': update_data['default_value'],
                            'updated_at': now
                        }).execute()
            except Exception as e:
                print(f"Warning: Failed to apply default values: {str(e)}")
                # Don't fail the request if applying defaults fails

        return jsonify({'success': True, 'data': response.data[0]}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/custom-columns/<column_id>', methods=['DELETE'])
def delete_custom_column(column_id):
    """Delete a custom column."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401

    try:
        client = get_supabase_client()
        client.table('custom_columns').delete().eq('id', column_id).eq('user_id', user_id).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/settings', methods=['GET'])
def get_all_settings():
    """Get all settings for the current user."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401

    try:
        client = get_supabase_client()
        response = client.table('user_settings').select('*').eq('user_id', user_id).execute()
        return jsonify({'success': True, 'data': response.data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/settings/<setting_key>', methods=['GET'])
def get_setting(setting_key):
    """Get a specific setting for the current user."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401

    try:
        client = get_supabase_client()
        response = client.table('user_settings').select('*').eq('user_id', user_id).eq('setting_key', setting_key).execute()

        if not response.data:
            return jsonify({'success': False, 'error': 'Setting not found'}), 404

        return jsonify({'success': True, 'data': response.data[0]}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/settings', methods=['POST'])
def set_setting():
    """Create or update a setting for the current user."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401

    try:
        data = request.get_json()
        setting_key = data.get('setting_key')
        setting_value = data.get('setting_value')

        if not setting_key:
            return jsonify({'success': False, 'error': 'setting_key is required'}), 400

        client = get_supabase_client()

        # Use upsert to create or update
        response = client.table('user_settings').upsert({
            'user_id': user_id,
            'setting_key': setting_key,
            'setting_value': setting_value,
            'updated_at': datetime.utcnow().isoformat()
        }, on_conflict='user_id,setting_key').execute()

        return jsonify({'success': True, 'data': response.data[0]}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/column-filters', methods=['GET'])
@require_auth
def get_column_filters():
    """Get user's column filter preferences."""
    try:
        client = get_supabase_client()
        response = client.table('column_filters').select('*').eq(
            'user_id', session['user_id']
        ).execute()

        if response.data:
            # Convert to column_id: filter_value format
            filters = {
                item['column_id']: item['filter_value']
                for item in response.data
            }
            return jsonify({
                'success': True,
                'data': filters
            })
        return jsonify({
            'success': True,
            'data': {}
        })
    except Exception as e:
        print(f"Error fetching filters: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/api/column-filters', methods=['PUT'])
@require_auth
def update_column_filters():
    """Update user's column filter preferences."""
    try:
        filters = request.get_json()
        client = get_supabase_client()

        # Delete existing filters
        client.table('column_filters').delete().eq(
            'user_id', session['user_id']
        ).execute()

        # Insert new filters
        if filters:
            records = [
                {
                    'user_id': session['user_id'],
                    'column_id': col_id,
                    'filter_value': value
                }
                for col_id, value in filters.items()
                if value is not None  # Only store non-null filters
            ]
            if records:
                client.table('column_filters').insert(records).execute()

        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating filters: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
