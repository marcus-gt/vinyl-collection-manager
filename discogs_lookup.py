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

def format_release_data(release, added_from: str = None) -> Dict[str, Any]:
    """Format a Discogs release object into a standardized format"""
    try:
        print("\n=== Formatting Release Data ===")
        print(f"Input added_from value: {added_from}")
        
        # Get artist name(s) from current release
        artists = [artist.name for artist in release.artists]
        artist_name = ' & '.join(artists) if artists else 'Unknown Artist'

        # Initialize collections
        musicians = set()
        
        # === CURRENT RELEASE DATA ===
        print("\n--- Extracting Current Release Data ---")
        
        # Current release ID
        current_release_id = release.id
        print(f"Current release ID: {current_release_id}")
        
        # Current format
        current_format = None
        if hasattr(release, 'formats') and release.formats:
            format_names = [fmt.get('name') for fmt in release.formats if fmt.get('name')]
            if format_names:
                current_format = ', '.join(format_names)
                print(f"Current release format: {current_format}")
        
        # Current label and catalog number
        current_label = None
        current_catno = None
        if hasattr(release, 'labels') and release.labels:
            current_label = release.labels[0].name
            current_catno = release.labels[0].catno if hasattr(release.labels[0], 'catno') else None
            print(f"Current label: {current_label}, catno: {current_catno}")
        
        # Current country
        current_country = getattr(release, 'country', None)
        print(f"Current country: {current_country}")
        
        # Current release date
        current_release_date = None
        current_release_year = getattr(release, 'year', None)
        if hasattr(release, 'released') and release.released:
            current_release_date = release.released
            print(f"Current release date: {current_release_date}")
        
        # Current identifiers (barcodes, matrix codes, etc.)
        current_identifiers = []
        if hasattr(release, 'identifiers') and release.identifiers:
            for identifier in release.identifiers:
                current_identifiers.append({
                    'type': identifier.get('type', ''),
                    'value': identifier.get('value', ''),
                    'description': identifier.get('description', '')
                })
            print(f"Current identifiers: {len(current_identifiers)} found")
        
        # Current genres/styles (will be overridden by master/main if available)
        current_genres = getattr(release, 'genres', [])
        current_styles = getattr(release, 'styles', [])
        
        # === MASTER RELEASE DATA ===
        print("\n--- Extracting Master Release Data ---")
        master = None
        master_id = None
        tracklist = []
        master_genres = []
        master_styles = []
        
        try:
            if hasattr(release, 'master') and release.master:
                print("Found master release, fetching full master data...")
                master = d.master(release.master.id)
                master_id = master.id
                print(f"Master ID: {master_id}")
                
                # Get tracklist from master
                if hasattr(master, 'tracklist') and master.tracklist:
                    for track in master.tracklist:
                        track_data = {
                            'position': getattr(track, 'position', ''),
                            'title': getattr(track, 'title', ''),
                            'duration': getattr(track, 'duration', '')
                        }
                        tracklist.append(track_data)
                    print(f"Master tracklist: {len(tracklist)} tracks")
                
                # Get genres/styles from master (priority 1)
                if hasattr(master, 'genres') and master.genres:
                    master_genres = master.genres
                    print(f"Master genres: {master_genres}")
                if hasattr(master, 'styles') and master.styles:
                    master_styles = master.styles
                    print(f"Master styles: {master_styles}")
                    
        except Exception as e:
            print(f"Error getting master release info: {e}")
        
        # === MAIN/ORIGINAL RELEASE DATA ===
        print("\n--- Extracting Main/Original Release Data ---")
        main_release = None
        original_release_id = None
        original_label = None
        original_catno = None
        original_country = None
        original_release_date = None
        original_year = None
        original_format = None
        original_identifiers = []
        main_genres = []
        main_styles = []
        
        try:
            if master and hasattr(master, 'main_release'):
                print(f"Found main release ID: {master.main_release.id}")
                main_release = d.release(master.main_release.id)
                original_release_id = main_release.id
                print("Fetched main release data")
                
                # Original format
                if hasattr(main_release, 'formats') and main_release.formats:
                    format_names = [fmt.get('name') for fmt in main_release.formats if fmt.get('name')]
                    if format_names:
                        original_format = ', '.join(format_names)
                        print(f"Original format: {original_format}")
                
                # Original label and catalog number
                if hasattr(main_release, 'labels') and main_release.labels:
                    original_label = main_release.labels[0].name
                    original_catno = main_release.labels[0].catno if hasattr(main_release.labels[0], 'catno') else None
                    print(f"Original label: {original_label}, catno: {original_catno}")
                
                # Original country
                if hasattr(main_release, 'country'):
                    original_country = main_release.country
                    print(f"Original country: {original_country}")
                
                # Original year and date
                original_year = master.year if master else None
                if hasattr(main_release, 'released') and main_release.released:
                    original_release_date = main_release.released
                    print(f"Original release date: {original_release_date}")
                elif original_year:
                    print(f"Original year (from master): {original_year}")
                
                # Original identifiers
                if hasattr(main_release, 'identifiers') and main_release.identifiers:
                    for identifier in main_release.identifiers:
                        original_identifiers.append({
                            'type': identifier.get('type', ''),
                            'value': identifier.get('value', ''),
                            'description': identifier.get('description', '')
                        })
                    print(f"Original identifiers: {len(original_identifiers)} found")
                
                # Get genres/styles from main release (priority 2)
                if hasattr(main_release, 'genres') and main_release.genres:
                    main_genres = main_release.genres
                    print(f"Main release genres: {main_genres}")
                if hasattr(main_release, 'styles') and main_release.styles:
                    main_styles = main_release.styles
                    print(f"Main release styles: {main_styles}")
                
                # Get musicians from main release (priority 1)
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
            print(f"Error getting main release info: {e}")

        # Fall back to current release for musicians if none found in main release
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
        
        # === PRIORITY LOGIC FOR GENRES/STYLES ===
        # Priority: master → main_release → current release
        final_genres = master_genres or main_genres or current_genres
        final_styles = master_styles or main_styles or current_styles
        print(f"\nFinal genres (priority: master→main→current): {final_genres}")
        print(f"Final styles (priority: master→main→current): {final_styles}")
        
        # === PRIORITY LOGIC FOR COUNTRY ===
        # Priority: main_release (original) → current release
        final_country = original_country or current_country
        print(f"Final country (priority: original→current): {final_country}")

        # Format the complete data dictionary
        data = {
            # Core fields (from current release)
            'artist': artist_name,
            'album': release.title,
            
            # Master release fields
            'master_id': master_id,
            'master_url': f'https://www.discogs.com/master/{master_id}' if master_id else None,
            'tracklist': tracklist,
            
            # Original/main release fields
            'year': original_year or current_release_year,  # Original year preferred
            'label': original_label or current_label,  # Original label preferred
            'country': final_country,  # Original country preferred
            'master_format': original_format,  # Using "master_format" for compatibility (it's actually original format)
            'original_release_id': original_release_id,
            'original_release_url': f'https://www.discogs.com/release/{original_release_id}' if original_release_id else None,
            'original_catno': original_catno,
            'original_release_date': original_release_date,
            'original_identifiers': original_identifiers,
            
            # Current/specific release fields
            'current_release_id': current_release_id,
            'current_release_url': f'https://www.discogs.com/release/{current_release_id}',
            'current_release_year': current_release_year,
            'current_release_format': current_format,
            'current_label': current_label,
            'current_catno': current_catno,
            'current_country': current_country,
            'current_release_date': current_release_date,
            'current_identifiers': current_identifiers,
            
            # Shared fields (with priority logic applied)
            'genres': final_genres,
            'styles': final_styles,
            'musicians': sorted(list(musicians)),
            
            # Legacy/metadata fields
            'barcode': None,  # Will be populated by barcode search
            'added_from': added_from
        }

        print(f"\nFormatted data added_from value: {data['added_from']}")
        print(f"Total fields populated: {len([k for k, v in data.items() if v is not None])}/{len(data)}")
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
        return format_release_data(full_release, added_from='barcode')

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
        formatted_data = format_release_data(release, added_from='discogs_url')
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
    """Extract release ID or master ID from a Discogs URL"""
    try:
        # Handle URLs like https://www.discogs.com/release/1234-Artist-Title
        if '/release/' in discogs_url:
            release_id = re.search(r'/release/(\d+)', discogs_url)
            if release_id:
                return release_id.group(1)
        # Handle URLs like https://www.discogs.com/master/1234-Artist-Title
        elif '/master/' in discogs_url:
            master_id = re.search(r'/master/(\d+)', discogs_url)
            if master_id:
                return master_id.group(1)
        return None
    except Exception as e:
        print(f"Error extracting ID: {str(e)}")
        return None

