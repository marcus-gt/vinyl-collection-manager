# Discogs API: Available Data Fields

This document summarizes the data fields available from the Discogs API for Master Releases and Specific Releases, based on inspection of:
- **Master**: https://www.discogs.com/master/5460-Miles-Davis-Kind-Of-Blue
- **Specific Release**: https://www.discogs.com/release/25700638-Miles-Davis-Kind-Of-Blue

---

## Master Release Fields

**Direct Attributes:**
- `id` - Master release ID
- `title` - Album title
- `year` - Original release year
- `genres` - Array of genre strings
- `styles` - Array of style strings
- `images` - Array of image objects (same structure as specific release)
- `tracklist` - Array of track objects
- `videos` - Array of video objects
- `data_quality` - Data quality rating
- `main_release` - **Reference to the main/original release object** (this is a full Release object)
- `versions` - Paginated list of all versions/pressings
- `url` - Discogs web URL
- `changes` - Tracking changes
- `data` - Raw API data dictionary
- `client` - API client reference
- `previous_request` - Previous API request URL

**Via main_release (the original pressing):**
The `main_release` is a full Release object, so you can access ALL specific release fields through it:
- `main_release.labels` - **Original release labels** (array with name, catno, etc.)
- `main_release.country` - Original release country
- `main_release.formats` - Original release format
- `main_release.credits` - Original release credits
- `main_release.year` - Original release year
- `main_release.identifiers` - Original barcodes/matrix codes
- And all other release fields...

### Images
- `images` - Array of image objects with:
  - `type` - "primary" or "secondary"
  - `uri` - Full size image URL
  - `uri150` - 150px thumbnail URL
  - `width` - Image width
  - `height` - Image height
  - `resource_url` - API resource URL

### Tracklist
- `tracklist` - Array of track objects with:
  - `position` - Track position (e.g., "A1", "B2")
  - `title` - Track title
  - `duration` - Track duration
  - `type_` - Track type
  - `credits` - Track-level credits (for musicians on specific tracks)

### Videos
- `videos` - Array of video objects with:
  - `uri` - Video URL (YouTube, etc.)
  - `title` - Video title
  - `description` - Video description
  - `duration` - Video duration
  - `embed` - Whether video can be embedded

---

## Specific Release Fields

**Complete list of direct attributes:**
- `id` - Release ID
- `title` - Album title
- `year` - Release year
- `artists` - Array of artist objects
- `artists_sort` - Sorted artist names
- `labels` - **Array of label objects** (name, catno, id, etc.)
- `genres` - Array of genre strings
- `styles` - Array of style strings
- `formats` - Array of format objects
- `country` - Country of release
- `credits` - Array of credit objects (musicians, producers, etc.)
- `tracklist` - Array of track objects
- `images` - Array of image objects
- `videos` - Array of video objects
- `companies` - Array of company objects (pressed by, manufactured by, etc.)
- `identifiers` - Array of identifier objects (barcodes, matrix codes)
- `community` - Community stats object (rating, have, want)
- `marketplace_stats` - Marketplace statistics
- `price_suggestions` - Price suggestion data
- `master` - Reference to master release
- `notes` - Release-specific notes
- `status` - Release status
- `thumb` - Thumbnail URL
- `data_quality` - Data quality rating
- `url` - Discogs web URL
- `changes` - Tracking changes
- `data` - Raw API data dictionary
- `client` - API client reference
- `previous_request` - Previous API request URL

### Detailed Breakdown:

### Release-Specific Information
- `country` - Country of release
- `released` - Full release date (if available)
- `notes` - Release-specific notes/description
- `released_formatted` - Formatted release date string
- `date_added` - When added to Discogs database
- `date_changed` - When last modified in Discogs database

### Labels & Catalog Numbers
- `labels` - Array of label objects with:
  - `name` - Label name
  - `catno` - Catalog number
  - `entity_type` - "Label" or similar
  - `id` - Label ID
  - `resource_url` - API URL for label
  - `thumbnail_url` - Label logo thumbnail

### Formats
- `formats` - Array of format objects with:
  - `name` - Format name (e.g., "Vinyl", "CD")
  - `qty` - Quantity (e.g., "1", "2")
  - `descriptions` - Array of descriptions (e.g., ["LP", "Album", "Reissue", "180 Gram"])
  - `text` - Additional format text (e.g., "180 Gram, Label Variant")

