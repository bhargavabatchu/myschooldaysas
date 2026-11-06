---
name: Campus Live school highlight photos
description: Privacy and access rules for photos posted to the school highlights feed.
---

Store highlight photos in private Replit App Storage, never as public URLs or in browser-persistent storage. Serve each photo through the authenticated API only after checking the same organization and school/class/section audience rules as its highlight. Require an administrator to confirm permission before publishing a photo of students.

**Why:** the highlights feed may include identifiable children, so access must follow the post audience and the school must confirm permission before sharing.

**How to apply:** keep storage objects private; do not put access tokens in URLs; do not cache the photo response; verify authorization on every photo request.

**SDK note:** In the current Replit App Storage JavaScript SDK runtime, `downloadAsBytes()` returned a one-element array containing a `Buffer`, although its TypeScript declaration says it returns a `Buffer`.

**Why:** serving the array directly would produce an invalid image response despite successful uploads.

**How to apply:** normalize the downloaded value to its contained byte buffer before sending it as an HTTP image response.
