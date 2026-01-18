# Video Player

The EpicShop video player provides a rich, interactive video experience with
keyboard shortcuts, transcripts, and seamless integration with Epic Web content.

## Components

### `<EpicVideo />` Component

The `<EpicVideo />` component is the main video player that can be used in MDX
files to embed Epic Web videos with enhanced features.

#### Basic Usage

```mdx
<EpicVideo url="https://epicweb.dev/workshops/react-hooks/01.problem.basic" />
```

#### Props

- `url` (required): The URL of the Epic Web video
- `title` (optional): Custom title for the video. If not provided, the title
  will be extracted from the URL (best effort)

#### Examples

```mdx
<!-- Basic video with auto-extracted title -->

<EpicVideo url="https://epicweb.dev/workshops/react-hooks/01.problem.basic" />

<!-- Video with custom title -->

<EpicVideo
	url="https://epicweb.dev/workshops/react-hooks/01.problem.basic"
	title="Custom Video Title"
/>
```

#### Features

- **Automatic Title Extraction**: Semi-intelligently extracts readable titles
  from Epic Web URLs
- **Transcript Support**: Displays interactive transcripts with clickable
  timestamps
- **Mux Integration**: Uses Mux for high-quality video playback
- **Theme Support**: Automatically adapts to light/dark themes
- **Offline Handling**: Graceful fallback when offline
- **Offline Downloads (Local)**: Optional bulk downloads from Preferences for
  offline playback, encrypted at rest, with toast errors on failures
- **Region Restrictions**: Handles region-restricted content with upgrade
  prompts

### `<VideoEmbed />` Component

A generic video embed component for iframe-based video content.

#### Props

- `url` (required): The iframe source URL
- `title` (optional): Title for accessibility
- `loadingContent` (optional): Custom loading content

Works with YouTube, etc.

## Keyboard Shortcuts

The video player supports comprehensive keyboard shortcuts for enhanced user
experience:

Tip: Press `?` or use the question mark icon in the app navigation to open the
full shortcuts list.

### Playback Controls

- **Space** or **k**: Play/pause video
- **j**: Seek backward 10 seconds
- **l**: Seek forward 10 seconds
- **Left Arrow**: Seek backward 10 seconds
- **Right Arrow**: Seek forward 10 seconds

### Frame-by-Frame Navigation

- **Comma (,)** (when paused): Go to previous frame
- **Period (.)** (when paused): Go to next frame

### Volume Control

- **Up Arrow**: Increase volume by 10%
- **Down Arrow**: Decrease volume by 10%

### Playback Speed

- **Shift + >**: Increase playback speed
- **Shift + <**: Decrease playback speed

### Fullscreen and Picture-in-Picture

- **f**: Toggle fullscreen mode
- **i**: Toggle picture-in-picture mode

### Captions

- **c**: Toggle captions/subtitles

### Quick Seek

- **0-9**: Seek to percentage of video (0 = 0%, 1 = 10%, ..., 9 = 90%)

### Smart Focus Handling

The keyboard shortcuts are intelligently handled:

- Shortcuts are ignored when focus is on interactive elements (inputs, buttons,
  etc.)
- When multiple video players are present, shortcuts control the focused player
- If no player has focus, shortcuts control the first player on the page
- Meta/Ctrl key combinations are ignored to prevent conflicts with browser
  shortcuts

## Error Handling

The video player gracefully handles various error scenarios:

- **Region Restrictions**: Shows upgrade prompts for restricted content
- **Authentication Errors**: Provides login/upgrade links
- **Network Issues**: Shows offline indicators
- **Offline Download Failures**: Shows toast errors and logs via
  `NODE_DEBUG=epic:offline-videos`
- **Invalid URLs**: Displays error messages
- **Missing Transcripts**: Falls back to basic video embed

## Integration with Epic Web

The video player is specifically designed to work with Epic Web content:

- Automatically extracts titles from Epic Web URLs
- Handles special URL patterns for different Epic Web domains
- Integrates with Epic Web authentication and licensing
- Supports both problem and solution video variants
- Provides seamless fallbacks for different access levels
