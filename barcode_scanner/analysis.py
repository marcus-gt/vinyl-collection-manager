"""
Analysis module for musician network statistics.
Handles top musicians, session musicians, and detailed musician analysis.
"""

import pandas as pd


def analyze_top_musicians(network_df, collection_df):
    """
    Analyze top musicians by various metrics.
    
    Args:
        network_df: DataFrame with musician network connections
        collection_df: Original collection DataFrame
        
    Returns:
        pandas.DataFrame with musician statistics
    """
    musician_stats = []
    
    # Get unique musicians and their records
    musician_records = {}
    for _, row in network_df.iterrows():
        musician = row['musician']
        album = f"{row['main_artist']} - {row['album']}"
        
        if musician not in musician_records:
            musician_records[musician] = []
        if album not in musician_records[musician]:
            musician_records[musician].append(album)
    
    for musician, records in musician_records.items():
        # Count appearances as main artist
        main_artist_count = len([r for r in records if r.startswith(f"{musician} - ")])
        
        # Count total record appearances
        total_appearances = len(records)
        
        # Calculate session musician score
        session_score = total_appearances - main_artist_count
        
        musician_stats.append({
            'musician': musician,
            'total_records': total_appearances,
            'as_main_artist': main_artist_count,
            'as_session_musician': session_score,
            'session_ratio': session_score / total_appearances if total_appearances > 0 else 0,
            'records': records
        })
    
    return pd.DataFrame(musician_stats)


def get_session_musicians(musician_stats_df, min_records=2, min_session_ratio=0.7):
    """
    Get session musicians - those who appear on many records but rarely as main artist.
    
    Args:
        musician_stats_df: DataFrame from analyze_top_musicians
        min_records: Minimum number of records to qualify
        min_session_ratio: Minimum ratio of session work to total work
        
    Returns:
        pandas.DataFrame of session musicians
    """
    session_musicians = musician_stats_df[
        (musician_stats_df['total_records'] >= min_records) & 
        (musician_stats_df['session_ratio'] >= min_session_ratio) &
        (musician_stats_df['as_session_musician'] >= 2)
    ].sort_values('as_session_musician', ascending=False)
    
    return session_musicians


def get_musician_debug_info(musician_name, network_df, musician_stats_df):
    """
    Get detailed debug information for a specific musician.
    
    Args:
        musician_name: Name of musician to analyze
        network_df: Network DataFrame
        musician_stats_df: Statistics DataFrame
        
    Returns:
        Dictionary with detailed musician information or None if not found
    """
    if musician_name not in network_df['musician'].values:
        return None
    
    # Get musician's records
    musician_data = network_df[network_df['musician'] == musician_name]
    albums = musician_data['album'].unique().tolist()
    
    # Get collaborators (other musicians on same albums)
    collaborators = set()
    for album in albums:
        album_musicians = network_df[
            (network_df['album'] == album) & 
            (network_df['musician'] != musician_name)
        ]['musician'].tolist()
        collaborators.update(album_musicians)
    
    # Get stats
    stats_row = musician_stats_df[musician_stats_df['musician'] == musician_name]
    stats = stats_row.iloc[0].to_dict() if not stats_row.empty else {}
    
    # Get roles
    roles = musician_data['role'].unique().tolist()
    
    return {
        'musician': musician_name,
        'albums': albums,
        'collaborators': list(collaborators),
        'roles': roles,
        'stats': stats,
        'total_records': len(albums),
        'total_collaborators': len(collaborators)
    }


def get_top_musicians_by_metric(musician_stats_df, metric='total_records', limit=20):
    """
    Get top musicians by a specific metric.
    
    Args:
        musician_stats_df: Statistics DataFrame
        metric: Metric to sort by ('total_records', 'as_session_musician', etc.)
        limit: Number of musicians to return
        
    Returns:
        pandas.DataFrame of top musicians
    """
    return musician_stats_df.sort_values(metric, ascending=False).head(limit)


def get_collaboration_stats(network_df):
    """
    Get general collaboration statistics.
    
    Returns:
        Dictionary with various network statistics
    """
    return {
        'total_connections': len(network_df),
        'unique_musicians': network_df['musician'].nunique(),
        'unique_artists': network_df['main_artist'].nunique(),
        'unique_albums': network_df['album'].nunique(),
        'unique_roles': network_df['role'].nunique(),
        'most_collaborative_musician': network_df['musician'].value_counts().index[0],
        'most_collaborative_artist': network_df['main_artist'].value_counts().index[0]
    }


def search_musicians(musician_stats_df, search_term, limit=10):
    """
    Search for musicians by name.
    
    Args:
        musician_stats_df: Statistics DataFrame
        search_term: String to search for in musician names
        limit: Maximum number of results
        
    Returns:
        pandas.DataFrame of matching musicians
    """
    matching_musicians = musician_stats_df[
        musician_stats_df['musician'].str.contains(search_term, case=False, na=False)
    ].sort_values('total_records', ascending=False).head(limit)
    
    return matching_musicians 