### Identifiers
- `identifiers` - Array of identifier objects with:
  - `type` - Type (e.g., "Barcode", "Matrix / Runout")
  - `value` - Identifier value
  - `description` - Additional description

### Companies & Credits
- `companies` - Array of company objects with:
  - `name` - Company name
  - `entity_type` - Type (e.g., "Manufactured By", "Pressed By")
  - `catno` - Catalog number (if applicable)
  - `resource_url` - API URL

### Series
- `series` - Array of series this release belongs to

### Community Data
- `community` - Object with:
  - `rating` - Community rating (average)
  - `want` - Number of users who want it
  - `have` - Number of users who have it
  - `contributors` - Number of contributors
  - `submitter` - User who submitted it
  - `data_quality` - Data quality rating

### Marketplace
- `marketplace_stats` - Market statistics object with details on current listings
- `estimated_weight` - Estimated shipping weight (in grams)

### Status
- `status` - Release status (e.g., "Accepted", "Draft")
- `thumb` - Thumbnail URL

---

## Currently Used Fields in Your App

Based on `discogs_lookup.py`, you're currently extracting:
- ✅ `artist` - Artist name(s)
- ✅ `album` - Release title
- ✅ `year` - Original release year (from master)
- ✅ `label` - Label name(s)
- ✅ `genres` - Genre array
- ✅ `styles` - Style array
- ✅ `musicians` - Credits (filtered for musical roles)
- ✅ `master_url` - Master release URL
- ✅ `master_format` - Format from master release
- ✅ `current_release_url` - Specific release URL
- ✅ `current_release_year` - Year of specific release
- ✅ `current_release_format` - Format of specific release
- ✅ `country` - Country of release
- ✅ `added_from` - Source (internal field)
- ✅ `barcode` - Barcode (internal field)

---

## Potential New Fields to Add

### High Value / Easy to Add
1. **`released`** - Full release date (more specific than just year)
2. **`catalog_number`** - Label catalog number (e.g., "DOL725H")
3. **`identifiers`** - Barcodes, matrix/runout codes
4. **`notes`** - Release-specific notes/description
5. **`community.rating`** - Average community rating
6. **`community.have`** - How many users have it (collectability indicator)
7. **`community.want`** - How many users want it (desirability indicator)
8. **`marketplace_stats`** - Current market activity
9. **`lowest_price`** - Current lowest market price
10. **`num_for_sale`** - Number of copies for sale
11. **`images`** - Cover art and additional images
12. **`videos`** - Related videos (performances, etc.)
13. **`tracklist`** - Full tracklist with durations
14. **`companies`** - Who manufactured, pressed, distributed
15. **`series`** - Part of which series (e.g., "Blue Note Classic Vinyl Series")

### Interesting but More Complex
16. **`credits` (detailed)** - More granular credit info with ANV, join phrases
17. **`estimated_weight`** - Useful for shipping calculations
18. **`label` details** - Label logo, profile, parent label, sublabels

---

## Example Use Cases

### 1. Enhanced Record Details
Add catalog number, release date, and identifiers to give users more complete information.

### 2. Collection Value Tracking
Use `community.rating`, `lowest_price`, and `marketplace_stats` to show collection value.

### 3. Rarity/Desirability Indicators
Use `community.have` and `community.want` to show how rare or sought-after a release is.

### 4. Visual Enhancement
Display album artwork from `images` array.

### 5. Media Library
Include `videos` and `tracklist` for a richer media experience.

### 6. Manufacturing Details
Show `companies` data for pressing plants, distributors (of interest to collectors).

---

## Implementation Priority Recommendation

**Phase 1 (Quick Wins)**
- Catalog number (`labels[0].catno`)
- Full release date (`released`)
- Images (`images[0].uri`)
- Community rating (`community.rating`)

**Phase 2 (Value Adds)**
- Marketplace data (`lowest_price`, `num_for_sale`)
- Desirability metrics (`community.have`, `community.want`)
- Identifiers (barcodes, matrix codes)

**Phase 3 (Rich Features)**
- Tracklist
- Videos
- Companies/manufacturing details
- Release notes

