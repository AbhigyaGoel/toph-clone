# Recording audio

Drop one file per worker here, named after the worker who dictated the log:

```
public/audio/isaac-wang.mp3
public/audio/maya-patel.m4a
public/audio/Noah Brown.wav
```

Spelling, case and separators do not matter — `isaac-wang`, `isaac_wang` and
`Isaac Wang` all match the employee `Isaac Wang`. Playable extensions are
`.mp3 .m4a .wav .ogg .webm .aac .flac`.

Then point the database at them:

```bash
node scripts/attach-audio.mjs           # dry run — prints what it would set
node scripts/attach-audio.mjs --apply   # writes recordings.audio_url
```

The script needs `SUPABASE_SECRET_KEY` in `.env.local`, because `audio_url` is a
write and the anonymous key is read-only.

Until a file is attached, the expanded panel's transport reads
"Recording unavailable" and disables itself rather than pretending to play. The
waveform still renders — it is stored amplitude data on the recording row, not
something decoded from the file — so the panel looks right either way, and the
playhead starts working the moment a file lands.