def search_by_discogs_url(url: str) -> Optional[Dict[str, Any]]:
    """Search for a release using a Discogs URL (supports both release and master URLs)"""
    try:
        print(f"\n=== Looking up Discogs URL: {url} ===")
        
        # Extract the ID from the URL
        discogs_id = extract_release_id(url)
        if not discogs_id:
            return {
                'success': False,
                'message': 'Could not extract ID from URL'
            }
            
        # Check if it's a master URL
        if '/master/' in url:
            print(f"Found master URL, fetching master release {discogs_id}...")
            master = d.master(int(discogs_id))
            if not master:
                return {
                    'success': False,
                    'message': 'Master release not found'
                }
                
            # Get the main release from the master
            if not hasattr(master, 'main_release'):
                return {
                    'success': False,
                    'message': 'No main release found for this master'
                }
                
            print(f"Found main release ID: {master.main_release.id}")
            return search_by_discogs_id(str(master.main_release.id))
        else:
            # It's a release URL, use the existing function
            return search_by_discogs_id(discogs_id)
            
    except Exception as e:
        print(f"Error searching by URL: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'message': f'Error looking up release: {str(e)}'
        }

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

def search_by_artist_album(artist: str, album: str, source: str = 'manual') -> Optional[Dict[str, Any]]:
    """Search for a release by artist and album name"""
    try:
        print(f"\n=== Looking up release by artist: {artist}, album: {album} ===")
        print(f"Source: {source}")
        
        # Clean up search terms
        artist = artist.strip()
        album = album.strip()
        
        # Build search query
        query = f"{artist} {album}"
        print(f"Search query: {query}")
        
        # Search for releases with a timeout
        try:
            results = d.search(query, type='release', timeout=30)  # 30 second timeout
            if not results:
                print("No results found")
                return {
                    'success': False,
                    'error': 'No results found'
                }
        except Exception as search_err:
            print(f"Search timed out or failed: {str(search_err)}")
            return {
                'success': False,
                'error': 'Search timed out or failed'
            }
            
        # Find best match by comparing artist and album names
        best_match = None
        best_score = 0
        
        # Only check first 10 results to avoid timeouts
        for result in list(results)[:10]:
            # Get artist name(s)
            result_artists = [a.name.lower() for a in result.artists]
            artist_match = any(artist.lower() in result_artist or result_artist in artist.lower() 
                             for result_artist in result_artists)
            
            # Get album name
            result_album = result.title.lower()
            album_match = album.lower() in result_album or result_album in album.lower()
            
            # Calculate match score
            score = 0
            if artist_match:
                score += 1
            if album_match:
                score += 1
                
            # Update best match if this is better
            if score > best_score:
                best_score = score
                best_match = result
                
            # Break early if we found a perfect match
            if score == 2:
                break
                
        if not best_match:
            print("No matching results found")
            return {
                'success': False,
                'error': 'No matching results found'
            }
            
        print(f"Best match found: {best_match.title} by {[a.name for a in best_match.artists]}")
        
        try:
            # Get the full release data with timeout
            full_release = d.release(best_match.id)
            formatted_data = format_release_data(full_release, added_from=source)
            
            if not formatted_data:
                return {
                    'success': False,
                    'error': 'Failed to format release data'
                }
                
            return {
                'success': True,
                'data': formatted_data
            }
        except Exception as release_err:
            print(f"Failed to get full release data: {str(release_err)}")
            return {
                'success': False,
                'error': 'Failed to get full release data'
            }
        
    except Exception as e:
        print(f"Error searching by artist/album: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'error': f'Error looking up release: {str(e)}'
        }

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
            
        # Test the full search function with release ID
        print("\nTesting full search_by_discogs_id function...")
        result = search_by_discogs_id(release_id)
        print(f"\nFinal search result: {result}")
        
        # Test the URL search function with both release and master URLs
        print("\nTesting URL search with release URL...")
        release_url = f"https://www.discogs.com/release/{release_id}-John-Coltrane-Blue-Train"
        result = search_by_discogs_url(release_url)
        print(f"\nRelease URL search result: {result}")
        
        print("\nTesting URL search with master URL...")
        master_url = "https://www.discogs.com/master/32208-John-Coltrane-Blue-Train"
        result = search_by_discogs_url(master_url)
        print(f"\nMaster URL search result: {result}")
        
    except Exception as e:
        print(f"✗ Error during testing: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
