import os
from dotenv import load_dotenv
import re
from typing import Optional, Dict, Any
import discogs_client
import time

# Load environment variables
load_dotenv()

# Initialize Discogs client with rate limiting
d = discogs_client.Client(
    'VinylCollectionManager/1.0',
    user_token=os.getenv('DISCOGS_TOKEN'),
    requests_timeout=30
)

def get_musicians(credits) -> list[str]:
    """Filter and format musician credits, excluding non-musical roles"""
    musicians = set()
    non_musical_roles = {
        'design', 'photography', 'artwork', 'mastered', 'mixed',
        'lacquer cut', 'liner notes', 'recorded by', 'producer',
        'engineer', 'mastering', 'mixing', 'recording'
    }

    for credit in credits:
        role = credit.role.lower()
        # Skip if any non-musical role is found in the role description
        if any(non_role in role for non_role in non_musical_roles):
            continue
        musicians.add(credit.name)

    return sorted(list(musicians))

def format_release_data(release) -> Dict[str, Any]:
    """Format a Discogs release object into a standardized format"""
    try:
        # Get artist name(s)
        artists = [artist.name for artist in release.artists]
        artist_name = ' & '.join(artists) if artists else 'Unknown Artist'

        # Get musicians from both release credits and track credits
        musicians = set()
        
        # Add musicians from release credits
        if hasattr(release, 'extraartists'):
            musicians.update(get_musicians(release.extraartists))
        
        # Add musicians from track credits
        for track in release.tracklist:
            if hasattr(track, 'extraartists'):
                musicians.update(get_musicians(track.extraartists))

        # Get master release info if available
        master = release.master if hasattr(release, 'master') else None
        
        # Format the data
        data = {
            'artist': artist_name,
            'album': release.title,
            'year': release.year,
            'label': release.labels[0].name if release.labels else None,
            'genres': release.genres if hasattr(release, 'genres') else [],
            'styles': release.styles if hasattr(release, 'styles') else [],
            'musicians': sorted(list(musicians)),
            'master_url': f'https://www.discogs.com/master/{master.id}' if master else None,
            'current_release_url': f'https://www.discogs.com/release/{release.id}',
            'current_release_year': release.year,
            'barcode': next((id_.value for id_ in release.identifiers 
                           if id_.type in ['Barcode', 'UPC']), None)
        }

        print(f"Formatted release data: {data}")  # Debug logging
        return data

    except Exception as e:
        print(f"Error formatting release data: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def search_by_barcode(barcode: str) -> Optional[Dict[str, Any]]:
    """Search Discogs for a release using its barcode"""
    try:
        print(f"Searching for barcode: {barcode}")  # Debug logging
        
        # Search for releases with the barcode
        results = d.search(barcode, type='release')
        if not results:
            print("No results found for barcode")
            return None

        # Get the first result
        release = results[0]
        print(f"Found release: {release.title} by {[a.name for a in release.artists]}")  # Debug logging

        # Get the full release data
        full_release = d.release(release.id)
        return format_release_data(full_release)

    except Exception as e:
        print(f"Error searching by barcode: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def search_by_discogs_id(release_id: str) -> Optional[Dict[str, Any]]:
    """Search for a release by Discogs release ID"""
    try:
        print(f"Looking up release ID: {release_id}")  # Debug logging
        
        # Get the release
        release = d.release(release_id)
        print(f"Found release: {release.title} by {[a.name for a in release.artists]}")  # Debug logging
        
        return format_release_data(release)

    except Exception as e:
        print(f"Error searching by release ID: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def extract_release_id(discogs_url: str) -> Optional[str]:
    """Extract release ID from a Discogs URL"""
    try:
        # Handle URLs like https://www.discogs.com/release/1234-Artist-Title
        if '/release/' in discogs_url:
            release_id = re.search(r'/release/(\d+)', discogs_url)
            if release_id:
                return release_id.group(1)
        return None
    except Exception as e:
        print(f"Error extracting release ID: {str(e)}")
        return None

def get_price_suggestions(release_id: str) -> Optional[Dict[str, Any]]:
    """Get price suggestions for a release"""
    try:
        release = d.release(release_id)
        return release.price_suggestions
    except Exception as e:
        print(f"Error getting price suggestions: {str(e)}")
        return None

def get_artist_info(artist_id: str) -> Optional[Dict[str, Any]]:
    """Get detailed artist information"""
    try:
        artist = d.artist(artist_id)
        return {
            'name': artist.name,
            'real_name': artist.real_name,
            'profile': artist.profile,
            'members': [m.name for m in artist.members] if hasattr(artist, 'members') else [],
            'groups': [g.name for g in artist.groups] if hasattr(artist, 'groups') else [],
            'aliases': [a.name for a in artist.aliases] if hasattr(artist, 'aliases') else [],
            'urls': artist.urls
        }
    except Exception as e:
        print(f"Error getting artist info: {str(e)}")
        return None

def get_label_info(label_id: str) -> Optional[Dict[str, Any]]:
    """Get detailed label information"""
    try:
        label = d.label(label_id)
        return {
            'name': label.name,
            'contact_info': label.contact_info,
            'profile': label.profile,
            'parent_label': label.parent_label.name if label.parent_label else None,
            'sublabels': [l.name for l in label.sublabels],
            'urls': label.urls
        }
    except Exception as e:
        print(f"Error getting label info: {str(e)}")
        return None

def main():
    """Example usage of the Discogs lookup functions"""
    print("\n=== Testing Barcode Lookup ===")
    test_barcode = "8436028696758"  # Chet Baker - Chet
    result = search_by_barcode(test_barcode)
    if result:
        print("\nFound by barcode:")
        for key, value in result.items():
            print(f"{key}: {value}")

    print("\n=== Testing Release ID Lookup ===")
    test_release_id = "8067003"  # John Coltrane - Blue Train
    result = search_by_discogs_id(test_release_id)
    if result:
        print("\nFound by release ID:")
        for key, value in result.items():
            print(f"{key}: {value}")

if __name__ == "__main__":
    main()
