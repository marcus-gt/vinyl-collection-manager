import sys
import os
from pathlib import Path

# Add the parent directory to sys.path
parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from discogs_lookup import (
    lookup_by_barcode,
    search_by_discogs_id,
    lookup_by_discogs_url,
    search_by_artist_album,
    get_price_suggestions,
    get_artist_info,
    get_label_info
)

from discogs_data import (
    get_album_data_from_id,
    extract_master_id
)

lookup = {
    'byBarcode': lookup_by_barcode,
    'byDiscogsId': search_by_discogs_id,
    'byDiscogsUrl': lookup_by_discogs_url,
    'byArtistAlbum': search_by_artist_album
}

records = {
    'add': lambda data: {'success': True, 'data': data},  # Placeholder, will be replaced by actual implementation
    'getAll': lambda: {'success': True, 'data': []},  # Placeholder, will be replaced by actual implementation
    'delete': lambda id: {'success': True}  # Placeholder, will be replaced by actual implementation
}
