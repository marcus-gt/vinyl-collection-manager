import os
from dotenv import load_dotenv
import re
import json
from typing import Optional, Dict, Any
from discogs_client import Client
import time
import warnings

# Load environment variables
load_dotenv()

# Load official Discogs credits list
DISCOGS_CREDITS_PATH = os.path.join(os.path.dirname(__file__), 'discogs_official_credits.json')
with open(DISCOGS_CREDITS_PATH, 'r', encoding='utf-8') as f:
    DISCOGS_CREDITS = json.load(f)
    ROLE_INDEX = DISCOGS_CREDITS.get('_role_index', {})

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

def get_all_credits(credits) -> dict:
    """
    Categorize all credits using the official Discogs credits list.
    
    Returns a nested dictionary structure:
    {
        "Heading": {
            "Subheading": ["Name (Role)", ...],
            ...
        },
        ...
    }
    
    For roles not found in the official list, they go to "Other" / "General".
    """
    # Initialize categorized structure
    categorized = {}
    
    for credit in credits:
        role = credit.role
        formatted_name = f"{credit.name} ({credit.role})"
        
        # Strip anything in brackets [...] before lookup (e.g., "Photography By [Front Cover]" -> "Photography By")
        role_for_lookup = re.sub(r'\s*\[.*?\]', '', role).strip()
        
        # Look up the role in the official Discogs index (case-insensitive)
        role_lower = role_for_lookup.lower()
        role_info = ROLE_INDEX.get(role_lower)
        
        if role_info:
            heading = role_info['heading']
            subheading = role_info['subheading']
            
            # Initialize heading if not exists
            if heading not in categorized:
                categorized[heading] = {}
            
            # Initialize subheading if not exists
            if subheading not in categorized[heading]:
                categorized[heading][subheading] = set()
            
            categorized[heading][subheading].add(formatted_name)
        else:
            # Role not found - try splitting by comma and matching parts
            # Prioritize Instruments category
            parts = [part.strip() for part in role_for_lookup.split(',')]
            matched = False
            matched_heading = None
            matched_subheading = None
            
            # Try to match each part
            for part in parts:
                part_lower = part.lower()
                part_info = ROLE_INDEX.get(part_lower)
                
                if part_info:
                    # Prioritize "Instruments" heading
                    if part_info['heading'] == 'Instruments':
                        matched_heading = part_info['heading']
                        matched_subheading = part_info['subheading']
                        matched = True
                        break
                    elif not matched:
                        matched_heading = part_info['heading']
                        matched_subheading = part_info['subheading']
                        matched = True
            
            if matched:
                # Initialize heading if not exists
                if matched_heading not in categorized:
                    categorized[matched_heading] = {}
                
                # Initialize subheading if not exists
                if matched_subheading not in categorized[matched_heading]:
                    categorized[matched_heading][matched_subheading] = set()
                
                categorized[matched_heading][matched_subheading].add(formatted_name)
            else:
                # No match found - add to "Other"
                if 'Other' not in categorized:
                    categorized['Other'] = {}
                if 'General' not in categorized['Other']:
                    categorized['Other']['General'] = set()
                
                categorized['Other']['General'].add(formatted_name)
    
    # Convert sets to sorted lists for JSON serialization
    for heading in categorized:
        for subheading in categorized[heading]:
            categorized[heading][subheading] = sorted(list(categorized[heading][subheading]))
    
    return categorized


