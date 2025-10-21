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


def parse_musicians(musicians_str, main_artist):
    """
    Parse musician string into individual musician entries with roles.
    
    Args:
        musicians_str: String or list containing musician data in format:
                      "Name (optional number) (roles); Name2 (roles)"
                      Or a list of musician dictionaries from the database
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


def create_network_data(collection_df):
    """
    Create network dataset from collection dataframe.
    
    Returns:
        pandas.DataFrame with columns: musician, role, main_artist, album, and all original columns
    """
    all_connections = []
    
    for idx, row in collection_df.iterrows():
        main_artist = row['Artist']
        musicians_str = row['Musicians']
        album = row['Album']
        
        connections = parse_musicians(musicians_str, main_artist)
        
        for connection in connections:
            connection['album'] = album
            # Add all original collection columns for custom filtering
            for col in collection_df.columns:
                if col not in ['Artist', 'Album', 'Musicians']:
                    connection[col] = row[col]
            all_connections.append(connection)
    
    return pd.DataFrame(all_connections)


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
                    if col not in ['musician', 'role', 'main_artist', 'album', 'clean_role']:
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
                        # Merge custom data
                        for col in filtered_df.columns:
                            if col not in ['musician', 'role', 'main_artist', 'album', 'clean_role']:
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
