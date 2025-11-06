"""
Data processing module for musician network analysis.
Handles CSV loading, musician parsing, and network data generation.
"""

import pandas as pd
import re
from collections import defaultdict


def load_collection_data(csv_path):
    """Load vinyl collection data from CSV file."""
    return pd.read_csv(csv_path)


def parse_contributors(contributors_data, main_artist, include_categories=None, exclude_categories=None):
    """
    Parse contributors data from the relational model into individual entries.
    
    Args:
        contributors_data: Dictionary with structure {main_category: {sub_category: [contributor_list]}}
        main_artist: Main artist for this record
        include_categories: List of (main_category, sub_category) tuples to include (None = include all)
        exclude_categories: List of (main_category, sub_category) tuples to exclude (None = exclude none)
        
    Returns:
        List of dictionaries with musician, role, main_artist, main_category, sub_category
    """
    # Handle None, empty, or invalid data
    if not contributors_data or not isinstance(contributors_data, dict):
        return []
    
    parsed_data = []
    
    for main_category, sub_categories in contributors_data.items():
        # Skip internal fields
        if main_category == '_role_index':
            continue
            
        if not isinstance(sub_categories, dict):
            continue
            
        for sub_category, contributor_list in sub_categories.items():
            # Check if this category should be included/excluded
            if include_categories is not None:
                if (main_category, sub_category) not in include_categories and (main_category, None) not in include_categories:
                    continue
                    
            if exclude_categories is not None:
                if (main_category, sub_category) in exclude_categories or (main_category, None) in exclude_categories:
                    continue
            
            if not isinstance(contributor_list, list):
                continue
                
            for contributor in contributor_list:
                # Handle both dict format (from relational DB) and string format (legacy)
                if isinstance(contributor, dict):
                    name = contributor.get('name', '')
                    roles = contributor.get('roles', [])
                    instruments = contributor.get('instruments', [])
                    
                    # Combine roles and instruments
                    all_parts = []
                    if isinstance(roles, list):
                        all_parts.extend(roles)
                    if isinstance(instruments, list):
                        all_parts.extend(instruments)
                    
                    # Clean name (remove disambiguation numbers for display)
                    clean_name = re.sub(r'\s*\(\d+\)\s*$', '', name).strip()
                    
                    for part in all_parts:
                        parsed_data.append({
                            'musician': clean_name,
                            'role': part,
                            'main_artist': main_artist,
                            'main_category': main_category,
                            'sub_category': sub_category
                        })
                elif isinstance(contributor, str):
                    # Legacy string format: "Name (Role1, Role2)"
                    match = re.match(r'^(.+?)\s*\((.+)\)$', contributor)
                    if match:
                        name = match[1].strip()
                        roles_str = match[2].strip()
                        
                        # Clean name (remove disambiguation numbers)
                        clean_name = re.sub(r'\s*\(\d+\)\s*$', '', name).strip()
                        
                        roles = [r.strip() for r in roles_str.split(',')]
                        for role in roles:
                            if role:
                                parsed_data.append({
                                    'musician': clean_name,
                                    'role': role,
                                    'main_artist': main_artist,
                                    'main_category': main_category,
                                    'sub_category': sub_category
                                })
    
    return parsed_data