def get_musicians(credits) -> list[str]:
    """
    LEGACY FUNCTION: Filter and format musician credits, excluding non-musical roles.
    This is kept for backwards compatibility but is superseded by get_all_credits().
    """
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
    """Format a Discogs release object into a standardized format with extended fields"""
    try:
        print("\n=== Formatting Release Data ===")
        print(f"Input added_from value: {added_from}")
        
        print("\n--- Extracting Current Release Data ---")
        # Get current release ID
        current_release_id = release.id
        print(f"Current release ID: {current_release_id}")
        
        # Get artist name(s)
        artists = [artist.name for artist in release.artists]
        artist_name = ' & '.join(artists) if artists else 'Unknown Artist'
        
        # Get current release format
        current_release_format = None
        if hasattr(release, 'formats') and release.formats:
            format_parts = []
            for fmt in release.formats:
                parts = [fmt.get('name', '')]
                if fmt.get('descriptions'):
                    parts.extend(fmt.get('descriptions'))
                if fmt.get('text'):
                    parts.append(fmt.get('text'))
                format_parts.append(', '.join(filter(None, parts)))
            current_release_format = ' ('.join(format_parts) + ')' * (len(format_parts) - 1) if format_parts else None
            print(f"Current release format: {current_release_format}")
        
        # Get current release label and catno
        current_label = None
        current_catno = None
        if hasattr(release, 'labels') and release.labels:
            current_label = release.labels[0].name
            current_catno = release.labels[0].catno
            print(f"Current label: {current_label}, catno: {current_catno}")
        
        # Get current release country
        current_country = getattr(release, 'country', None)
        print(f"Current country: {current_country}")
        
        # Get current release year
        current_release_year = getattr(release, 'year', None)
        print(f"Current release year: {current_release_year}")
        
        # Get current release identifiers (barcodes, matrix numbers, etc.)
        current_identifiers = []
        if hasattr(release, 'identifiers'):
            current_identifiers = [
                {
                    'type': id_item.get('type'),
                    'value': id_item.get('value'),
                    'description': id_item.get('description')
                }
                for id_item in release.identifiers
            ]
        
        print("\n--- Extracting Master Release Data ---")
        # Try to get the master release for additional info
        master = None
        master_id = None
        master_url = None
        tracklist = []
        main_genres = []
        main_styles = []
        
        try:
            if hasattr(release, 'master') and release.master:
                print("Found master release, fetching full master data...")
                master = d.master(release.master.id)
                master_id = master.id
                master_url = f'https://www.discogs.com/master/{master_id}'
                print(f"Master ID: {master_id}")
                print(f"Master URL: {master_url}")
                
                # Get tracklist from master
                if hasattr(master, 'tracklist') and master.tracklist:
                    tracklist = [
                        {
                            'position': track.position,
                            'title': track.title,
                            'duration': track.duration
                        }
                        for track in master.tracklist
                    ]
                    print(f"Found {len(tracklist)} tracks in master tracklist")
                
                # Get genres and styles from master (highest priority)
                if hasattr(master, 'genres'):
                    main_genres = master.genres
                    print(f"Master genres: {main_genres}")
                if hasattr(master, 'styles'):
                    main_styles = master.styles
                    print(f"Master styles: {main_styles}")
            else:
                print("No master release found for current release.")
        except Exception as e:
            print(f"Error getting master release: {e}")
        
        print("\n--- Extracting Main/Original Release Data ---")
        # Get the main/original release data
        main_release = None
        original_release_id = None
        original_release_url = None
        original_country = None
        original_label = None
        original_catno = None
        original_release_date = None
        original_identifiers = []
        original_year = None
        
        all_credits_categorized = {}
        
        try:
            if master and hasattr(master, 'main_release'):
                print(f"Found main release ID: {master.main_release.id}")
                main_release = d.release(master.main_release.id)
                original_release_id = main_release.id
                original_release_url = f'https://www.discogs.com/release/{original_release_id}'
                print(f"Original release URL: {original_release_url}")
                
                # Get original country
                original_country = getattr(main_release, 'country', None)
                print(f"Original country: {original_country}")
                
                # Get original label and catno
                if hasattr(main_release, 'labels') and main_release.labels:
                    original_label = main_release.labels[0].name
                    original_catno = main_release.labels[0].catno
                    print(f"Original label: {original_label}, catno: {original_catno}")
                
                # Get original release date (full date if available)
                original_year = getattr(main_release, 'year', None)
                if hasattr(main_release, 'released'):
                    original_release_date = main_release.released
                    print(f"Original release date: {original_release_date}")
                elif original_year:
                    print(f"Original release year: {original_year}")
                
                # Get original identifiers
                if hasattr(main_release, 'identifiers'):
                    original_identifiers = [
                        {
                            'type': id_item.get('type'),
                            'value': id_item.get('value'),
                            'description': id_item.get('description')
                        }
                        for id_item in main_release.identifiers
                    ]
                
                # Get all credits from main release (priority 1)
                all_credits = []
                if hasattr(main_release, 'credits'):
                    print(f"Found main release credits: {[f'{c.name} ({c.role})' for c in main_release.credits]}")
                    all_credits.extend(main_release.credits)
                else:
                    print("No credits found in main release, checking current release...")
                
                # Get credits from main release tracklist
                if hasattr(main_release, 'tracklist'):
                    for track in main_release.tracklist:
                        track_title = track.title
                        if hasattr(track, 'credits') and track.credits:
                            print(f"Found track credits for {track_title}: {[f'{c.name} ({c.role})' for c in track.credits]}")
                            all_credits.extend(track.credits)
                        else:
                            print(f"Found track credits for {track_title}: []")
                
                # If no credits in main release, fall back to current release
                if not all_credits:
                    print("\nNo credits found in main release, checking current release...")
                    if hasattr(release, 'credits'):
                        print(f"Found current release credits: {[f'{c.name} ({c.role})' for c in release.credits]}")
                        all_credits.extend(release.credits)
                    
                    # Get credits from current release tracklist
                    if hasattr(release, 'tracklist'):
                        for track in release.tracklist:
                            track_title = track.title
                            if hasattr(track, 'credits') and track.credits:
                                print(f"Found track credits for {track_title}: {[f'{c.name} ({c.role})' for c in track.credits]}")
                                all_credits.extend(track.credits)
                            else:
                                print(f"Found track credits for {track_title}: []")
                
                # Categorize all credits using official Discogs list
                if all_credits:
                    all_credits_categorized = get_all_credits(all_credits)
                
                # Fallback: get genres and styles from main release if not in master
                if not main_genres and hasattr(main_release, 'genres'):
                    main_genres = main_release.genres
                    print(f"Main release genres: {main_genres}")
                if not main_styles and hasattr(main_release, 'styles'):
                    main_styles = main_release.styles
                    print(f"Main release styles: {main_styles}")
            else:
                print("No main release available")
                # Use current release data as original
                original_release_id = current_release_id
                original_release_url = f'https://www.discogs.com/release/{original_release_id}'
                original_country = current_country
                original_label = current_label
                original_catno = current_catno
                original_year = current_release_year
                original_identifiers = current_identifiers
                
                # Get all credits from current release
                all_credits = []
                if hasattr(release, 'credits'):
                    print(f"Found current release credits: {[f'{c.name} ({c.role})' for c in release.credits]}")
                    all_credits.extend(release.credits)
                
                # Get credits from current release tracklist
                if hasattr(release, 'tracklist'):
                    for track in release.tracklist:
                        track_title = track.title
                        if hasattr(track, 'credits') and track.credits:
                            print(f"Found track credits for {track_title}: {[f'{c.name} ({c.role})' for c in track.credits]}")
                            all_credits.extend(track.credits)
                        else:
                            print(f"Found track credits for {track_title}: []")
                
                # Categorize all credits
                if all_credits:
                    all_credits_categorized = get_all_credits(all_credits)
        except Exception as e:
            print(f"Error getting main/original release info: {e}")
            import traceback
            traceback.print_exc()
        
        # Final fallback for genres and styles (from current release)
        if not main_genres:
            main_genres = getattr(release, 'genres', [])
        if not main_styles:
            main_styles = getattr(release, 'styles', [])
        
        print(f"\nFinal genres (priority: master→main→current): {main_genres}")
        print(f"Final styles (priority: master→main→current): {main_styles}")
        print(f"Final country (priority: original→current): {original_country or current_country}")
        
        # Format the data
        data = {
            'artist': artist_name,
            'album': release.title,
            'year': original_year,  # Original year (from main release or master)
            'label': original_label,  # Original label
            'genres': main_genres,  # Priority: master → main → current
            'styles': main_styles,  # Priority: master → main → current
            'country': original_country,  # Original country
            'master_id': master_id,
            'master_url': master_url,
            'tracklist': tracklist,  # From master
            'original_release_id': original_release_id,
            'original_release_url': original_release_url,
            'original_catno': original_catno,
            'original_release_date': original_release_date,
            'original_identifiers': original_identifiers,
            'musicians': all_credits_categorized,  # Store categorized credits in musicians field (JSONB)
            'current_release_id': current_release_id,
            'current_release_url': f'https://www.discogs.com/release/{current_release_id}',
            'current_release_year': str(current_release_year) if current_release_year else None,
            'current_release_date': getattr(release, 'released', None),
            'current_release_format': current_release_format,
            'current_label': current_label,
            'current_catno': current_catno,
            'current_country': current_country,
            'current_identifiers': current_identifiers,
            'barcode': None,  # Will be set by caller if applicable
            'added_from': added_from
        }
        
        print(f"\nFormatted data added_from value: {data['added_from']}")
        
        # Count populated fields
        populated = sum(1 for v in data.values() if v is not None and v != [] and v != {})
        print(f"Total fields populated: {populated}/{len(data)}")
        
        return data

    except Exception as e:
        print(f"Error formatting release data: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def lookup_release_by_url(url: str, added_from: str = 'discogs_url') -> Optional[Dict[str, Any]]:
    """Look up a Discogs release by URL and format the data"""
    try:
        # Extract release ID from URL
        release_id = url.split('/release/')[-1].split('-')[0]
        print(f"Looking up release ID: {release_id}")
        
        release = d.release(release_id)
        return format_release_data(release, added_from=added_from)
    except Exception as e:
        print(f"Error looking up release: {e}")
        return None


def lookup_master_by_url(url: str, added_from: str = 'discogs_url') -> Optional[Dict[str, Any]]:
    """Look up a Discogs master by URL and format the data"""
    try:
        # Extract master ID from URL
        master_id = url.split('/master/')[-1].split('-')[0]
        print(f"Looking up master ID: {master_id}")
        
        master = d.master(master_id)
        
        # Get the main release from the master
        if hasattr(master, 'main_release'):
            release = master.main_release
            return format_release_data(release, added_from=added_from)
        else:
            print("No main release found for master")
            return None
    except Exception as e:
        print(f"Error looking up master: {e}")
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
