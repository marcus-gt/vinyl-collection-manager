"""Musician-network analysis endpoint.

The analysis loads the full collection and runs a pandas pipeline, so results
are cached per user with a short TTL; ?refresh=true forces a recompute.
"""

import time

from flask import Blueprint, jsonify, request, session

from barcode_scanner.auth_utils import require_auth
from barcode_scanner.db import get_supabase_client, get_contributors_for_records

bp = Blueprint('analytics', __name__)

# In-memory TTL cache keyed by user_id. Some staleness is acceptable for a
# personal app; clients pass ?refresh=true to force a recompute.
_MUSICIAN_NETWORK_CACHE = {}
_MUSICIAN_NETWORK_TTL_SECONDS = 300


@bp.route('/api/musician-network', methods=['GET'])
@require_auth
def get_musician_network():
    """Get musician network analysis data for the user's collection."""
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            'success': False,
            'error': 'User not authenticated'
        }), 401

    # Serve from cache unless a refresh is explicitly requested.
    force_refresh = request.args.get('refresh') == 'true'
    cached = _MUSICIAN_NETWORK_CACHE.get(user_id)
    if cached and not force_refresh:
        cached_at, cached_response = cached
        if (time.time() - cached_at) < _MUSICIAN_NETWORK_TTL_SECONDS:
            return jsonify(cached_response)

    try:
        # Import analysis modules
        try:
            from barcode_scanner.data_processor import (
                create_network_data,
                create_echarts_network_data,
                get_custom_filter_data
            )
            from barcode_scanner.analysis import (
                analyze_top_musicians,
                get_session_musicians,
                get_collaboration_stats
            )
        except ImportError:
            from data_processor import (
                create_network_data,
                create_echarts_network_data,
                get_custom_filter_data
            )
            from analysis import (
                analyze_top_musicians,
                get_session_musicians,
                get_collaboration_stats
            )

        import pandas as pd

        # Get user's collection with musician data
        supabase = get_supabase_client()
        result = supabase.table('vinyl_records').select('*').eq('user_id', user_id).execute()

        if not result.data:
            return jsonify({
                'success': True,
                'data': {
                    'nodes': [],
                    'links': [],
                    'categories': [],
                    'genres': [],
                    'styles': [],
                    'clean_roles': [],
                    'musician_stats': [],
                    'session_musicians': [],
                    'stats': {}
                },
                'message': 'No records found in collection'
            })

        # Convert to DataFrame
        records = result.data
        collection_df = pd.DataFrame(records)

        # Fetch contributors from relational tables
        record_ids = [r['id'] for r in records]
        contributors_data = get_contributors_for_records(user_id, record_ids)

        # Attach contributors to records
        for record in records:
            record['contributors'] = contributors_data.get(record['id'], {})

        # Expand custom_values_cache into separate columns
        if 'custom_values_cache' in collection_df.columns:
            # Extract custom column data and add as new columns
            custom_data = collection_df['custom_values_cache'].apply(lambda x: x if isinstance(x, dict) else {})

            # Get all unique custom column IDs across all records
            all_custom_columns = set()
            for custom_vals in custom_data:
                if isinstance(custom_vals, dict):
                    all_custom_columns.update(custom_vals.keys())

            # Fetch custom column names from the database
            custom_column_names = {}
            if all_custom_columns:
                try:
                    custom_cols_result = supabase.table('custom_columns').select('id, name').eq('user_id', user_id).execute()
                    if custom_cols_result.data:
                        custom_column_names = {col['id']: col['name'] for col in custom_cols_result.data}
                except Exception as e:
                    print(f"Warning: Could not fetch custom column names: {e}")

            # Add each custom column to the DataFrame with readable names
            for col_id in all_custom_columns:
                col_name = custom_column_names.get(col_id, f"custom_{col_id}")
                collection_df[col_name] = custom_data.apply(
                    lambda x: x.get(col_id) if isinstance(x, dict) else None
                )

        # Add contributors data to DataFrame
        collection_df['contributors'] = collection_df['id'].apply(
            lambda record_id: contributors_data.get(record_id, {})
        )

        # Rename columns to match the analysis format
        column_mapping = {
            'artist': 'Artist',
            'album': 'Album',
            'musicians': 'Musicians',
            'genres': 'Genres',
            'styles': 'Styles'
        }
        collection_df = collection_df.rename(columns=column_mapping)

        # Filter out records without contributor or musician data
        has_contributors = collection_df['contributors'].apply(lambda x: bool(x))
        has_musicians = collection_df['Musicians'].notna() if 'Musicians' in collection_df.columns else False
        collection_df = collection_df[has_contributors | has_musicians]

        if len(collection_df) == 0:
            return jsonify({
                'success': True,
                'data': {
                    'nodes': [],
                    'links': [],
                    'categories': [],
                    'contributor_categories': {},
                    'genres': [],
                    'styles': [],
                    'clean_roles': [],
                    'musician_stats': [],
                    'session_musicians': [],
                    'stats': {}
                },
                'message': 'No contributor or musician data found in collection'
            })

        # Get available contributor categories for filtering
        try:
            from barcode_scanner.data_processor import get_available_categories
        except ImportError:
            from data_processor import get_available_categories
        contributor_categories = get_available_categories(collection_df)

        # Step 1: Create network data
        network_df = create_network_data(collection_df)

        # Step 2: Create ECharts network data
        echarts_data = create_echarts_network_data(network_df, collection_df)

        # Step 3: Analyze musicians
        musician_stats_df = analyze_top_musicians(network_df, collection_df)
        session_musicians_df = get_session_musicians(
            musician_stats_df,
            min_records=2,
            min_session_ratio=0.7
        )

        # Step 4: Get collaboration stats
        stats = get_collaboration_stats(network_df)

        # Step 5: Get custom filter data
        custom_filter_data = get_custom_filter_data(collection_df)

        # Helper function to convert values to JSON-safe types
        def sanitize_value(val):
            """Convert numpy/pandas types to JSON-serializable Python types."""
            import math
            import numpy as np

            if isinstance(val, (list, tuple)):
                return [sanitize_value(v) for v in val]
            elif isinstance(val, dict):
                return {k: sanitize_value(v) for k, v in val.items()}
            elif pd.isna(val):
                return None
            elif isinstance(val, (np.integer, np.floating)):
                val = val.item()
                if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                    return None
                return val
            elif isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
                return None
            elif hasattr(val, 'item'):  # numpy scalar
                return sanitize_value(val.item())
            else:
                return val

        # Convert DataFrames to dictionaries for JSON serialization
        musician_stats_data = []
        for _, row in musician_stats_df.iterrows():
            record = {col: sanitize_value(row[col]) for col in musician_stats_df.columns}
            musician_stats_data.append(record)

        session_musicians_data = []
        for _, row in session_musicians_df.iterrows():
            record = {col: sanitize_value(row[col]) for col in session_musicians_df.columns}
            session_musicians_data.append(record)

        # Sanitize all data before building response
        sanitized_echarts_data = sanitize_value(echarts_data)
        sanitized_stats = sanitize_value(stats)
        sanitized_custom_filters = sanitize_value(custom_filter_data)
        sanitized_contributor_categories = sanitize_value(contributor_categories)

        # Build response data
        response_data = {
            'success': True,
            'data': {
                **sanitized_echarts_data,
                'musician_stats': musician_stats_data,
                'session_musicians': session_musicians_data,
                'stats': sanitized_stats,
                'custom_filters': sanitized_custom_filters,
                'contributor_categories': sanitized_contributor_categories
            }
        }

        _MUSICIAN_NETWORK_CACHE[user_id] = (time.time(), response_data)
        return jsonify(response_data)

    except Exception as e:
        print(f"Error generating musician network: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Failed to generate musician network: {str(e)}'
        }), 500
