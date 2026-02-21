# Deep Linking Functionality

This website now supports deep linking to specific pages using URL hash parameters.

## How to Use Deep Links

### Link to a Specific Manual
To link directly to a manual from the index page:
```
http://yoursite.com/#manual=HRN113-001
```

### Link to a Specific Page within a Manual
To link to a specific page within a manual:
```
http://yoursite.com/HRN113-001.html#page=1-05
```

This will open the HRN113-001 manual and automatically navigate to chapter 1, page 05.

### Link to Both Manual and Page from Index
You can also link from the index page directly to a specific page:
```
http://yoursite.com/#manual=HRN113-001&page=1-05
```

This will navigate from the index page to the HRN113-001 manual and show page 1-05.

## URL Parameter Format

- **Manual ID**: Use the exact manual identifier (e.g., `HRN113-001`, `HRN113-002`, `HRN737-012`, `HRN737-018`)
- **Page Reference**: Use the format `chapter-page` where:
  - `chapter` is the chapter number (0, 1, 2, 3, etc., or A, B for appendices)
  - `page` is the page number within that chapter (01, 02, 03, etc.)

## Examples

1. Link to HRN113-001 manual: `#manual=HRN113-001`
2. Link to page 2-15 in HRN113-001: `HRN113-001.html#page=2-15`
3. Link to page A-03 in HRN737-012: `HRN737-012.html#page=A-03`
4. Link from index to specific page: `#manual=HRN737-018&page=3-10`

## How It Works

- The system automatically parses URL hash parameters when pages load
- When navigating within a manual, the URL is automatically updated to reflect the current page
- The browser's back/forward buttons work with the page navigation
- Links can be shared and bookmarked for direct access to specific content

## Browser Compatibility

This functionality works in all modern browsers that support:
- `window.location.hash`
- `hashchange` events
- `URLSearchParams` API