def parse_musicians(musicians_str, main_artist):
    """
    LEGACY: Parse musician string into individual musician entries with roles.
    This is kept for backwards compatibility but should use parse_contributors instead.
    
    Args:
        musicians_str: String or list containing musician data
        main_artist: Main artist for this record
        
    Returns:
        List of dictionaries with musician, role, and main_artist
    """
    # Handle None, NaN, or empty values
    if musicians_str is None or (isinstance(musicians_str, float) and pd.isna(musicians_str)):
        return []
    
    # Handle empty lists or arrays
    if isinstance(musicians_str, (list, tuple)) and len(musicians_str) == 0:
        return []
    
    # If it's already a list (from the database), convert to string format
    if isinstance(musicians_str, list):
        # Each item might be a dict like {"name": "John Doe", "role": "Bass", ...}
        # or already a string
        if len(musicians_str) > 0 and isinstance(musicians_str[0], dict):
            # Convert from database format to string format
            entries = []
            for m in musicians_str:
                if 'name' in m and 'role' in m:
                    entries.append(f"{m['name']} ({m['role']})")
            musicians_str = '; '.join(entries)
        else:
            # If it's a list of strings, just join them
            musicians_str = '; '.join(str(m) for m in musicians_str if m)
    
    # Now we have a string, parse it
    musician_entries = str(musicians_str).split(';')
    parsed_data = []
    
    for entry in musician_entries:
        entry = entry.strip()
        if not entry:
            continue
            
        # Pattern: Name (optional number) (roles)
        pattern = r'^([^(]+?)(?:\s*\((\d+)\))?\s*\(([^)]+)\)$'
        match = re.match(pattern, entry)
        
        if match:
            name = match.group(1).strip()
            number = match.group(2)
            roles_str = match.group(3)
            
            full_name = f"{name} ({number})" if number else name
            roles = [role.strip() for role in roles_str.split(',')]
            
            for role in roles:
                if role:
                    parsed_data.append({
                        'musician': full_name,
                        'role': role,
                        'main_artist': main_artist
                    })
    
    return parsed_data


def create_network_data(collection_df, include_categories=None, exclude_categories=None):
    """
    Create network dataset from collection dataframe using relational contributors.
    
    Args:
        collection_df: DataFrame with 'contributors' column containing relational data
        include_categories: List of (main_category, sub_category) tuples to include (None = include all)
        exclude_categories: List of (main_category, sub_category) tuples to exclude (None = exclude none)
    
    Returns:
        pandas.DataFrame with columns: musician, role, main_artist, album, main_category, sub_category, and all original columns
    """
    all_connections = []
    
    for idx, row in collection_df.iterrows():
        main_artist = row['Artist']
        album = row['Album']
        
        # Try to use new relational contributors first
        if 'contributors' in row and row['contributors']:
            connections = parse_contributors(
                row['contributors'], 
                main_artist,
                include_categories=include_categories,
                exclude_categories=exclude_categories
            )
        # Fallback to legacy musicians field
        elif 'Musicians' in row and row['Musicians']:
            connections = parse_musicians(row['Musicians'], main_artist)
        else:
            connections = []
        
        for connection in connections:
            connection['album'] = album
            # Add all original collection columns for custom filtering
            for col in collection_df.columns:
                if col not in ['Artist', 'Album', 'Musicians', 'contributors']:
                    connection[col] = row[col]
            all_connections.append(connection)
    
    return pd.DataFrame(all_connections)


def get_available_categories(collection_df):
    """
    Extract all available main categories and subcategories from contributors data.
    
    Args:
        collection_df: DataFrame with 'contributors' column
        
    Returns:
        Dictionary with structure: {main_category: [sub_category1, sub_category2, ...]}
    """
    categories = defaultdict(set)
    
    for idx, row in collection_df.iterrows():
        if 'contributors' not in row or not row['contributors']:
            continue
            
        contributors_data = row['contributors']
        if not isinstance(contributors_data, dict):
            continue
            
        for main_category, sub_categories in contributors_data.items():
            if main_category == '_role_index':
                continue
            if not isinstance(sub_categories, dict):
                continue
                
            for sub_category in sub_categories.keys():
                categories[main_category].add(sub_category)
    
    # Convert sets to sorted lists
    return {main_cat: sorted(list(sub_cats)) for main_cat, sub_cats in categories.items()}


def clean_role_name(role):
    """Remove bracket information from role names to group similar roles."""
    if pd.isna(role):
        return role
    # Remove everything in brackets and parentheses
    cleaned = re.sub(r'\s*\[.*?\]', '', str(role))
    cleaned = re.sub(r'\s*\(.*?\)', '', cleaned)
    return cleaned.strip()


