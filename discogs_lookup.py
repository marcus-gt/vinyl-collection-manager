import os
from dotenv import load_dotenv
import re
from typing import Optional, Dict, Any
from discogs_client import Client
import time

# Load environment variables
load_dotenv()

# Get token and validate it's not None
token = os.getenv('DISCOGS_TOKEN')
if not token:
    raise ValueError("DISCOGS_TOKEN environment variable is not set")

print(f"Initializing Discogs client with token: {token[:4]}...{token[-4:]}")  # Only show first/last 4 chars for security

# Initialize Discogs client
try:
    d = Client('VinylCollectionManager/1.0', user_token=token)
    # Test the client with a simple identity call
    me = d.identity()
    print(f"Successfully authenticated with Discogs as: {me.username}")
except Exception as e:
    print(f"Error initializing Discogs client: {str(e)}")
    raise

def get_musicians(credits) -> list[str]:
    """Filter and format musician credits, excluding non-musical roles"""
    musicians = set()
    non_musical_roles = {
        'design', 'photography', 'artwork', 'mastered', 'mixed',
        'lacquer cut', 'liner notes', 'recorded by', 'producer',
        'engineer', 'mastering', 'mixing', 'recording', 'artwork',
        'cover', 'layout', 'typography', 'illustration', 'supervised',
        'coordinator', 'executive', 'a&r', 'management', 'marketing'
    }

    musical_roles = {
        'alto', 'baritone', 'tenor', 'soprano', 'saxophone', 'sax',
        'trumpet', 'piano', 'bass', 'drums', 'guitar', 'percussion',
        'trombone', 'vocals', 'performer', 'composed', 'written',
        'arranged', 'conductor', 'orchestra', 'ensemble', 'quartet',
        'quintet', 'trio', 'band', 'leader', 'sideman', 'soloist',
        'musician', 'instruments', 'horn', 'woodwind', 'brass',
        'strings', 'rhythm', 'flute', 'clarinet', 'vibraphone'
    }

    for credit in credits:
        role = credit.role.lower()
        print(f"Checking credit: {credit.name} ({role})")  # Debug logging
        
        # Skip if any non-musical role is found
        if any(non_role in role for non_role in non_musical_roles):
            print(f"Skipping {credit.name} - non-musical role: {role}")
            continue
            
        # Include if any musical role is found
        if any(musical_role in role for musical_role in musical_roles):
            # Format name with role: "Name (Role)"
            formatted_name = f"{credit.name} ({credit.role})"
            musicians.add(formatted_name)
            print(f"Added musician {formatted_name} - musical role: {role}")
        # Or if no specific role matches (might be a musician)
        elif not any(non_role in role for non_role in non_musical_roles):
            # For unspecified roles, just add the name
            musicians.add(credit.name)
            print(f"Added musician {credit.name} - unspecified role: {role}")

    return sorted(list(musicians))