def create_echarts_network_data(network_df, collection_df):
    """
    Create complete data structure for ECharts with proper node categorization.
    
    Returns:
        Dictionary with nodes, links, categories, genres, styles, and clean_roles
    """
    # Add cleaned role names
    filtered_df = network_df.copy()
    filtered_df['clean_role'] = filtered_df['role'].apply(clean_role_name)
    
    # Get all main artists
    main_artists = set(filtered_df['main_artist'].unique())
    
    # Create artist-to-genre/style mapping
    artist_info = {}
    for _, row in collection_df.iterrows():
        artist = row['Artist']
        
        # Handle Genres - might be array, string, or None
        genres_value = row['Genres']
        if isinstance(genres_value, list):
            genres = ', '.join(str(g) for g in genres_value if g)
        elif genres_value is not None and not (isinstance(genres_value, float) and pd.isna(genres_value)):
            genres = str(genres_value)
        else:
            genres = ''
        
        # Handle Styles - might be array, string, or None
        styles_value = row['Styles']
        if isinstance(styles_value, list):
            styles = ', '.join(str(s) for s in styles_value if s)
        elif styles_value is not None and not (isinstance(styles_value, float) and pd.isna(styles_value)):
            styles = str(styles_value)
        else:
            styles = ''
        
        if artist not in artist_info:
            artist_info[artist] = {
                'genres': set(),
                'styles': set(),
                'albums': []
            }
        
        # Parse genres and styles
        if genres:
            genre_list = [g.strip() for g in genres.split(',')]
            artist_info[artist]['genres'].update(genre_list)
        
        if styles:
            style_list = [s.strip() for s in styles.split(',')]
            artist_info[artist]['styles'].update(style_list)
            
        artist_info[artist]['albums'].append(row['Album'])
    
    # Convert sets to lists for JSON serialization
    for artist in artist_info:
        artist_info[artist]['genres'] = list(artist_info[artist]['genres'])
        artist_info[artist]['styles'] = list(artist_info[artist]['styles'])
    
    # Create nodes
    nodes = []
    node_ids = set()
    
    # Add all main artists as artist nodes (blue)
    for artist in filtered_df['main_artist'].unique():
        if artist not in node_ids:
            musician_count = filtered_df[filtered_df['main_artist'] == artist]['musician'].nunique()
            
            artist_genres = artist_info.get(artist, {}).get('genres', [])
            artist_styles = artist_info.get(artist, {}).get('styles', [])
            artist_albums = artist_info.get(artist, {}).get('albums', [])
            
            # Get roles for this artist
            artist_roles = filtered_df[filtered_df['main_artist'] == artist]['clean_role'].unique().tolist()
            
            nodes.append({
                'id': artist,
                'name': artist,
                'category': 'artist',
                'symbolSize': min(12 + musician_count * 1.5, 35),
                'value': musician_count,
                'genres': artist_genres,
                'styles': artist_styles,
                'albums': artist_albums,
                'roles': artist_roles
            })
            node_ids.add(artist)
    
    # Add musicians who are NOT main artists as musician nodes (orange)
    for musician in filtered_df['musician'].unique():
        if musician not in node_ids:
            artist_count = filtered_df[filtered_df['musician'] == musician]['main_artist'].nunique()
            
            # Get genres/styles from artists this musician works with
            musician_artists = filtered_df[filtered_df['musician'] == musician]['main_artist'].unique()
            musician_genres = set()
            musician_styles = set()
            
            for artist in musician_artists:
                if artist in artist_info:
                    musician_genres.update(artist_info[artist]['genres'])
                    musician_styles.update(artist_info[artist]['styles'])
            
            # Get roles for this musician
            musician_roles = filtered_df[filtered_df['musician'] == musician]['clean_role'].unique().tolist()
            
            nodes.append({
                'id': musician,
                'name': musician,
                'category': 'musician',
                'symbolSize': min(8 + artist_count * 2, 25),
                'value': artist_count,
                'genres': list(musician_genres),
                'styles': list(musician_styles),
                'collaborations': list(musician_artists),
                'roles': musician_roles
            })
            node_ids.add(musician)
    
    # Create links
    links = []
    link_counts = defaultdict(int)
    
    for _, row in filtered_df.iterrows():
        musician = row['musician']
        artist = row['main_artist']
        role = row['role']
        clean_role = row['clean_role']
        album = row['album']
        main_category = row.get('main_category', '')
        sub_category = row.get('sub_category', '')
        
        # Only create links if both nodes exist
        if musician in node_ids and artist in node_ids:
            link_key = f"{musician}_{artist}"
            link_counts[link_key] += 1
            
            if link_counts[link_key] == 1:
                # Get genres/styles for this connection
                connection_genres = artist_info.get(artist, {}).get('genres', [])
                connection_styles = artist_info.get(artist, {}).get('styles', [])
                
                # Get custom filter data for this connection
                custom_data = {}
                for col in filtered_df.columns:
                    if col not in ['musician', 'role', 'main_artist', 'album', 'clean_role', 'main_category', 'sub_category']:
                        val = row[col]
                        # Convert to plain Python types to avoid circular references
                        if isinstance(val, list):
                            custom_data[col] = list(val)
                        elif pd.isna(val):
                            custom_data[col] = None
                        elif hasattr(val, 'item'):  # numpy scalar
                            custom_data[col] = val.item()
                        else:
                            custom_data[col] = val
                
                links.append({
                    'source': musician,
                    'target': artist,
                    'value': 1,
                    'roles': [role],
                    'clean_roles': [clean_role],
                    'albums': [album],
                    'genres': connection_genres,
                    'styles': connection_styles,
                    'main_category': main_category,
                    'sub_category': sub_category,
                    'custom_data': custom_data
                })
            else:
                # Find existing link and add role/album/custom data
                for link in links:
                    if link['source'] == musician and link['target'] == artist:
                        link['roles'].append(role)
                        link['clean_roles'].append(clean_role)
                        link['albums'].append(album)
                        link['value'] += 1
                        # Update category info (use first non-empty value encountered)
                        if not link.get('main_category') and main_category:
                            link['main_category'] = main_category
                        if not link.get('sub_category') and sub_category:
                            link['sub_category'] = sub_category
                        # Merge custom data
                        for col in filtered_df.columns:
                            if col not in ['musician', 'role', 'main_artist', 'album', 'clean_role', 'main_category', 'sub_category']:
                                val = row[col]
                                # Convert to plain Python types to avoid circular references
                                if isinstance(val, list):
                                    val = list(val)
                                elif pd.isna(val):
                                    val = None
                                elif hasattr(val, 'item'):  # numpy scalar
                                    val = val.item()
                                
                                if col not in link['custom_data']:
                                    link['custom_data'][col] = []
                                if isinstance(link['custom_data'][col], list):
                                    link['custom_data'][col].append(val)
                                else:
                                    link['custom_data'][col] = [link['custom_data'][col], val]
                        break
    
    # Get all unique genres, styles, and clean roles for filters
    all_genres = set()
    all_styles = set()
    all_clean_roles = set()
    
    for node in nodes:
        all_genres.update(node.get('genres', []))
        all_styles.update(node.get('styles', []))
        all_clean_roles.update(node.get('roles', []))
    
    categories = [
        {'name': 'musician', 'itemStyle': {'color': '#ff7f0e'}},
        {'name': 'artist', 'itemStyle': {'color': '#1f77b4'}}
    ]
    
    return {
        'nodes': nodes,
        'links': links,
        'categories': categories,
        'genres': sorted(list(all_genres)),
        'styles': sorted(list(all_styles)),
        'clean_roles': sorted(list(all_clean_roles))
    } 


def get_custom_filter_data(collection_df):
    """
    Extract column data for custom filtering.
    Excludes Artist, Album, and Musicians columns.
    
    Returns:
        Dictionary with available columns and their unique values
    """
    # Columns to exclude from custom filtering
    excluded_columns = {'Artist', 'Album', 'Musicians'}
    
    # Get all columns except excluded ones
    available_columns = [col for col in collection_df.columns if col not in excluded_columns]
    
    custom_filter_data = {}
    
    for column in available_columns:
        # Get all non-null values
        values = collection_df[column].dropna().tolist()
        
        # Flatten and expand values
        expanded_values = set()
        for value in values:
            # Handle lists (e.g., genres, styles from database)
            if isinstance(value, list):
                for item in value:
                    if item:
                        expanded_values.add(str(item).strip())
            # Handle comma-separated strings
            elif isinstance(value, str) and ',' in value:
                parts = [part.strip() for part in value.split(',')]
                expanded_values.update(parts)
            # Handle other values
            elif value is not None:
                expanded_values.add(str(value).strip())
        
        # Convert to sorted list, removing empty strings
        sorted_values = sorted([v for v in expanded_values if v and v.strip()])
        
        if sorted_values:  # Only include columns that have values
            custom_filter_data[column] = sorted_values
    
    return custom_filter_data 