def format_release_data(release) -> Dict[str, Any]:
    """Format a Discogs release object into a standardized format"""
    try:
        # Get artist name(s)
        artists = [artist.name for artist in release.artists]
        artist_name = ' & '.join(artists) if artists else 'Unknown Artist'

        # Get musicians from both release credits and track credits
        musicians = set()
        
        # Try to get the master release for year and additional info
        master = None
        original_year = None
        main_release = None
        try:
            if hasattr(release, 'master') and release.master:
                print("Found master release, fetching full master data...")
                master = d.master(release.master.id)  # Fetch full master data
                original_year = master.year
                print(f"Found master release year: {original_year}")
                
                # Get the main release data
                if hasattr(master, 'main_release'):
                    print(f"Found main release ID: {master.main_release.id}")
                    main_release = d.release(master.main_release.id)
                    print("Fetched main release data")
                    
                    # Get musicians from main release credits
                    if hasattr(main_release, 'credits'):
                        print("Found main release credits:", [f"{c.name} ({c.role})" for c in main_release.credits])
                        musicians.update(get_musicians(main_release.credits))
                    else:
                        print("No credits found on main release")
                    
                    # Get musicians from main release tracklist
                    if hasattr(main_release, 'tracklist'):
                        for track in main_release.tracklist:
                            if hasattr(track, 'credits'):
                                print(f"Found track credits for {track.title}:", 
                                      [f"{c.name} ({c.role})" for c in track.credits])
                                musicians.update(get_musicians(track.credits))
                            else:
                                print(f"No credits found on track: {track.title}")
        except Exception as e:
            print(f"Error getting master/main release info: {e}")

        # Fall back to current release credits if no musicians found
        if not musicians:
            print("\nNo musicians found in main release, checking current release...")
            if hasattr(release, 'credits'):
                print("Found current release credits:", [f"{c.name} ({c.role})" for c in release.credits])
                musicians.update(get_musicians(release.credits))
            else:
                print("No credits found on current release")
                
            # Get musicians from current release tracklist
            if hasattr(release, 'tracklist'):
                for track in release.tracklist:
                    if hasattr(track, 'credits'):
                        print(f"Found track credits for {track.title}:", 
                              [f"{c.name} ({c.role})" for c in track.credits])
                        musicians.update(get_musicians(track.credits))
                    else:
                        print(f"No credits found on track: {track.title}")
        
        # Format the data
        data = {
            'artist': artist_name,
            'album': release.title,
            'year': original_year or getattr(release, 'year', None),
            'label': release.labels[0].name if release.labels else None,
            'genres': getattr(release, 'genres', []),
            'styles': getattr(release, 'styles', []),
            'musicians': sorted(list(musicians)),
            'master_url': f'https://www.discogs.com/master/{master.id}' if master else None,
            'current_release_url': f'https://www.discogs.com/release/{release.id}',
            'current_release_year': getattr(release, 'year', None),
            'barcode': None
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
        print(f"\n=== Looking up release ID: {release_id} ===")
        
        # Validate release_id is numeric
        if not release_id.isdigit():
            print(f"Invalid release ID format: {release_id}")
            return {
                'success': False,
                'message': 'Invalid release ID format'
            }
            
        # Get the release directly by ID
        print("Fetching release from Discogs API...")
        release = d.release(int(release_id))  # Convert to int as the API expects numeric ID
        
        if not release:
            print("No release found")
            return {
                'success': False,
                'message': 'No release found'
            }
            
        print(f"Found release: {release.title} by {[a.name for a in release.artists]}")
        
        # Get the formatted data
        formatted_data = format_release_data(release)
        print(f"Formatted release data: {formatted_data}")
        
        if not formatted_data:
            return {
                'success': False,
                'message': 'Failed to format release data'
            }
            
        # Return success response with data
        return {
            'success': True,
            'data': formatted_data
        }

    except Exception as e:
        print(f"Error searching by release ID: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'message': f'Error looking up release: {str(e)}'
        }

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
    """Test the Discogs API with Blue Train release"""
    print("\n=== Testing Discogs API ===")
    
    # Test the client connection
    print("\nTesting client connection...")
    try:
        me = d.identity()
        print(f"✓ Successfully connected as: {me.username}")
    except Exception as e:
        print(f"✗ Connection failed: {str(e)}")
        return

    # Test release lookup
    release_id = "8067003"  # John Coltrane - Blue Train
    print(f"\nLooking up release ID: {release_id}")
    
    try:
        # First try to get the raw release
        print("\nFetching raw release data...")
        release = d.release(int(release_id))
        print("Raw release data:")
        print(f"- Title: {release.title}")
        print(f"- Artists: {[a.name for a in release.artists]}")
        print(f"- Year: {release.year}")
        print(f"- Labels: {[l.name for l in release.labels]}")
        print(f"- Genres: {release.genres}")
        print(f"- Styles: {release.styles}")
        
        # Try to get extra artists
        if hasattr(release, 'extraartists'):
            print("\nExtra artists:")
            for artist in release.extraartists:
                print(f"- {artist.name}: {artist.role}")
        
        # Try to get tracklist
        if hasattr(release, 'tracklist'):
            print("\nTracklist:")
            for track in release.tracklist:
                print(f"- {track.title}")
                if hasattr(track, 'extraartists'):
                    for artist in track.extraartists:
                        print(f"  * {artist.name}: {artist.role}")
        
        # Now test our formatted data function
        print("\nTesting format_release_data function...")
        formatted = format_release_data(release)
        if formatted:
            print("\nFormatted release data:")
            for key, value in formatted.items():
                print(f"- {key}: {value}")
        else:
            print("✗ Failed to format release data")
            
        # Finally test the full search function
        print("\nTesting full search_by_discogs_id function...")
        result = search_by_discogs_id(release_id)
        print(f"\nFinal search result: {result}")
        
    except Exception as e:
        print(f"✗ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
